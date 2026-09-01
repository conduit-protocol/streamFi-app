/**
 * Soroban client helpers for conduit-app.
 *
 * Thin wrappers around @stellar/stellar-sdk's SorobanRpc that handle
 * the simulate → assemble → sign → submit → poll pipeline.
 *
 * All signing goes through the WalletContext `signTx` callback so this
 * module never holds key material.
 *
 * Concurrency & Error Handling:
 * ──────────────────────────────
 * - All RPC calls support AbortSignal for cancellation
 * - Exponential backoff with jitter for transient failures
 * - Timeout enforcement for each pipeline stage
 * - Idempotency key integration via safe-operations
 * - Circuit breaker pattern: after consecutive transport failures, back off
 * - Inclusion fees priced from getFeeStats() rather than pinned to BASE_FEE
 * - Sign + submit happen exactly once; only polling is retried
 */

import {
  Contract,
  Keypair,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk';
import { getRpcUrl, getNetworkPassphrase, getFeeMultiplier } from './env';
import {
  withIdempotency,
  normalizeError,
  OperationAbortedError,
} from './safe-operations';
import { withTimeout } from './with-timeout';
import { isValidStellarContract, isValidStellarPublicKey } from './stellar-address';
import { reportRpcFailure, reportRpcSuccess } from './network-status';

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30_000; // 30s per pipeline stage
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;
const FEE_STATS_TTL_MS = 30_000;   // fee stats are ledger-scoped; 30s is plenty
const MAX_INCLUSION_FEE = 1_000_000; // 0.1 XLM — never bid more than this

// Circuit breaker state scoped per-endpoint
interface CircuitState {
  consecutiveFailures: number;
  circuitOpenUntil: number;
}

/** A per-scope circuit-breaker snapshot returned by {@link getCircuitBreakerStates}. */
export interface CircuitBreakerState {
  /** The circuit key: the RPC URL, optionally suffixed with `::<scope>`. */
  scope: string;
  consecutiveFailures: number;
  circuitOpenUntil: number;
  /** True while `circuitOpenUntil` is still in the future. */
  isOpen: boolean;
  /** Milliseconds until the circuit half-opens, or 0 when closed. */
  remainingMs: number;
}

const circuitBreakers = new Map<string, CircuitState>();

function getCircuitKey(scope?: string): string {
  let rpcUrl = '';
  try {
    rpcUrl = getRpcUrl();
  } catch {
    rpcUrl = 'default';
  }
  return scope ? `${rpcUrl}::${scope}` : rpcUrl;
}

function getCircuitState(key: string): CircuitState {
  let state = circuitBreakers.get(key);
  if (!state) {
    state = { consecutiveFailures: 0, circuitOpenUntil: 0 };
    circuitBreakers.set(key, state);
  }
  return state;
}

/**
 * Reset circuit breaker state for a specific scope/endpoint, or all if none provided.
 * Useful on wallet disconnect, network switch, or after manual retry.
 */
export function resetCircuitBreaker(scope?: string): void {
  // Any path that clears the breaker considers the RPC healthy — a successful
  // round-trip, an on-chain revert, or a wallet/network switch that starts
  // fresh. Clear the global "network trouble" banner to match.
  reportRpcSuccess();
  if (scope) {
    const key = getCircuitKey(scope);
    circuitBreakers.delete(key);
    for (const k of circuitBreakers.keys()) {
      if (k === scope || k.startsWith(`${scope}::`) || k.startsWith(`${key}::`)) {
        circuitBreakers.delete(k);
      }
    }
  } else {
    circuitBreakers.clear();
  }
}

/**
 * Return a snapshot of every circuit breaker scope, sorted by scope name.
 */
export function getCircuitBreakerStates(): CircuitBreakerState[] {
  const now = Date.now();
  const entries: CircuitBreakerState[] = [];
  for (const [key, state] of circuitBreakers.entries()) {
    const isOpen = state.circuitOpenUntil > now;
    entries.push({
      scope: key,
      consecutiveFailures: state.consecutiveFailures,
      circuitOpenUntil: state.circuitOpenUntil,
      isOpen,
      remainingMs: isOpen ? Math.max(0, state.circuitOpenUntil - now) : 0,
    });
  }
  return entries.sort((a, b) => a.scope.localeCompare(b.scope));
}

/**
 * Check if the circuit breaker is open for a given scope/endpoint.
 */
export function isCircuitOpen(scope?: string): boolean {
  const key = getCircuitKey(scope);
  const state = circuitBreakers.get(key);
  if (!state) return false;
  if (state.circuitOpenUntil > Date.now()) return true;
  if (state.circuitOpenUntil > 0 && state.circuitOpenUntil <= Date.now()) {
    state.consecutiveFailures = 0;
    state.circuitOpenUntil = 0;
  }
  return false;
}

function recordFailure(scope?: string): void {
  const key = getCircuitKey(scope);
  const state = getCircuitState(key);
  state.consecutiveFailures++;
  if (state.consecutiveFailures >= 3) {
    // Open circuit for 10s * 2^(failures-3) ms with jitter
    const base = 10_000 * Math.pow(2, state.consecutiveFailures - 3);
    const jitter = Math.random() * 0.3 * base;
    state.circuitOpenUntil = Date.now() + base + jitter;
  }
}

/**
 * Errors that mean "the RPC/network misbehaved" — the only class of failure
 * the circuit breaker exists to protect against (see #283). An on-chain
 * revert is *not* one of them: the RPC worked perfectly, the contract simply
 * said no, so counting it toward the breaker locked users out of all RPC
 * (reads included) after a few legitimately-reverting calls (see #359).
 */
function isTransportFailure(err: unknown): boolean {
  if (err instanceof TransactionRevertedError) return false;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /timeout|timed out|network|fetch|ECONNREFUSED|ECONNRESET|socket|50\d\b|Service Unavailable|Bad Gateway/i
    .test(message);
}

/**
 * The transaction executed on-chain and the contract reverted
 * (NothingToWithdraw, StreamCancelled, InsufficientDeposit, …).
 *
 * Distinct from an RPC failure: it must never be retried and must never
 * count toward the circuit breaker.
 */
export class TransactionRevertedError extends Error {
  readonly hash: string;
  constructor(hash: string) {
    super(`Transaction failed: ${hash}`);
    this.name = 'TransactionRevertedError';
    this.hash = hash;
  }
}

// Lazily constructed: these pages are client-rendered and only ever call
// Soroban RPC from the browser, but Next.js still evaluates this module
// during the build's static-generation pass, before real env vars exist.
let serverInstance: SorobanRpc.Server | undefined;

function getServer(): SorobanRpc.Server {
  if (!serverInstance) {
    const rpcUrl = getRpcUrl();
    serverInstance = new SorobanRpc.Server(rpcUrl, {
      allowHttp: rpcUrl.startsWith('http://'),
    });
  }
  return serverInstance;
}

/**
 * Reset the RPC server instance — useful after network errors or config changes.
 */
export function resetServer(): void {
  serverInstance = undefined;
  feeStatsCache = undefined;
}

/** Test-only: clear the inclusion-fee cache so fee-stats tests are isolated. */
export function __clearFeeStatsCache(): void {
  feeStatsCache = undefined;
}

// ── Retry / Backoff ───────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: {
    context?:   string;
    signal?:    AbortSignal;
    maxRetries?: number;
    scope?:     string;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  const scope = options?.scope ?? options?.context;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options?.signal?.aborted) {
      throw new OperationAbortedError('Operation aborted during retry');
    }

    // Check circuit breaker before making the call
    if (isCircuitOpen(scope)) {
      const key = getCircuitKey(scope);
      const state = getCircuitState(key);
      reportRpcFailure();
      throw new Error(
        `Circuit breaker open — too many consecutive failures. ` +
        `Retry in ${Math.ceil((state.circuitOpenUntil - Date.now()) / 1000)}s.`,
      );
    }

    try {
      const result = await fn(attempt + 1);
      // Success — reset circuit breaker
      resetCircuitBreaker(scope);
      return result;
    } catch (err) {
      lastError = err;
      const normalized = normalizeError(err);

      // Don't retry non-retryable or aborted errors
      if (!normalized.retryable || normalized.code === 'OPERATION_ABORTED') {
        throw err;
      }

      // Don't retry on last attempt
      if (attempt >= maxRetries) {
        // Record failure for the circuit breaker only when the failure is
        // transport-level — an RPC timeout or network failure, the scenario
        // the breaker is designed to protect against (see #283). Anything
        // else (an on-chain revert, a malformed payload) leaves the breaker
        // untouched because the RPC itself is healthy (see #359).
        if (isTransportFailure(err)) {
          recordFailure(scope);
          // Surface the outage to the UI immediately — a single failed
          // round-trip is enough to show the banner, without waiting for the
          // breaker to trip after three.
          reportRpcFailure();
        }
        throw err;
      }

      // Exponential backoff with jitter
      const delay = Math.floor(
        Math.min(
          BASE_RETRY_MS * Math.pow(2, attempt) + Math.random() * 500,
          MAX_RETRY_MS,
        ),
      );
      await sleep(delay, options?.signal);
    }
  }

  throw lastError;
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

