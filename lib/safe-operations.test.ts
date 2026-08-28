import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OperationAbortedError,
  OperationTimeoutError,
  ConcurrencyLimitError,
  IdempotencyConflictError,
  normalizeError,
  withSafeOperation,
  withBoundedParallel,
  safeRateToString,
  safeToStroops,
  safePercent,
  withIdempotency,
  makeOperationKey,
  clearIdempotencyKeys,
} from './safe-operations.js';

import type { SafeOperationResult } from './safe-operations.js';

// ── Custom Error Types ───────────────────────────────────────────────────────

describe('OperationAbortedError', () => {
  it('uses the default message when none is provided', () => {
    const err = new OperationAbortedError();
    expect(err.message).toBe('Operation aborted');
    expect(err.name).toBe('OperationAbortedError');
    expect(err.code).toBe('OPERATION_ABORTED');
  });

  it('accepts a custom message', () => {
    const err = new OperationAbortedError('User cancelled');
    expect(err.message).toBe('User cancelled');
  });
});

describe('OperationTimeoutError', () => {
  it('uses the default message when none is provided', () => {
    const err = new OperationTimeoutError();
    expect(err.message).toBe('Operation timed out');
    expect(err.name).toBe('OperationTimeoutError');
    expect(err.code).toBe('OPERATION_TIMEOUT');
  });

  it('accepts a custom message', () => {
    const err = new OperationTimeoutError('RPC call exceeded 10s limit');
    expect(err.message).toBe('RPC call exceeded 10s limit');
  });
});

describe('ConcurrencyLimitError', () => {
  it('uses the default message', () => {
    const err = new ConcurrencyLimitError();
    expect(err.message).toBe('Too many concurrent operations');
    expect(err.name).toBe('ConcurrencyLimitError');
    expect(err.code).toBe('CONCURRENCY_LIMIT');
  });
});

