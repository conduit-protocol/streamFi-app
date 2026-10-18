import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from './with-timeout';
import { OperationAbortedError, OperationTimeoutError } from './errors';

const never = () => new Promise<never>(() => {});
const after = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

describe('withTimeout', () => {
  it('resolves with the promise value when it settles inside the deadline', async () => {
    await expect(withTimeout(after(5, 'done'), 200)).resolves.toBe('done');
  });

  it('propagates the promise rejection rather than masking it as a timeout', async () => {
    const failing = Promise.reject(new Error('upstream exploded'));
    await expect(withTimeout(failing, 200)).rejects.toThrow('upstream exploded');
  });

  it('rejects with a labelled OperationTimeoutError once the deadline elapses', async () => {
    const err = await withTimeout(never(), 10, 'Freighter signing').catch((e) => e);
    expect(err).toBeInstanceOf(OperationTimeoutError);
    expect(err.message).toBe('Freighter signing timed out after 10ms');
  });

  it('lets a caller substitute its own user-facing timeout error', async () => {
    const onTimeout = (ms: number, label?: string) =>
      new Error(`${label} timed out after ${ms / 1000}s. The network may be congested.`);
    const err = await withTimeout(never(), 10, { label: 'Stream creation', onTimeout }).catch((e) => e);
    expect(err.message).toBe('Stream creation timed out after 0.01s. The network may be congested.');
  });

  it('rejects with OperationAbortedError when the signal fires before the deadline', async () => {
    const controller = new AbortController();
    const pending = withTimeout(never(), 1_000, 'RPC read', controller.signal);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(OperationAbortedError);
  });

  it('rejects immediately when handed an already-aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withTimeout(never(), 1_000, { signal: controller.signal }))
      .rejects.toBeInstanceOf(OperationAbortedError);
  });

  it('removes its abort listener once the promise settles, so a long-lived signal never accumulates them', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    await withTimeout(after(5, 'ok'), 1_000, 'read', controller.signal);

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-positive or non-integer deadline instead of arming a bogus timer', async () => {
    await expect(withTimeout(never(), 0)).rejects.toBeInstanceOf(RangeError);
    await expect(withTimeout(never(), -1)).rejects.toBeInstanceOf(RangeError);
    await expect(withTimeout(never(), 1.5)).rejects.toBeInstanceOf(RangeError);
  });
});