// `withTimeout` used to be reimplemented here; it now lives in
// lib/with-timeout.ts alongside the copies that had drifted out of
// app/create/page.tsx and contexts/WalletContext.tsx (#393). The signature is
// unchanged: withTimeout(promise, ms, context, signal).

function validateTimeout(ms: number): void {
  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new RangeError('Timeout must be a positive safe integer');
  }
}

function validateCall(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): void {
  if (!source || !contractId || !method || !Array.isArray(args)) {
    throw new TypeError('Invalid contract call arguments');
  }
}

// ── Fee pricing ───────────────────────────────────────────────────────────────

let feeStatsCache: { fee: number; at: number } | undefined;

/**
 * Price the inclusion (bid) fee for a contract transaction.
 *
 * `assembleTransaction` adds the Soroban *resource* fee, but the inclusion
 * fee stays at whatever the builder was given. Building at exactly BASE_FEE
 * (100 stroops) means the network minimum bid, which is not selected under
 * surge pricing — the submit-and-poll loop then ran to exhaustion and the
 * user saw a misleading "timed out" instead of "fee too low" (see #360).
 *
 * Reads `getFeeStats()` and bids `multiplier ×` the recent p70 Soroban
 * inclusion fee, with `multiplier × BASE_FEE` as the floor and a hard cap so
 * a misreporting node can never drain an account. Fee stats are cached for a
 * few ledgers, and any failure to read them falls back to the floor rather
 * than blocking the transaction.
 */