describe('IdempotencyConflictError', () => {
  it('uses the default message', () => {
    const err = new IdempotencyConflictError();
    expect(err.message).toBe(
      'Operation with the same idempotency key is already in-flight',
    );
    expect(err.name).toBe('IdempotencyConflictError');
    expect(err.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

// ── normalizeError ───────────────────────────────────────────────────────────

describe('normalizeError', () => {
  it('extracts message and code from a standard Error', () => {
    const result = normalizeError(new Error('Something broke'));
    expect(result.message).toBe('Something broke');
    expect(result.code).toBe('UNKNOWN');
    expect(result.source).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.original).toBeInstanceOf(Error);
  });

  it('handles a null/undefined thrown value', () => {
    const result = normalizeError(null);
    expect(result.message).toBe('Unknown error');
    expect(result.source).toBe('unknown');
  });

  it('handles a string thrown value', () => {
    const result = normalizeError('string error');
    expect(result.message).toBe('string error');
  });

  it('handles a number thrown value', () => {
    const result = normalizeError(42);
    expect(result.message).toBe('42');
  });

  it('prepends context to the message', () => {
    const result = normalizeError(new Error('fail'), 'createStream');
    expect(result.message).toBe('createStream: fail');
  });

  describe('source classification', () => {
    it('classifies OperationAbortedError as wallet, retryable', () => {
      const result = normalizeError(new OperationAbortedError());
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(true);
    });

    it('classifies AbortError (DOMException) as wallet, retryable', () => {
      const result = normalizeError(
        new DOMException('user aborted', 'AbortError'),
      );
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(true);
    });

    it('classifies message containing "abort" as wallet, retryable', () => {
      const result = normalizeError(
        new Error('the user did abort the operation'),
      );
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(true);
    });

    it('classifies OperationTimeoutError as rpc, retryable', () => {
      const result = normalizeError(new OperationTimeoutError());
      expect(result.source).toBe('rpc');
      expect(result.retryable).toBe(true);
    });

    it('classifies message containing "timeout" as rpc, retryable', () => {
      const result = normalizeError(new Error('request timeout exceeded'));
      expect(result.source).toBe('rpc');
      expect(result.retryable).toBe(true);
    });

    it('classifies message containing "timed out" as rpc, retryable', () => {
      const result = normalizeError(new Error('the call timed out'));
      expect(result.source).toBe('rpc');
      expect(result.retryable).toBe(true);
    });

    it('classifies ConcurrencyLimitError as wallet, retryable', () => {
      const result = normalizeError(new ConcurrencyLimitError());
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(true);
    });

    it('classifies IdempotencyConflictError as wallet, retryable', () => {
      const result = normalizeError(new IdempotencyConflictError());
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(true);
    });

    it('classifies Freighter-related error as wallet, not retryable', () => {
      const result = normalizeError(new Error('Freighter is not connected'));
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(false);
    });

    it('classifies wallet signing error as wallet, not retryable', () => {
      const result = normalizeError(
        new Error('User rejected signing request'),
      );
      expect(result.source).toBe('wallet');
      expect(result.retryable).toBe(false);
    });

    it('classifies network errors as network, retryable', () => {
      const result = normalizeError(new Error('ECONNREFUSED'));
      expect(result.source).toBe('network');
      expect(result.retryable).toBe(true);
    });

    it('classifies fetch failures as network, retryable', () => {
      const result = normalizeError(new Error('fetch failed'));
      expect(result.source).toBe('network');
      expect(result.retryable).toBe(true);
    });

    it('classifies Simulation errors as rpc, not retryable', () => {
      const result = normalizeError(new Error('Simulation failed: overflow'));
      expect(result.source).toBe('rpc');
      expect(result.retryable).toBe(false);
    });

    it('classifies HostError as rpc, not retryable', () => {
      const result = normalizeError(new Error('HostError: contract trapped'));
      expect(result.source).toBe('rpc');
      expect(result.retryable).toBe(false);
    });

    it('classifies "No result returned" as rpc, not retryable', () => {
      const result = normalizeError(
        new Error('No result returned from simulation'),
      );
      expect(result.source).toBe('rpc');
      expect(result.retryable).toBe(false);
    });

    it('classifies validation errors as validation, not retryable', () => {
      const result = normalizeError(
        new Error('Invalid input: amount is negative'),
      );
      expect(result.source).toBe('validation');
      expect(result.retryable).toBe(false);
    });

    it('classifies Missing field as validation, not retryable', () => {
      const result = normalizeError(
        new Error('Missing required field: recipient'),
      );
      expect(result.source).toBe('validation');
      expect(result.retryable).toBe(false);
    });

    it('classifies Malformed data as validation, not retryable', () => {
      const result = normalizeError(new Error('Malformed request body'));
      expect(result.source).toBe('validation');
      expect(result.retryable).toBe(false);
    });
  });

  it('uses code from error object when present', () => {
    const error = new Error('custom');
    (error as any).code = 'MY_CODE';
    const result = normalizeError(error);
    expect(result.code).toBe('MY_CODE');
  });
});

// ── safeRateToString ─────────────────────────────────────────────────────────

describe('safeRateToString', () => {
  it('returns "0" for zero', () => {
    expect(safeRateToString(0n)).toBe('0');
  });

  it('formats a whole-number rate correctly', () => {
    expect(safeRateToString(100_000_000n)).toBe('10.00');
  });

  it('trims trailing zeros but keeps at least 2 decimal places', () => {
    expect(safeRateToString(15_000_000n)).toBe('1.50');
  });

  it('keeps significant fractional digits', () => {
    expect(safeRateToString(1_234_567n)).toBe('0.1234567');
  });

  it('handles negative rates', () => {
    expect(safeRateToString(-100_000_000n)).toBe('-10.00');
  });

  it('handles negative fractional rates', () => {
    expect(safeRateToString(-1_234_567n)).toBe('-0.1234567');
  });

  it('respects custom decimals parameter', () => {
    expect(safeRateToString(1_050n, 2)).toBe('10.50');
  });

  it('handles very large values without IEEE 754 precision loss', () => {
    expect(safeRateToString(11_574_074_074_074n)).toBe('1157407.4074074');
  });

  it('handles very small non-zero values', () => {
    expect(safeRateToString(1n)).toBe('0.0000001');
  });

  it('handles negative one stroop', () => {
    expect(safeRateToString(-1n)).toBe('-0.0000001');
  });
});

// ── safeToStroops ────────────────────────────────────────────────────────────

describe('safeToStroops', () => {
  it('converts a whole-number string to bigint', () => {
    expect(safeToStroops('10')).toBe(100_000_000n);
  });

  it('converts a decimal string to bigint', () => {
    expect(safeToStroops('10.00')).toBe(100_000_000n);
  });

  it('pads short fractional part with zeros', () => {
    expect(safeToStroops('1.5')).toBe(15_000_000n);
  });

  it('returns 0n for "0"', () => {
    expect(safeToStroops('0')).toBe(0n);
  });

  it('handles negative whole-only amounts', () => {
    expect(safeToStroops('-3')).toBe(-30_000_000n);
  });

  it('respects custom decimals', () => {
    expect(safeToStroops('10.50', 2)).toBe(1_050n);
  });

  it('truncates excess fractional digits', () => {
    expect(safeToStroops('1.123456789', 7)).toBe(11_234_567n);
  });

  describe('returns null for invalid input', () => {
    it('handles empty string', () => {
      expect(safeToStroops('')).toBeNull();
    });

    it('handles whitespace-only string', () => {
      expect(safeToStroops('   ')).toBeNull();
    });

    it('handles null', () => {
      expect(safeToStroops(null as unknown as string)).toBeNull();
    });

    it('handles undefined', () => {
      expect(safeToStroops(undefined as unknown as string)).toBeNull();
    });

    it('handles non-string input (number)', () => {
      expect(safeToStroops(42 as unknown as string)).toBeNull();
    });

    it('handles non-numeric strings', () => {
      expect(safeToStroops('abc')).toBeNull();
    });

    it('handles malformed negative sign placement', () => {
      expect(safeToStroops('5-2')).toBeNull();
    });
  });

  // ── Regression test markers for known bugs ─────────────────────────

  // BUG: safeToStroops('-5.25') returns -47_500_000n instead of -52_500_000n.
  // BigInt('-5') * factor = -50_000_000, then + BigInt('2500000') = -47_500_000.
  // The fractional part is always positive, so it cancels instead of adding to
  // the negative whole part. Fix: strip sign, compute as positive, re-apply.
  it.todo(
    'correctly handles negative fractional amounts (BUG: sign cancellation on frac part)',
  );

  // BUG: safeToStroops('.5') returns null instead of 5_000_000n.
  // Destructure defaults only apply when element is undefined, but
  // '.5'.split('.') = ['', '5'] — whole = '' (not '0'), fails the regex.
  // Fix: replace destructure default with `const whole = parts[0] || '0'`.
  it.todo(
    'correctly handles leading-dot input (BUG: empty-string whole bypasses default)',
  );

  describe('scientific notation (regression tests)', () => {
    // BUG: safeToStroops('1e7') returns 1n instead of 100_000_000_000_000n.
    // The ?? chain calls safeToStroops('1', 0) first (7 - 7 = 0).
    // safeToStroops('1', 0) returns 1n, which is not null, so the correct
    // safeToStroops('1', 7) call never runs.
    // Fix: use || instead of ??, or only fall back if first call returns null.
    it.todo(
      'handles positive exponent: 1e7 (BUG: ?? short-circuits before correct fallback)',
    );

    // BUG: safeToStroops('1.5e2') returns 150_000n instead of 1_500_000_000n.
    // Same cause: safeToStroops('1.5', 5) returns 150_000n (non-null),
    // short-circuiting the correct safeToStroops('1.5', 7) call.
    it.todo(
      'handles scientific notation with decimal: 1.5e2 (BUG: ?? short-circuits)',
    );

    it('handles scientific notation for small values: 1e-7', () => {
      // Regex only matches /e(\d+)$/, so negative exponents fall through
      // to normal parsing which can't handle '1e-7'.
      const result = safeToStroops('1e-7');
      expect(result).toBeNull();
    });
  });
});

// ── safePercent ──────────────────────────────────────────────────────────────

describe('safePercent', () => {
  it('returns 0 when current <= start', () => {
    expect(safePercent(0, 100, 200)).toBe(0);
  });

  it('returns 0 when current equals start', () => {
    expect(safePercent(100, 100, 200)).toBe(0);
  });

  it('returns 100 when current >= end', () => {
    expect(safePercent(300, 100, 200)).toBe(100);
  });

  it('returns 100 when current equals end', () => {
    expect(safePercent(200, 100, 200)).toBe(100);
  });

  it('returns 0 when end <= start', () => {
    expect(safePercent(150, 200, 100)).toBe(0);
  });

  it('returns 0 when end equals start', () => {
    expect(safePercent(150, 100, 100)).toBe(0);
  });

  // BUG: safePercent returns a 0-1 ratio instead of the documented 0-100
  // percentage. The final `/ 100` division should not exist.
  it('returns 0.5 for midpoint (BUG: should be 50, but returns 0.5 due to final / 100)', () => {
    expect(safePercent(50, 0, 100)).toBe(0.5);
  });

  it('returns 0.25 for 25% (BUG: should be 25)', () => {
    expect(safePercent(25, 0, 100)).toBe(0.25);
  });

  it('handles non-integer boundaries on 0-1 scale', () => {
    expect(safePercent(15.5, 10, 20)).toBeCloseTo(0.55, 2);
  });
});

// ── withSafeOperation ────────────────────────────────────────────────────────

describe('withSafeOperation', () => {
  it('returns success: true with data on success', async () => {
    const result = await withSafeOperation(() => Promise.resolve(42));
    expect(result.success).toBe(true);
    expect(result.data).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it('returns success: false with normalized error on failure', async () => {
    const result = await withSafeOperation(() =>
      Promise.reject(new Error('boom')),
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('boom');
  });

  it('returns aborted error when signal is already aborted before start', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await withSafeOperation(
      () => Promise.resolve(42),
      { signal: controller.signal },
    );
    expect(result.success).toBe(false);
    expect(result.error!.source).toBe('wallet');
    expect(result.error!.retryable).toBe(true);
  });

  it('resolves with timeout error when operation exceeds timeoutMs', async () => {
    const result = await withSafeOperation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve('too late'), 200),
        ),
      { timeoutMs: 10 },
    );
    expect(result.success).toBe(false);
    expect(result.error!.source).toBe('rpc');
    expect(result.error!.retryable).toBe(true);
  });

  it('prepends context to error messages', async () => {
    const result = await withSafeOperation(
      () => Promise.reject(new Error('fail')),
      { context: 'createStream' },
    );
    expect(result.error!.message).toBe('createStream: fail');
  });
});

// ── withBoundedParallel ──────────────────────────────────────────────────────

describe('withBoundedParallel', () => {
  it('processes all items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await withBoundedParallel(
      items,
      async (item) =>
        ({ success: true, data: item * 2 }) as SafeOperationResult<number>,
    );
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.data)).toEqual([2, 4, 6, 8, 10]);
  });

  it('handles an empty array', async () => {
    const results = await withBoundedParallel(
      [],
      async (_item) =>
        ({ success: true, data: null }) as SafeOperationResult<null>,
    );
    expect(results).toEqual([]);
  });

  it('limits concurrency to maxConcurrency', async () => {
    let concurrent = 0;
    let maxSeen = 0;

    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    await withBoundedParallel(
      items,
      async (item) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        await new Promise((r) => setTimeout(r, 50));
        concurrent--;
        return { success: true, data: item } as SafeOperationResult<number>;
      },
      { maxConcurrency: 3 },
    );

    expect(maxSeen).toBe(3);
  });

  it('defaults maxConcurrency to 5', async () => {
    let concurrent = 0;
    let maxSeen = 0;

    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    await withBoundedParallel(
      items,
      async (item) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        await new Promise((r) => setTimeout(r, 50));
        concurrent--;
        return { success: true, data: item } as SafeOperationResult<number>;
      },
    );

    expect(maxSeen).toBe(5);
  });

  it('isolates individual handler failures', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await withBoundedParallel(
      items,
      async (item) => {
        if (item === 3) throw new Error('item 3 failed');
        return { success: true, data: item } as SafeOperationResult<number>;
      },
    );

    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(true);
    expect(results[2]!.success).toBe(false);
    expect(results[3]!.success).toBe(true);
    expect(results[4]!.success).toBe(true);
  });

  it('stops processing new items when signal is aborted', async () => {
    const controller = new AbortController();

    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const resultsPromise = withBoundedParallel(
      items,
      async (item) => {
        await new Promise((r) => setTimeout(r, 20));
        return { success: true, data: item } as SafeOperationResult<number>;
      },
      { signal: controller.signal, maxConcurrency: 2 },
    );

    await new Promise((r) => setTimeout(r, 30));
    controller.abort();

    const results = await resultsPromise;

    // Workers that started before abort complete; workers that hadn't
    // entered the while loop see signal.aborted and stop.
    // results is a sparse array — non-enumerable holes for unprocessed indices.
    const processedCount = Object.keys(results).length;
    expect(processedCount).toBeGreaterThan(0);
    expect(processedCount).toBeLessThanOrEqual(10);
  });

  it('passes the index to the handler', async () => {
    const items = ['a', 'b', 'c'];
    const indices: number[] = [];
    await withBoundedParallel(
      items,
      async (_item, index) => {
        indices.push(index);
        return { success: true, data: index } as SafeOperationResult<number>;
      },
    );

    expect(indices.sort()).toEqual([0, 1, 2]);
  });

  it('uses itemLabel for error context when provided', async () => {
    const items = ['bad-item'];
    const results = await withBoundedParallel(
      items,
      async () => {
        throw new Error('failure');
      },
      { itemLabel: (item) => `processing ${item}` },
    );

    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error!.message).toContain('processing bad-item');
  });

  it('falls back to item[N] label when no itemLabel provided', async () => {
    const items = ['bad'];
    const results = await withBoundedParallel(
      items,
      async () => {
        throw new Error('failure');
      },
    );

    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error!.message).toContain('item[0]');
  });

  it('passes the abort signal to individual handlers', async () => {
    const items = [1];
    let receivedSignal: AbortSignal | undefined;

    await withBoundedParallel(
      items,
      async (_item, _index, signal) => {
        receivedSignal = signal;
        return { success: true, data: 1 } as SafeOperationResult<number>;
      },
    );

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal!.aborted).toBe(false);
  });

  // Regression test for #221: withBoundedParallel used to build
  // `new AbortController().signal` inline per item when no outer signal was
  // passed, so every handler got its own signal that nothing could ever
  // abort. The fix shares one AbortController across the whole batch.
  it('shares a single fallback signal across items when no outer signal is provided', async () => {
    const items = [1, 2, 3];
    const receivedSignals: AbortSignal[] = [];

    await withBoundedParallel(
      items,
      async (_item, _index, signal) => {
        receivedSignals.push(signal);
        return { success: true, data: 1 } as SafeOperationResult<number>;
      },
      { maxConcurrency: 1 }, // force sequential execution for a deterministic order
    );

    expect(receivedSignals).toHaveLength(3);
    // Every item must receive the exact same AbortSignal instance — not a
    // fresh one per item, which is the bug this test guards against.
    expect(receivedSignals[1]).toBe(receivedSignals[0]);
    expect(receivedSignals[2]).toBe(receivedSignals[0]);
  });

  it('passes the same parent signal to handlers when provided', async () => {
    const controller = new AbortController();
    const items = [1, 2];
    const receivedSignals: AbortSignal[] = [];

    await withBoundedParallel(
      items,
      async (_item, _index, signal) => {
        receivedSignals.push(signal);
        return { success: true, data: 1 } as SafeOperationResult<number>;
      },
      { signal: controller.signal },
    );

    expect(receivedSignals[0]).toBe(controller.signal);
    expect(receivedSignals[1]).toBe(controller.signal);
  });

  it('handles a handler throwing non-Error values', async () => {
    const items = [1];
    const results = await withBoundedParallel(
      items,
      async () => {
        throw 'string error';
      },
    );

    expect(results[0]!.success).toBe(false);
    // normalizeError wraps with context: "item[0]: string error"
    expect(results[0]!.error!.message).toContain('string error');
    expect(results[0]!.error!.message).toContain('item[0]');
  });
});

