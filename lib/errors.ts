/**
 * Shared operation error types.
 *
 * Split out of `lib/safe-operations.ts` (#393) so that low-level helpers —
 * `lib/with-timeout.ts` in particular — can throw and identify them without
 * importing the Stellar SDK that `safe-operations` pulls in. Every class is
 * re-exported from `lib/safe-operations.ts`, so existing imports are
 * unaffected and `instanceof` checks still compare the same class.
 */

export class OperationAbortedError extends Error {
  readonly code = 'OPERATION_ABORTED';
  constructor(message = 'Operation aborted') {
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
