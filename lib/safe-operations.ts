/**
 * Safe Operations — error boundary wrappers and precision utilities.
 *
 * Provides concurrency-safe wrappers for async operations, floating-point
 * precision helpers, and normalized error reporting used across the
 * Soroban pipeline and UI components.
 */

// ── Custom Error Types ───────────────────────────────────────────────────────

export class OperationAbortedError extends Error {
  readonly code = 'OPERATION_ABORTED';
  constructor(message = 'Operation was aborted') {
    super(message);
    this.name = 'OperationAbortedError';
  }
}

export class OperationTimeoutError extends Error {
  readonly code = 'OPERATION_TIMEOUT';
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'OperationTimeoutError';
  }
}

export class ConcurrencyLimitError extends Error {
  readonly code = 'CONCURRENCY_LIMIT';
  constructor(message = 'Too many concurrent operations') {
    super(message);
    this.name = 'ConcurrencyLimitError';
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';
  constructor(message = 'Operation with the same idempotency key is already in-flight') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

// ── Normalized Operation Result ──────────────────────────────────────────────

export interface SafeOperationResult<T> {
  success: boolean;
  data?:   T;
  error?:  NormalizedError;
}

export interface NormalizedError {
  message: string;
  code:    string;
  source:  'wallet' | 'rpc' | 'network' | 'validation' | 'unknown';
  retryable: boolean;
  original?: unknown;
}

/**
 * Normalize any thrown value into a structured error object.
 */
export function normalizeError(err: unknown, context?: string): NormalizedError {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');

  // Determine error source category
  let source: NormalizedError['source'] = 'unknown';
  let retryable = false;
  const errObj = err as { name?: string; code?: string } | null | undefined;

  if (err instanceof OperationAbortedError || errObj?.name === 'AbortError' || message.includes('abort')) {
    source = 'wallet';
    retryable = true;
  } else if (err instanceof OperationTimeoutError || message.includes('timeout') || message.includes('timed out')) {
    source = 'rpc';
    retryable = true;
  } else if (err instanceof ConcurrencyLimitError || err instanceof IdempotencyConflictError) {
    source = 'wallet';
    retryable = true;
  } else if (message.includes('Freighter') || message.includes('wallet') || message.includes('signing')) {
    source = 'wallet';
    retryable = false;
  } else if (message.includes('network') || message.includes('fetch') || message.includes('ECONNREFUSED')) {
    source = 'network';
    retryable = true;
  } else if (message.includes('Simulation') || message.includes('simulation') || message.includes('rpc')) {
    source = 'rpc';
    retryable = true;
  } else if (message.includes('Invalid') || message.includes('Missing') || message.includes('Malformed')) {
    source = 'validation';
    retryable = false;
  }

  return {
    message: context ? `${context}: ${message}` : message,
    code: err instanceof Error && 'code' in err ? (err as any).code : 'UNKNOWN',
    source,
    retryable,
    original: err,
  };
}

/**
 * Wraps an async function with normalized error handling.
 * Never throws — instead returns a SafeOperationResult.
 */
export async function withSafeOperation<T>(
  fn: () => Promise<T>,
  options?: {
    context?: string;
    signal?:  AbortSignal;
    timeoutMs?: number;
  },
): Promise<SafeOperationResult<T>> {
  try {
    if (options?.signal?.aborted) {
      return {
        success: false,
        error: normalizeError(new OperationAbortedError(), options.context),
      };
    }

    const result = await (options?.timeoutMs
      ? withTimeout(fn(), options.timeoutMs, options.context)
      : fn());

    if (options?.signal?.aborted) {
      return {
        success: false,
        error: normalizeError(new OperationAbortedError('Operation was aborted after completion — result discarded'), options.context),
      };
    }

    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: normalizeError(err, options?.context),
    };
  }
}

/**
 * Execute multiple safe operations in parallel with a concurrency limit.
 * Each operation is individually isolated — one failure doesn't affect others.
 */
export async function withBoundedParallel<T>(
  items: T[],
  handler: (item: T, index: number, signal: AbortSignal) => Promise<SafeOperationResult<any>>,
  options?: {
    maxConcurrency?: number;
    signal?:         AbortSignal;
    itemLabel?:      (item: T, index: number) => string;
  },
): Promise<SafeOperationResult<any>[]> {
  const maxConcurrency = options?.maxConcurrency ?? 5;
  const results: SafeOperationResult<any>[] = [];
  let index = 0;

  const worker = async () => {
    while (index < items.length && !options?.signal?.aborted) {
      const i = index++;
      try {
        const result = await handler(items[i]!, i, options?.signal ?? new AbortController().signal);
        results[i] = result;
      } catch (err) {
        results[i] = {
          success: false,
          error: normalizeError(
            err,
            options?.itemLabel?.(items[i]!, i) ?? `item[${i}]`,
          ),
        };
      }
    }
  };

  const workers = Array.from({ length: maxConcurrency }, () => worker());
  await Promise.all(workers);

  return results;
}

// ── Timeout Helper ───────────────────────────────────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  context?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new OperationTimeoutError(
        context ? `${context} timed out after ${ms}ms` : `Operation timed out after ${ms}ms`,
      ));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Precision Helpers ────────────────────────────────────────────────────────

