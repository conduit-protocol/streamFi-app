/**
 * Shared timeout helper (#393).
 *
 * `withTimeout(promise, ms, label)` was reimplemented verbatim in
 * `app/create/page.tsx`, `contexts/WalletContext.tsx` and `lib/soroban.ts`,
 * so each copy drifted independently: only the Soroban one understood an
 * `AbortSignal`, only the Soroban one validated `ms`, and only the two UI
 * copies produced a message a user could read. This module owns the one
 * implementation the rest of the app imports.
 *
 * Semantics:
 * - Resolves/rejects with `promise` if it settles within `ms`.
 * - Rejects with `OperationTimeoutError` once `ms` elapses (callers can
 *   substitute their own error via `onTimeout` — the create form and the
 *   wallet both surface the timeout directly to the user).
 * - Rejects with `OperationAbortedError` if `signal` fires (or is already
 *   aborted on entry), so cancellation stays distinguishable from failure.
 * - Always clears the timer and removes the abort listener, so a long-lived
 *   signal never accumulates dead listeners (the same leak class as #390).
 *
 * Note this *races* the promise rather than cancelling it: the underlying
 * work keeps running unless it is itself signal-aware. Where the work can
 * genuinely be cancelled (`lib/indexer.ts`), an `AbortController` passed
 * into the fetch remains the better tool.
 */
import { OperationAbortedError, OperationTimeoutError } from './errors';

export interface WithTimeoutOptions {
  /** Prefix for the default timeout message, e.g. 'Freighter signing'. */
  label?: string;
  /** Cancels the wait early, rejecting with `OperationAbortedError`. */
  signal?: AbortSignal;
  /** Build the rejection used when the deadline elapses. */
  onTimeout?: (ms: number, label?: string) => Error;
}

/** Default deadline rejection: a structured, retryable `OperationTimeoutError`. */
export function defaultTimeoutError(ms: number, label?: string): Error {
  return new OperationTimeoutError(
    label ? `${label} timed out after ${ms}ms` : `Operation timed out after ${ms}ms`,
  );
}

/**
 * Race `promise` against a `ms` deadline and an optional `AbortSignal`.
 *
 * @param promise         The work to bound.
 * @param ms              Deadline in milliseconds (positive safe integer).
 * @param labelOrOptions  A label for the default message, or full options.
 * @param signal          Shorthand signal, usable alongside a string label.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  labelOrOptions?: string | WithTimeoutOptions,
  signal?: AbortSignal,
): Promise<T> {
  const options: WithTimeoutOptions =
    typeof labelOrOptions === 'string' ? { label: labelOrOptions } : labelOrOptions ?? {};
  const label       = options.label;
  const abortSignal = options.signal ?? signal;
  const onTimeout   = options.onTimeout ?? defaultTimeoutError;

  if (!Number.isSafeInteger(ms) || ms <= 0) {
    throw new RangeError('Timeout must be a positive safe integer');
  }
  if (abortSignal?.aborted) throw new OperationAbortedError();

  let timer:   ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout(ms, label)), ms);
    if (abortSignal) {
      onAbort = () => reject(new OperationAbortedError());
      abortSignal.addEventListener('abort', onAbort, { once: true });
    }
  });

  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
    if (onAbort) abortSignal?.removeEventListener('abort', onAbort);
  }
}