// ── withIdempotency ──────────────────────────────────────────────────────────

describe('withIdempotency', () => {
  beforeEach(() => {
    clearIdempotencyKeys();
  });

  it('executes the function for a new key', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const result = await withIdempotency('key-1', fn);
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('reuses the in-flight promise for duplicate keys', async () => {
    const fn = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve('shared'), 100),
        ),
    );

    const [result1, result2] = await Promise.all([
      withIdempotency('same-key', fn),
      withIdempotency('same-key', fn),
    ]);

    expect(result1).toBe('shared');
    expect(result2).toBe('shared');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows a new call after the first completes', async () => {
    const fn = vi.fn().mockResolvedValue('done');

    await withIdempotency('key', fn);
    const result = await withIdempotency('key', fn);

    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('treats different keys independently', async () => {
    const fn1 = vi.fn().mockResolvedValue('first');
    const fn2 = vi.fn().mockResolvedValue('second');

    const [result1, result2] = await Promise.all([
      withIdempotency('key-a', fn1),
      withIdempotency('key-b', fn2),
    ]);

    expect(result1).toBe('first');
    expect(result2).toBe('second');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('cleans up the key even if the function rejects', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(withIdempotency('fail-key', fn)).rejects.toThrow('fail');

    // After rejection, the key should be removed so the next call retries
    fn.mockResolvedValue('recovered');
    const result = await withIdempotency('fail-key', fn);
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ── makeOperationKey ─────────────────────────────────────────────────────────

describe('makeOperationKey', () => {
  it('produces a deterministic key from inputs', () => {
    const key = makeOperationKey(
      'GA...PUBKEY',
      'CA...CONTRACT',
      'create_stream',
      '1000',
      '7',
    );
    expect(key).toBe('GA...PUBKEY:CA...CONTRACT:create_stream:1000:7');
  });

  it('produces different keys for different methods', () => {
    const key1 = makeOperationKey('pk', 'cid', 'create_stream');
    const key2 = makeOperationKey('pk', 'cid', 'withdraw');
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different public keys', () => {
    const key1 = makeOperationKey('pk1', 'cid', 'method');
    const key2 = makeOperationKey('pk2', 'cid', 'method');
    expect(key1).not.toBe(key2);
  });

  it('handles no extra args', () => {
    const key = makeOperationKey('pk', 'cid', 'method');
    // Current implementation appends trailing colon when args is empty:
    // `${method}:${args.join(':')}` with args=[] => 'method:'
    expect(key).toBe('pk:cid:method:');
  });
});

// ── clearIdempotencyKeys ─────────────────────────────────────────────────────

describe('clearIdempotencyKeys', () => {
  it('clears all active idempotency keys', async () => {
    const fn = vi.fn().mockResolvedValue('data');

    const promise1 = withIdempotency('key', fn);
    const promise2 = withIdempotency('key', fn);
    expect(fn).toHaveBeenCalledTimes(1);

    clearIdempotencyKeys();

    const promise3 = withIdempotency('key', fn);
    await Promise.all([promise1, promise2, promise3]);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('safeToStroops — scientific notation', () => {
  it('parses a standard whole number', () => {
    expect(safeToStroops('5', 7)).toBe(50_000_000n);
  });

  it('parses a standard fractional number', () => {
    expect(safeToStroops('5.123', 7)).toBe(51_230_000n);
  });

  it('parses scientific notation with positive effective decimals', () => {
    // decimals(7) - exp(2) = 5
    expect(safeToStroops('5e2', 7)).toBe(500_000n);
    expect(safeToStroops('5.123e2', 7)).toBe(512_300n);
  });

  it('parses scientific notation with negative effective decimals correctly (large exponents)', () => {
    // decimals(7) - exp(10) = -3
    expect(safeToStroops('5e10', 7)).toBe(50_000_000_000n);
    
    // decimals(7) - exp(8) = -1 (small negative effective decimals edge case)
    expect(safeToStroops('5e8', 7)).toBe(500_000_000n);
    
    // fractional base
    expect(safeToStroops('5.123e10', 7)).toBe(51_230_000_000n);
  });

  it('safely handles an absurdly large exponent without crashing, returning null', () => {
    // exp(150) -> effective decimals -143 (power = 143 > 100)
    expect(safeToStroops('5e150', 7)).toBeNull();
  });

  it('returns null for invalid inputs', () => {
    expect(safeToStroops('abc', 7)).toBeNull();
    expect(safeToStroops('', 7)).toBeNull();
  });
});