/**
 * Safely format a rate per second value (bigint from stroops) to a
 * human-readable number string. Handles edge cases like zero, negative,
 * and extreme values without floating-point precision loss.
 *
 * Uses string-based arithmetic to avoid IEEE 754 rounding errors at
 * high precision (e.g., 11574074074074 / 1e7 = 1157407.4074074).
 */
export function safeRateToString(ratePerSecond: bigint, decimals = 7): string {
  if (ratePerSecond === 0n) return '0';
  const sign = ratePerSecond < 0n ? '-' : '';
  const abs = ratePerSecond < 0n ? -ratePerSecond : ratePerSecond;
  const factor = BigInt(10 ** decimals);
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(decimals, '0');
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');
  return `${sign}${whole}.${trimmed}`;
}

/**
 * Safely parse a string to bigint stroops.
 * Returns null for invalid input instead of throwing.
 */
export function safeToStroops(amount: string, decimals = 7): bigint | null {
  if (!amount || typeof amount !== 'string') return null;
  const trimmed = amount.trim();
  if (!trimmed) return null;

  // Allow scientific notation for very small/large numbers
  const scientificMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)[eE](\d+)$/);
  if (scientificMatch) {
    const base = scientificMatch[1]!;
    const exp = parseInt(scientificMatch[2]!, 10);
    return safeToStroops(base, decimals - exp) ?? safeToStroops(base, decimals);
  }

  const [whole = '0', frac = ''] = trimmed.split('.');
  // Validate characters
  if (!/^-?\d+$/.test(whole) || (frac && !/^\d+$/.test(frac))) return null;

  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  try {
    return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded);
  } catch {
    return null;
  }
}

/**
 * Calculate a timestamp percentage without floating-point drift.
 * Returns a value between 0 and 100.
 */
export function safePercent(current: number, start: number, end: number): number {
  if (end <= start) return 0;
  if (current <= start) return 0;
  if (current >= end) return 100;
  // Compute as (current - start) / (end - start) * 100 using high-precision
  const elapsed = current - start;
  const total = end - start;
  // Use 64-bit integer arithmetic to avoid float rounding
  return Number((BigInt(Math.round(elapsed * 1_000_000)) * 100n) / BigInt(Math.round(total * 1_000_000))) / 100;
}

// ── Request ID / Idempotency Key ─────────────────────────────────────────────

const activeIdempotencyKeys = new Map<string, Promise<any>>();

/**
 * Execute an operation with idempotency key protection.
 * If the same key is already in-flight, returns the existing promise
 * to prevent duplicate submissions.
 *
 * @param key Unique key for the operation
 * @param fn Factory function that produces the operation promise
 * @returns The operation result (shared if same key is already running)
 */
export async function withIdempotency<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = activeIdempotencyKeys.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    activeIdempotencyKeys.delete(key);
  });

  activeIdempotencyKeys.set(key, promise);
  return promise;
}

/**
 * Generate a deterministic idempotency key for a contract operation.
 */
export function makeOperationKey(
  publicKey: string,
  contractId: string,
  method: string,
  ...args: string[]
): string {
  return `${publicKey}:${contractId}:${method}:${args.join(':')}`;
}

/**
 * Clear all active idempotency keys — called on disconnect.
 */
export function clearIdempotencyKeys(): void {
  activeIdempotencyKeys.clear();
}

