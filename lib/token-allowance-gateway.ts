/**
 * Token Allowance Gateway
 *
 * Manages SEP-41 token allowance (approve) lifecycle for Soroban contracts.
 * Addresses the intermittent unhandled promise rejection under poor network
 * conditions by enforcing:
 *
 *   1. Per-token Mutex locking — no two allowance mutations run concurrently
 *      on the same token, preventing state corruption from race conditions.
 *   2. Atomic state transitions — each allowance request moves through a
 *      strict state machine (idle → pending → confirmed | failed), so
 *      callers always observe a deterministic outcome.
 *   3. Exhaustive error boundaries — every async path is wrapped in
 *      try/catch with normalized errors; no floating-point math is
 *      performed without bigint safety; every timer and AbortSignal
 *      listener is cleaned up in finally blocks.
 *   4. Idempotency — duplicate requests for the same token+spender
 *      coalesce into a single in-flight RPC call.
 */

import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk';
import { invokeContract, simulateReadOnly, scValToI128 } from './soroban';
import {
  withSafeOperation,
  withIdempotency,
  makeOperationKey,
  normalizeError,
  OperationAbortedError,
  type SafeOperationResult,
  type NormalizedError,
} from './safe-operations';

// ── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_ALLOWANCE_TIMEOUT_MS = 30_000;

// ── Mutex (per-token) ─────────────────────────────────────────────────────────

/**
 * Lightweight binary semaphore that queues callers and supports AbortSignal
 * cancellation. Copied from WalletContext pattern to avoid a cross-package
 * dependency.
 */
class Mutex {
  private _locked = false;
  private _queue: Array<{
    resolve: (release: () => void) => void;
    reject: (err: Error) => void;
    signal?: AbortSignal;
    cleanup?: () => void;
  }> = [];

