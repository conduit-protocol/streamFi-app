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
 * - Circuit breaker pattern: after consecutive failures, back off RPC calls
 */

import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  xdr,
} from '@stellar/stellar-sdk';
import { getRpcUrl, getNetworkPassphrase } from './env';
import {
  withIdempotency,
  normalizeError,
  OperationAbortedError,
} from './safe-operations';

// ── Config ────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 5000;
const DEFAULT_TIMEOUT_MS = 30_000; // 30s per pipeline stage
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 30;

// Circuit breaker state
let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function resetCircuitBreaker(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
}

function isCircuitOpen(): boolean {
  if (circuitOpenUntil > Date.now()) return true;
  if (circuitOpenUntil > 0 && circuitOpenUntil <= Date.now()) {
    resetCircuitBreaker();
  }
  return false;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= 3) {
    // Open circuit for 10s * 2^(failures-3) ms with jitter
    const base = 10_000 * Math.pow(2, consecutiveFailures - 3);
    const jitter = Math.random() * 0.3 * base;
    circuitOpenUntil = Date.now() + base + jitter;
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
}

// ── Retry / Backoff ───────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options?: {
    context?:   string;
    signal?:    AbortSignal;
    maxRetries?: number;
  },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options?.signal?.aborted) {
      throw new OperationAbortedError('Operation aborted during retry');
    }

    // Check circuit breaker before making the call
    if (isCircuitOpen()) {
      throw new Error(
        `Circuit breaker open — too many consecutive failures. ` +
        `Retry in ${Math.ceil((circuitOpenUntil - Date.now()) / 1000)}s.`,
      );
    }

    try {
      const result = await fn(attempt + 1);
      // Success — reset circuit breaker
      resetCircuitBreaker();
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
        throw err;
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        BASE_RETRY_MS * Math.pow(2, attempt) + Math.random() * 500,
        MAX_RETRY_MS,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

// ── Timeout wrapper ───────────────────────────────────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  context?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        context
          ? new Error(`${context} timed out after ${ms}ms`)
          : new Error(`Operation timed out after ${ms}ms`),
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
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
 * @returns          Transaction hash
 */
export async function invokeContract(
  source:     string,
  contractId: string,
  method:     string,
  args:       xdr.ScVal[],
  signTx:     (xdrBase64: string, signal?: AbortSignal) => Promise<string>,
  options?:   InvokeContractOptions,
): Promise<string> {
  const signal = options?.signal;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idempotencyKey = options?.idempotencyKey;

  // If an idempotency key is provided, deduplicate
  const operation = async (): Promise<string> => {
    if (signal?.aborted) throw new OperationAbortedError();

    return withRetry(async () => {
      if (signal?.aborted) throw new OperationAbortedError();

      const passphrase = getNetworkPassphrase();

      const account = await withTimeout(
        getServer().getAccount(source),
        timeoutMs,
        'getAccount',
      );
      if (signal?.aborted) throw new OperationAbortedError();

      const contract = new Contract(contractId);
      const tx = new TransactionBuilder(account, {
        fee:                BASE_FEE,
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
      );
      if (signal?.aborted) throw new OperationAbortedError();

      if (SorobanRpc.Api.isSimulationError(simResult)) {
        throw new Error(`Simulation failed: ${simResult.error}`);
      }

      // Assemble
      const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
      const xdrBase64 = assembled.toEnvelope().toXDR('base64');

      // Sign via wallet (pass signal for cancellation)
      const signedXdr = await signTx(xdrBase64, signal);
      if (signal?.aborted) throw new OperationAbortedError();

      const signedTx  = TransactionBuilder.fromXDR(signedXdr, passphrase);

      // Submit
      const sendResult = await withTimeout(
        getServer().sendTransaction(signedTx),
        timeoutMs,
        'sendTransaction',
      );
      if (signal?.aborted) throw new OperationAbortedError();

      if (sendResult.status === 'ERROR') {
        throw new Error(`Submission failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      // Poll with cancellation support
      const hash = sendResult.hash;
      for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
        if (signal?.aborted) throw new OperationAbortedError();

        await sleep(POLL_INTERVAL_MS);
        if (signal?.aborted) throw new OperationAbortedError();

        const status = await withTimeout(
          getServer().getTransaction(hash),
          timeoutMs,
          'getTransaction',
        );

        if (status.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return hash;
        if (status.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
          // Non-retryable — transaction executed and failed on-chain
          recordFailure();
          throw new Error(`Transaction failed: ${hash}`);
        }
        // status === 'NOT_FOUND' — keep polling
      }
      throw new Error(`Transaction timed out after ${MAX_POLL_ATTEMPTS}s: ${hash}`);
    }, {
      context: `invokeContract(${method})`,
      signal,
    });
  };

  if (idempotencyKey) {
    return withIdempotency(idempotencyKey, operation);
  }
  return operation();
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

  if (signal?.aborted) throw new OperationAbortedError();

  return withRetry(async () => {
    const account  = await withTimeout(
      getServer().getAccount(source),
      timeoutMs,
      'simulateReadOnly/getAccount',
    );
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee:             BASE_FEE,
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
    );

    if (signal?.aborted) throw new OperationAbortedError();

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`Simulation error: ${result.error}`);
    }
    const retval = result.result?.retval;
    if (!retval) throw new Error('No result returned from simulation');

    return xdr.ScVal.fromXDR(retval.toXDR());
  }, {
    context: `simulateReadOnly(${method})`,
    signal,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/** Convert an i128 ScVal to bigint */
export function scValToI128(val: xdr.ScVal): bigint {
  const i128 = val.i128();
  const hi   = BigInt(i128.hi().toString());
  const lo   = BigInt(i128.lo().toString());
  return (hi << 64n) | lo;
}

/** Convert a u64 ScVal to bigint */
export function scValToU64(val: xdr.ScVal): bigint {
  return BigInt(val.u64().toString());
}