async function getInclusionFee(timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const multiplier = getFeeMultiplier();
  const floor = Math.ceil(Number(BASE_FEE) * multiplier);

  const cached = feeStatsCache;
  const recent = cached && Date.now() - cached.at < FEE_STATS_TTL_MS ? cached.fee : undefined;

  let observed = recent;
  if (observed === undefined) {
    try {
      const stats = await withTimeout(
        getServer().getFeeStats(),
        timeoutMs,
        'getFeeStats',
        signal,
      );
      const p70 = Number(stats?.sorobanInclusionFee?.p70 ?? stats?.sorobanInclusionFee?.mode);
      if (Number.isFinite(p70) && p70 > 0) {
        observed = p70;
        feeStatsCache = { fee: p70, at: Date.now() };
      }
    } catch (err) {
      // Fee stats are advisory — an endpoint that doesn't implement them (or
      // is momentarily unavailable) must not block the transaction.
      if (err instanceof OperationAbortedError) throw err;
    }
  }

  const bid = observed === undefined ? floor : Math.ceil(observed * multiplier);
  return String(Math.min(Math.max(bid, floor), MAX_INCLUSION_FEE));
}

// ── Core pipeline ─────────────────────────────────────────────────────────────

export interface InvokeContractOptions {
  /** AbortSignal for cancellation */
  signal?:       AbortSignal;
  /** Timeout per pipeline stage (default: 30s) */
  timeoutMs?:   number;
  /** Idempotency key — deduplicates concurrent identical calls */
  idempotencyKey?: string;
}

