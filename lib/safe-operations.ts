/**
 * Safe Operations — error boundary wrappers and precision utilities.
 *
 * Provides concurrency-safe wrappers for async operations, floating-point
 * precision helpers, and normalized error reporting used across the
 * Soroban pipeline and UI components.
 */

// ── Custom Error Types ───────────────────────────────────────────────────────

// The error classes live in ./errors so that lib/with-timeout.ts can throw
// them without importing this module (which pulls in the Stellar SDK) — see
// #393. They are re-exported here so every existing
// `from '@/lib/safe-operations'` import keeps working unchanged.
import {
  OperationAbortedError,
  OperationTimeoutError,
  ConcurrencyLimitError,
  IdempotencyConflictError,
} from './errors';
import { withTimeout } from './with-timeout';

export {
  OperationAbortedError,
  OperationTimeoutError,
  ConcurrencyLimitError,
  IdempotencyConflictError,
};

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
  const msg = message.toLowerCase();

  // Determine error source category
  let source: NormalizedError['source'] = 'unknown';
  let retryable = false;
  const errObj = err as { name?: string; code?: string } | null | undefined;

  if (err instanceof OperationAbortedError || errObj?.name === 'AbortError' || /\babort(ed|ing)?\b/i.test(message)) {
    source = 'wallet';
    retryable = true;
  } else if (err instanceof OperationTimeoutError || /\btimeout\b|\btimed?\s*out\b/i.test(message)) {
    source = 'rpc';
    retryable = true;
  } else if (err instanceof ConcurrencyLimitError || err instanceof IdempotencyConflictError) {
    source = 'wallet';
    retryable = true;
  } else if (/\bFreighter\b|\bwallet\b|\bsign(ing|ed)\b/i.test(message)) {
    source = 'wallet';
    retryable = false;
  } else if (/\bnetwork\b|\bfetch\b|\bECONNREFUSED\b/i.test(message)) {
    source = 'network';
    retryable = true;
  } else if (/\bsimulation\b|\bHostError\b|\bno\s+result\s+returned\b/i.test(message)) {
    source = 'rpc';
    retryable = false;
  } else if (/\bInvalid\b|\bMissing\b|\bMalformed\b/i.test(message)) {
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

  // When the caller doesn't pass an outer signal, fall back to a single
  // AbortController created once for the whole batch — not one per item.
  // A fresh AbortController allocated per item is discarded the instant
  // it's created; nothing ever holds a reference to it, so `.abort()` can
  // never be called and every handler's signal reads `aborted: false`
  // forever, silently defeating per-item cancellation (#221). Sharing one
  // controller across the batch at least makes the signal a coherent,
  // referenceable object — the same one every item receives — instead of
  // a dead one manufactured and thrown away per item.
  const fallbackSignal = options?.signal ?? new AbortController().signal;

  const worker = async () => {
    while (index < items.length && !options?.signal?.aborted) {
      const i = index++;
      try {
        const result = await handler(items[i]!, i, fallbackSignal);
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

  // Fill any un-started slots (e.g. when signal aborted mid-run) with an
  // aborted result so callers never hit undefined holes.
  const abortedResult: SafeOperationResult<any> = {
    success: false,
    error: normalizeError(new OperationAbortedError('Batch aborted before item started')),
  };
  for (let i = 0; i < items.length; i++) {
    if (results[i] === undefined) results[i] = abortedResult;
  }

  return results;
}

// ── Timeout Helper ───────────────────────────────────────────────────────────

// The local copy of `withTimeout` was one of four near-identical
// implementations across the app; it now comes from lib/with-timeout.ts,
// which produces the same OperationTimeoutError message (#393).

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
  const factor = 10n ** BigInt(decimals);
  const whole = abs / factor;
  const frac = decimals > 0 ? (abs % factor).toString().padStart(decimals, '0') : '';
  // Trim trailing zeros but keep at least 2 decimal places (if decimals >= 2)
  const minDecimals = Math.min(2, decimals);
  const trimmed = frac.replace(/0+$/, '').padEnd(minDecimals, '0');
  return decimals > 0 ? `${sign}${whole}.${trimmed}` : `${sign}${whole}`;
}

/**
 * Safely parse a string to bigint stroops.
 * Returns null for invalid input instead of throwing.
 */
export function safeToStroops(amount: string, decimals = 7): bigint | null {
  if (!amount || typeof amount !== 'string') return null;
  const trimmed = amount.trim();
  if (!trimmed) return null;

  // Regex validation: optional sign, digits before and/or after decimal, optional non-negative scientific exponent
  const match = trimmed.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]\+?(\d+))?$/);
  if (!match) return null;

  const sign = match[1] || '';
  const isNegative = sign === '-';
  const intPart = match[2] ?? (match[4] ? '0' : '0');
  const fracPart = match[3] ?? match[4] ?? '';
  const expStr = match[5];

  let whole = intPart;
  let frac = fracPart;

  if (expStr !== undefined) {
    const exp = parseInt(expStr, 10);
    // Prevent astronomically large values from causing DOS/OOM issues
    if (exp > 100) return null;

    const cleanW = whole.replace(/^0+/, '') || '0';
    if (frac.length <= exp) {
      const combined = (cleanW === '0' ? '' : cleanW) + frac + '0'.repeat(exp - frac.length);
      whole = combined.replace(/^0+/, '') || '0';
      frac = '';
    } else {
      const shifted = frac.slice(0, exp);
      const combined = (cleanW === '0' ? '' : cleanW) + shifted;
      whole = combined.replace(/^0+/, '') || '0';
      frac = frac.slice(exp);
    }
  }

  try {
    const factor = 10n ** BigInt(decimals);
    const fracTruncated = decimals > 0 ? frac.slice(0, decimals) : '';
    const fracPadded = fracTruncated.padEnd(decimals, '0');
    const result = BigInt(whole) * factor + (fracPadded ? BigInt(fracPadded) : 0n);
    return isNegative && result !== 0n ? -result : result;
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
  return ((current - start) / (end - start)) * 100;
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