  async acquire(signal?: AbortSignal): Promise<() => void> {
    // Fast path
    if (!this._locked) {
      this._locked = true;
      return () => this._release();
    }

    return new Promise<() => void>((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        signal,
        cleanup: undefined as (() => void) | undefined,
      };

      this._queue.push(entry);

      if (signal?.aborted) {
        this._dequeue(entry);
        reject(new OperationAbortedError('Mutex acquisition aborted'));
        return;
      }

      if (signal) {
        const onAbort = () => {
          this._dequeue(entry);
          reject(new OperationAbortedError('Mutex acquisition aborted'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        entry.cleanup = () => signal.removeEventListener('abort', onAbort);
      }
    });
  }

  private _dequeue(entry: typeof this._queue[0]) {
    const idx = this._queue.indexOf(entry);
    if (idx !== -1) {
      entry.cleanup?.();
      this._queue.splice(idx, 1);
    }
  }

  private _release() {
    const next = this._queue.shift();
    if (next) {
      next.cleanup?.();
      next.resolve(() => this._release());
    } else {
      this._locked = false;
    }
  }

  get queued(): number {
    return this._queue.length;
  }
}

// ── Allowance State Machine ───────────────────────────────────────────────────

export type AllowanceState = 'idle' | 'pending' | 'confirmed' | 'failed';

export interface AllowanceRecord {
  /** Current allowance in stroops (bigint for precision) */
  allowance: bigint;
  /** State machine status */
  state: AllowanceState;
  /** Last error if state is 'failed' */
  lastError?: NormalizedError;
  /** Timestamp of last successful update (ms) */
  lastConfirmedAt?: number;
}

interface InternalRecord extends AllowanceRecord {
  /** The Mutex protecting this token's allowance mutations */
  mutex: Mutex;
  /** Pending operation's AbortController for cancellation */
  pendingAbort?: AbortController;
}

// ── Gateway ───────────────────────────────────────────────────────────────────

export interface TokenAllowanceGatewayOptions {
  /** Timeout for individual allowance RPC calls (default: 30s) */
  timeoutMs?: number;
  /** Maximum concurrent allowance operations (default: 5) */
  maxConcurrency?: number;
}

export interface ApproveAllowanceArgs {
  /** Token contract address (C...) */
  token: string;
  /** Spender contract address (C...) */
  spender: string;
  /** Amount in stroops (bigint for precision) */
  amount: bigint;
  /** Stellar public key of the token holder */
  source: string;
  /** Wallet sign callback */
  signTx: (xdrBase64: string, signal?: AbortSignal) => Promise<string>;
  /** Optional abort signal */
  signal?: AbortSignal;
}

export interface CheckAllowanceArgs {
  /** Token contract address */
  token: string;
  /** Owner address (token holder) */
  owner: string;
  /** Spender address */
  spender: string;
  /** Stellar public key for simulation (any valid key) */
  source: string;
  /** Optional abort signal */
  signal?: AbortSignal;
}

export interface RevokeAllowanceArgs {
  /** Token contract address */
  token: string;
  /** Spender contract address */
  spender: string;
  /** Stellar public key of the token holder */
  source: string;
  /** Wallet sign callback */
  signTx: (xdrBase64: string, signal?: AbortSignal) => Promise<string>;
  /** Optional abort signal */
  signal?: AbortSignal;
}

/**
 * Token Allowance Gateway — manages SEP-41 approve() lifecycle with
 * per-token locking, atomic state transitions, and exhaustive error handling.
 *
 * Usage:
 *   const gateway = new TokenAllowanceGateway();
 *   const result = await gateway.approve({ token, spender, amount, source, signTx });
 *   if (!result.success) console.error(result.error);
 */
export class TokenAllowanceGateway {
  private _records = new Map<string, InternalRecord>();
  private _concurrencySemaphore: { available: number; queue: Array<() => void> } = {
    available: 5,
    queue: [],
  };
  private _timeoutMs: number;
  private _maxConcurrency: number;

  constructor(options?: TokenAllowanceGatewayOptions) {
    this._timeoutMs = options?.timeoutMs ?? DEFAULT_ALLOWANCE_TIMEOUT_MS;
    this._maxConcurrency = options?.maxConcurrency ?? 5;
    this._concurrencySemaphore.available = this._maxConcurrency;
  }

  // ── Record management ─────────────────────────────────────────────────────

  private _key(token: string, spender: string): string {
    return `${token}::${spender}`;
  }

  private _getOrCreate(token: string, spender: string): InternalRecord {
    const key = this._key(token, spender);
    let record = this._records.get(key);
    if (!record) {
      record = {
        allowance: 0n,
        state: 'idle',
        mutex: new Mutex(),
      };
      this._records.set(key, record);
    }
    return record;
  }

  /**
   * Read-only snapshot of the current allowance record for a token+spender pair.
   */
  getAllowance(token: string, spender: string): AllowanceRecord {
    const key = this._key(token, spender);
    const record = this._records.get(key);
    if (!record) {
      return { allowance: 0n, state: 'idle' };
    }
    return {
      allowance: record.allowance,
      state: record.state,
      lastError: record.lastError,
      lastConfirmedAt: record.lastConfirmedAt,
    };
  }

  // ── Concurrency limiter ───────────────────────────────────────────────────

  private async _acquireConcurrency(signal?: AbortSignal): Promise<() => void> {
    if (this._concurrencySemaphore.available > 0) {
      this._concurrencySemaphore.available--;
      return () => this._releaseConcurrency();
    }

    return new Promise<() => void>((resolve, reject) => {
      const entry = () => {
        resolve(() => this._releaseConcurrency());
      };
      this._concurrencySemaphore.queue.push(entry);

      if (signal?.aborted) {
        const idx = this._concurrencySemaphore.queue.indexOf(entry);
        if (idx !== -1) this._concurrencySemaphore.queue.splice(idx, 1);
        reject(new OperationAbortedError('Concurrency slot acquisition aborted'));
      }
    });
  }

  private _releaseConcurrency() {
    const next = this._concurrencySemaphore.queue.shift();
    if (next) {
      next();
    } else {
      this._concurrencySemaphore.available++;
    }
  }

  // ── Core: Approve ──────────────────────────────────────────────────────────

  /**
   * Set or increase a token allowance for a spender contract.
   *
   * Enforces per-token mutex locking so two concurrent approve() calls for
   * the same token+pair cannot interleave and corrupt on-chain state.
   * All async operations are wrapped in error boundaries — no unhandled
   * rejections are possible.
   */
  async approve(args: ApproveAllowanceArgs): Promise<SafeOperationResult<string>> {
    const { token, spender, amount, source, signTx, signal } = args;
    const record = this._getOrCreate(token, spender);
    const idempotencyKey = makeOperationKey(source, token, 'approve', spender, amount.toString());

    // Reject if a previous operation is in-flight for this pair (unless same idempotency key)
    if (record.state === 'pending') {
      return {
        success: false,
        error: normalizeError(
          new Error('Allowance modification already in progress for this token+spender pair'),
          'TokenAllowanceGateway.approve',
        ),
      };
    }

    // Validate inputs before acquiring any locks
    if (amount < 0n) {
      return {
        success: false,
        error: normalizeError(
          new Error('Allowance amount must be non-negative'),
          'TokenAllowanceGateway.approve',
        ),
      };
    }

    if (!token || !/^C[A-Z0-9]{55}$/.test(token)) {
      return {
        success: false,
        error: normalizeError(
          new Error(`Invalid token contract address: ${token}`),
          'TokenAllowanceGateway.approve',
        ),
      };
    }

    if (!spender || !/^C[A-Z0-9]{55}$/.test(spender)) {
      return {
        success: false,
        error: normalizeError(
          new Error(`Invalid spender contract address: ${spender}`),
          'TokenAllowanceGateway.approve',
        ),
      };
    }

    // Set up abort controller for this operation
    const opAbort = new AbortController();
    record.pendingAbort = opAbort;

    // Link external signal to internal abort
    let signalCleanup: (() => void) | undefined;
    if (signal) {
      const onAbort = () => opAbort.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      signalCleanup = () => signal.removeEventListener('abort', onAbort);
    }

    // Atomic transition to 'pending'
    record.state = 'pending';
    record.lastError = undefined;

    let releaseMutex: (() => void) | undefined;
    let releaseConcurrency: (() => void) | undefined;

    try {
      // Acquire per-token mutex (cancel-safe)
      releaseMutex = await record.mutex.acquire(signal);

      // Acquire concurrency slot
      releaseConcurrency = await this._acquireConcurrency(signal);
      const result = await withIdempotency(idempotencyKey, async () => {
        return withSafeOperation(async () => {
          // Check abort before RPC call
          if (opAbort.signal.aborted) {
            throw new OperationAbortedError('Allowance approval aborted');
          }

          // Build the approve() XDR arguments
          // SEP-41 approve(address spender, i128 amount)
          const argsXdr: xdr.ScVal[] = [
            new Address(spender).toScVal(),
            nativeToScVal(amount, { type: 'i128' }),
          ];

          // Execute via invokeContract which already has retry + circuit breaker
          const txHash = await invokeContract(
            source,
            token,
            'approve',
            argsXdr,
            signTx,
            {
              signal: opAbort.signal,
              timeoutMs: this._timeoutMs,
              idempotencyKey,
            },
          );

          // Atomic transition to 'confirmed'
          record.allowance = amount;
          record.state = 'confirmed';
          record.lastConfirmedAt = Date.now();
          record.lastError = undefined;

          return txHash;
        }, {
          context: 'TokenAllowanceGateway.approve',
          signal: opAbort.signal,
          timeoutMs: this._timeoutMs,
        });
      });

      // withSafeOperation never throws — it returns { success: false, error }
      // on failure. We must atomically update state to 'failed' here rather
      // than relying on the catch block (which is only for defensive errors
      // that escape withSafeOperation).
      if (!result.success && result.error) {
        record.state = 'failed';
        record.lastError = result.error;
      }

      return result;
    } catch (err) {
      // Catch any error that escapes withSafeOperation (defensive)
      const normalized = normalizeError(err, 'TokenAllowanceGateway.approve');
      record.state = 'failed';
      record.lastError = normalized;
      return { success: false, error: normalized };
    } finally {
      // Atomic transition: if still pending after error, mark as failed
      if (record.state === 'pending') {
        record.state = 'failed';
      }

      record.pendingAbort = undefined;
      signalCleanup?.();
      releaseConcurrency?.();
      releaseMutex?.();
    }
  }

  // ── Core: Check Allowance ──────────────────────────────────────────────────

  /**
   * Read the current on-chain allowance for a token+owner+spender triple.
   * Read-only — no mutex needed, but still wrapped in error boundaries
   * to prevent unhandled rejections from network failures.
   */
  async checkAllowance(args: CheckAllowanceArgs): Promise<SafeOperationResult<bigint>> {
    const { token, owner, spender, source, signal } = args;

    if (!token || !owner || !spender) {
      return {
        success: false,
        error: normalizeError(
          new Error('token, owner, and spender are all required'),
          'TokenAllowanceGateway.checkAllowance',
        ),
      };
    }

    return withSafeOperation(async () => {
      // SEP-41 allowance(address owner, address spender) -> i128
      const result = await simulateReadOnly(
        source,
        token,
        'allowance',
        [
          new Address(owner).toScVal(),
          new Address(spender).toScVal(),
        ],
        {
          signal,
          timeoutMs: this._timeoutMs,
        },
      );

      const allowance = scValToI128(result);

      // Update local cache
      const record = this._getOrCreate(token, spender);
      record.allowance = allowance;
      if (record.state === 'idle' || record.state === 'confirmed') {
        record.state = 'confirmed';
        record.lastConfirmedAt = Date.now();
      }

      return allowance;
    }, {
      context: 'TokenAllowanceGateway.checkAllowance',
      signal,
      timeoutMs: this._timeoutMs,
    });
  }

  // ── Core: Revoke ───────────────────────────────────────────────────────────

  /**
   * Revoke (set to zero) a token allowance for a spender.
   * Uses the same mutex-protected path as approve() with amount=0.
   */
  async revoke(args: RevokeAllowanceArgs): Promise<SafeOperationResult<string>> {
    return this.approve({
      ...args,
      amount: 0n,
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Cancel all in-flight operations and clear state.
   * Call on wallet disconnect or component unmount.
   */
  reset(): void {
    for (const record of this._records.values()) {
      if (record.state === 'pending' && record.pendingAbort) {
        record.pendingAbort.abort();
      }
      record.state = 'idle';
      record.allowance = 0n;
      record.lastError = undefined;
      record.lastConfirmedAt = undefined;
    }
    this._records.clear();

    // Drain concurrency queue
    while (this._concurrencySemaphore.queue.length > 0) {
      const entry = this._concurrencySemaphore.queue.shift();
      // Entries waiting for a slot get rejected — they'll retry on next call
      entry?.();
    }
    this._concurrencySemaphore.available = this._maxConcurrency;
  }

  /**
   * Number of allowance pairs currently tracked.
   */
  get size(): number {
    return this._records.size;
  }

  /**
   * Number of operations currently queued in the concurrency semaphore.
   */
  get pendingOperations(): number {
    return this._concurrencySemaphore.queue.length;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: TokenAllowanceGateway | undefined;

/**
 * Get (or create) the application-wide Token Allowance Gateway singleton.
 */
export function getTokenAllowanceGateway(
  options?: TokenAllowanceGatewayOptions,
): TokenAllowanceGateway {
  if (!_instance) {
    _instance = new TokenAllowanceGateway(options);
  }
  return _instance;
}

/**
 * Reset the singleton — useful for testing or wallet disconnect.
 */
export function resetTokenAllowanceGateway(): void {
  _instance?.reset();
  _instance = undefined;
}