/** Result of a confirmed contract invocation. */
export interface InvokeContractResult {
  /** The submitted transaction's hash. */
  hash: string;
  /**
   * The contract function's return value, as reported by GetTransactionStatus
   * on SUCCESS. `undefined` if the confirmed transaction carried no retval
   * (e.g. the invoked function returns void).
   */
  returnValue?: xdr.ScVal;
}

/**
 * Build a contract-call transaction, simulate it to get the fee + footprint,
 * assemble it, hand it to the wallet for signing, then submit and poll.
 *
 * Supports cancellation via AbortSignal, retry with backoff, and optional
 * idempotency key deduplication.
 *
 * @param source     Stellar public key of the invoker
 * @param contractId Contract address (C…)
 * @param method     Function name
 * @param args       XDR ScVal arguments
 * @param signTx     Wallet sign callback from WalletContext (supports AbortSignal)
 * @param options    Optional abort signal, timeout, and idempotency key
 * @returns          Transaction hash — confirmed, or (if polling could not
 *                   reach a verdict in time) submitted-and-pending. Throws
 *                   `TransactionRevertedError` if the contract reverted.
 */
export async function invokeContract(
  source:     string,
  contractId: string,
  method:     string,
  args:       xdr.ScVal[],
  signTx:     (xdrBase64: string, signal?: AbortSignal) => Promise<string>,
  options?:   InvokeContractOptions,
): Promise<InvokeContractResult> {
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idempotencyKey = options?.idempotencyKey;

  validateCall(source, contractId, method, args);
  validateTimeout(timeoutMs);

  // If an idempotency key is provided, deduplicate
  const operation = async (): Promise<InvokeContractResult> => {
    if (signal?.aborted) throw new OperationAbortedError();

    const passphrase = getNetworkPassphrase();

    // Only the idempotent prefix — build + simulate + assemble — is retried.
    // Retrying past this point re-prompted the wallet and could put a second
    // transaction on-chain (a second stream, a second withdrawal) whenever a
    // poll hiccupped after a successful submit (see #358).
    const assembledXdr = await withRetry(async () => {
      if (signal?.aborted) throw new OperationAbortedError();

      const account = await withTimeout(
        getServer().getAccount(source),
        timeoutMs,
        'getAccount',
        signal,
      );
      if (signal?.aborted) throw new OperationAbortedError();

      const fee = await getInclusionFee(timeoutMs, signal);

      const contract = new Contract(contractId);
      const tx = new TransactionBuilder(account, {
        fee,
        networkPassphrase:  passphrase,
      })
        .addOperation(contract.call(method, ...args))
        .setTimeout(180)
        .build();

      // Simulate to get auth + footprint
      const simResult = await withTimeout(
        getServer().simulateTransaction(tx),
        timeoutMs,
        'simulateTransaction',
        signal,
      );
      if (signal?.aborted) throw new OperationAbortedError();

      if (SorobanRpc.Api.isSimulationError(simResult)) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      // Assemble
      const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
      return assembled.toEnvelope().toXDR('base64');
    }, {
      context: `invokeContract(${method})`,
      signal,
    });

    // Sign via wallet (pass signal for cancellation) — exactly once.
    const signedXdr = signal ? await signTx(assembledXdr, signal) : await signTx(assembledXdr);
    if (signal?.aborted) throw new OperationAbortedError();
    if (typeof signedXdr !== 'string' || !signedXdr) {
      throw new TypeError('Wallet returned an invalid signed transaction');
    }

    const signedTx = TransactionBuilder.fromXDR(signedXdr, passphrase);

    // Submit — exactly once. Past this line the transaction may already be
    // on-chain, so no failure may cause a rebuild or a resubmit.
    const sendResult = await withTimeout(
      getServer().sendTransaction(signedTx),
      timeoutMs,
      'sendTransaction',
      signal,
    );
    if (signal?.aborted) throw new OperationAbortedError();

    if (sendResult.status === 'ERROR') {
      throw new Error(`Submission failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    const hash = sendResult.hash;
    if (typeof hash !== 'string' || !hash) {
      throw new Error('Submission returned no transaction hash');
    }

    return pollForConfirmation(hash, timeoutMs, signal);
  };

  if (idempotencyKey) {
    return withIdempotency(idempotencyKey, operation);
  }
  return operation();
}

/**
 * Poll `getTransaction` until the submitted transaction resolves.
 *
 * Retries only the poll RPC itself — never the submission. If polling can't
 * reach a verdict (transient RPC errors, or the confirmation window elapsing)
 * the hash is returned as *pending* rather than replaying the transaction:
 * it is already on-chain and the caller can look it up (see #358).
 *
 * On SUCCESS the confirmed transaction's return value is surfaced so callers
 * like DripFactory::create_stream can obtain the assigned stream_id without
 * a separate re-query (see #362).
 */
async function pollForConfirmation(
  hash: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<InvokeContractResult> {
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    if (signal?.aborted) throw new OperationAbortedError();

    await sleep(POLL_INTERVAL_MS, signal);
    if (signal?.aborted) throw new OperationAbortedError();

    let status;
    try {
      status = await withTimeout(
        getServer().getTransaction(hash),
        timeoutMs,
        'getTransaction',
        signal,
      );
    } catch (err) {
      if (err instanceof OperationAbortedError) throw err;
      // A transient poll failure says nothing about the transaction — keep
      // polling. The circuit breaker is untouched: a single flaky read is
      // not the sustained RPC outage it guards against.
      continue;
    }

    if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      // The RPC round-trip completed — the network is healthy.
      resetCircuitBreaker();
      return { hash, returnValue: status.returnValue };
    }
    if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      // The transaction executed and the contract reverted. The RPC worked
      // fine, so this resets the breaker like a success does (see #359).
      resetCircuitBreaker();
      throw new TransactionRevertedError(hash);
    }
    // status === 'NOT_FOUND' — keep polling
  }

  // Submitted but unconfirmed within the window — pending, not failed.
  return { hash };
}

/**
 * Simulate a read-only contract call and return the decoded result.
 *
 * Supports cancellation via AbortSignal and retry with backoff.
 *
 * @param source     Any Stellar public key (just needs to exist on-chain)
 * @param contractId Contract address
 * @param method     Read-only function name
 * @param args       XDR ScVal arguments
 * @param options    Optional abort signal and timeout
 * @returns          Raw ScVal result
 */
export async function simulateReadOnly(
  source:     string,
  contractId: string,
  method:     string,
  args:       xdr.ScVal[],
  options?:   { signal?: AbortSignal; timeoutMs?: number },
): Promise<xdr.ScVal> {
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  validateCall(source, contractId, method, args);
  validateTimeout(timeoutMs);
  if (signal?.aborted) throw new OperationAbortedError();

  const account  = await withTimeout(
    getServer().getAccount(source),
    timeoutMs,
    'simulateReadOnly/getAccount',
    signal,
  );
  const fee = await getInclusionFee(timeoutMs, signal);
  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  if (signal?.aborted) throw new OperationAbortedError();

  const result = await withTimeout(
    getServer().simulateTransaction(tx),
    timeoutMs,
    'simulateTransaction',
    signal,
  );

  if (signal?.aborted) throw new OperationAbortedError();

  if (SorobanRpc.Api.isSimulationError(result)) {
    throw new Error(`Simulation error: ${result.error}`);
  }
  const retval = result.result?.retval;
  if (!retval) throw new Error('No result returned from simulation');

  return xdr.ScVal.fromXDR(retval.toXDR());
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError('Delay must be a non-negative safe integer');
  }
  if (signal?.aborted) return Promise.reject(new OperationAbortedError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(cleanupAndResolve, ms);
    const onAbort = () => {
      cleanup();
      reject(new OperationAbortedError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    function cleanupAndResolve() {
      cleanup();
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Convert an i128 ScVal to bigint */
export function scValToI128(val: xdr.ScVal): bigint {
  if (val.switch().name !== 'scvI128') {
    throw new Error(`Malformed RPC payload: expected i128, got ${val.switch().name}`);
  }
  const i128 = val.i128();
  const hi   = BigInt(i128.hi().toString());
  const lo   = BigInt(i128.lo().toString());
  return (hi << 64n) | lo;
}

/** Convert a u64 ScVal to bigint */
export function scValToU64(val: xdr.ScVal): bigint {
  if (val.switch().name !== 'scvU64') {
    throw new Error(`Malformed RPC payload: expected u64, got ${val.switch().name}`);
  }
  return BigInt(val.u64().toString());
}

/**
 * The ledger key whose presence proves a recipient address exists on-chain.
 *
 * - G… public key  → the account entry itself.
 * - C… contract    → the contract's instance entry, which every deployed
 *                    contract has and which is always persistent.
 *
 * Mirrors the keys `Server.getAccount()` / `Server.getContractData()` build
 * internally, so the lookup below is the same one — minus their habit of
 * rejecting with a `{ code: 404 }` object that the caller has to interpret.
 */
function recipientLedgerKey(address: string): xdr.LedgerKey {
  if (isValidStellarContract(address)) {
    return xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract:   new Contract(address).address().toScAddress(),
        key:        xdr.ScVal.scvLedgerKeyContractInstance(),
        durability: xdr.ContractDataDurability.persistent(),
      }),
    );
  }
  if (!isValidStellarPublicKey(address)) {
    throw new Error(`Not a valid Stellar address: ${address}`);
  }
  return xdr.LedgerKey.account(
    new xdr.LedgerKeyAccount({
      accountId: Keypair.fromPublicKey(address).xdrPublicKey(),
    }),
  );
}

/**
 * Check whether a Stellar address exists on-chain.
 *
 * Asks the RPC for the address's ledger entry directly: an empty `entries`
 * array is the ledger stating the address is not there, which is the only
 * evidence this function accepts for `false`. Anything that throws — a
 * transport failure, a JSON-RPC error, an HTTP 404 from a mistyped
 * `NEXT_PUBLIC_SOROBAN_RPC_URL`, a proxy error page — propagates as
 * "couldn't check".
 *
 * This used to be decided by substring-matching the error text for
 * "not found" or "404" (#391), which conflated three different things:
 * a genuinely missing account, `Method not found` from a wrong RPC version,
 * and a 404 from a broken RPC URL. The last two made the create form tell
 * the user "Recipient account not found" when the recipient was fine and
 * the RPC configuration was not. Worse, it never actually caught the case
 * it was written for: `getAccount()` rejects with a plain
 * `{ code: 404, message: … }` object, not an `Error`, so a real missing
 * account stringified to "[object Object]" and matched nothing.
 *
 * Accepts an optional AbortSignal so callers can cancel in-flight checks
 * (e.g. when the user changes the address or navigates away) and an optional
 * timeoutMs so a hung RPC provider never keeps the caller waiting forever.
 * Defaults to 10s if not specified.
 *
 * @param address    Stellar public key (G…) or contract address (C…)
 * @param options    Optional signal and timeout
 * @returns          `true` / `false` when the ledger answered; throws when it didn't
 */
// Brief negative cache for checkRecipientExists — mirrors SDK behaviour (#451).
const NEGATIVE_CACHE_TTL_MS = 5_000;
const recipientNegativeCache = new Map<string, number>();

export async function checkRecipientExists(
  address: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<boolean> {
  const timeoutMs = options?.timeoutMs ?? 10_000;

  if (options?.signal?.aborted) throw new OperationAbortedError();

  const cachedUntil = recipientNegativeCache.get(address);
  if (cachedUntil !== undefined && Date.now() < cachedUntil) {
    return false;
  }
  recipientNegativeCache.delete(address);

  const { entries } = await withTimeout(
    getServer().getLedgerEntries(recipientLedgerKey(address)),
    timeoutMs,
    'checkRecipientExists',
    options?.signal,
  );

  // A response without an `entries` array is a malformed payload, not proof
  // of absence — say so rather than reporting the recipient as nonexistent.
  if (!Array.isArray(entries)) {
    throw new Error('Malformed RPC payload: getLedgerEntries returned no entries array');
  }
  const exists = entries.length > 0;
  if (!exists) {
    recipientNegativeCache.set(address, Date.now() + NEGATIVE_CACHE_TTL_MS);
  }
  return exists;
}
