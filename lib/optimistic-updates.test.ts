/**
 * optimistic-updates.test.ts
 *
 * Covers optimisticStreamStatusUpdate, rollbackStreamStatus,
 * optimisticWithdrawUpdate, and rollbackWithdraw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  optimisticStreamStatusUpdate,
  rollbackStreamStatus,
  optimisticWithdrawUpdate,
  rollbackWithdraw,
} from './optimistic-updates.js';
import { queryKeys } from './query-keys.js';
import type { StreamInfo } from './stream.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStream(overrides: Partial<StreamInfo> = {}): StreamInfo {
  return {
    address: 'CSTREAM11111111111111111111111111111111111111111111111111111111111',
    sender: 'GSENDER1111111111111111111111111111111111111111111111111111111111',
    recipient: 'GRECIPIENT1111111111111111111111111111111111111111111111111111111',
    asset: 'USDC',
    amount: 1000000000n,
    ratePerSecond: 100000n,
    start: 1700000000n,
    end: 1700100000n,
    withdrawn: 0n,
    cancelable: true,
    paused: false,
    pausedAt: null,
    ...overrides,
  } as StreamInfo;
}

let qc: QueryClient;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

// ── optimisticStreamStatusUpdate ─────────────────────────────────────────────

describe('optimisticStreamStatusUpdate', () => {
  const STREAM_ADDR = 'CSTREAM11111111111111111111111111111111111111111111111111111111111';

  it('returns undefined when no cached data exists', () => {
    const snapshot = optimisticStreamStatusUpdate(qc, STREAM_ADDR, 'paused');
    expect(snapshot).toBeUndefined();
  });

  it('sets paused=true and pausedAt when status is "paused"', () => {
    const stream = makeStream({ address: STREAM_ADDR });
    qc.setQueryData(queryKeys.streams.info(STREAM_ADDR), stream);

    const snapshot = optimisticStreamStatusUpdate(qc, STREAM_ADDR, 'paused');
    expect(snapshot).toEqual(stream);

    const updated = qc.getQueryData<StreamInfo>(queryKeys.streams.info(STREAM_ADDR));
    expect(updated?.paused).toBe(true);
    expect(updated?.pausedAt).toBeTypeOf('number');
  });

  it('sets paused=false and clears pausedAt when status is not "paused"', () => {
    const stream = makeStream({ address: STREAM_ADDR, paused: true, pausedAt: 1700000000 });
    qc.setQueryData(queryKeys.streams.info(STREAM_ADDR), stream);

    optimisticStreamStatusUpdate(qc, STREAM_ADDR, 'active');
    const updated = qc.getQueryData<StreamInfo>(queryKeys.streams.info(STREAM_ADDR));
    expect(updated?.paused).toBe(false);
    expect(updated?.pausedAt).toBe(1700000000); // preserves previous value
  });

  it('updates the streams list if it contains the stream', () => {
    const stream = makeStream({ address: STREAM_ADDR });
    qc.setQueryData(queryKeys.streams.lists(), [stream]);

    optimisticStreamStatusUpdate(qc, STREAM_ADDR, 'paused');
    const list = qc.getQueryData<any[]>(queryKeys.streams.lists());
    expect(list?.[0]?.paused).toBe(true);
    expect(list?.[0]?.status).toBe('paused');
  });

  it('does not modify list items that do not match the stream address', () => {
    const other = makeStream({ address: 'COTHER111111111111111111111111111111111111111111111111111111111111' });
    qc.setQueryData(queryKeys.streams.lists(), [other]);

    optimisticStreamStatusUpdate(qc, STREAM_ADDR, 'paused');
    const list = qc.getQueryData<any[]>(queryKeys.streams.lists());
    expect(list?.[0]?.paused).toBe(false);
  });
});

// ── rollbackStreamStatus ─────────────────────────────────────────────────────

describe('rollbackStreamStatus', () => {
  const STREAM_ADDR = 'CSTREAM11111111111111111111111111111111111111111111111111111111111';

  it('restores the snapshot when provided', () => {
    const stream = makeStream({ address: STREAM_ADDR });
    qc.setQueryData(queryKeys.streams.info(STREAM_ADDR), makeStream({ address: STREAM_ADDR, paused: true }));

    rollbackStreamStatus(qc, STREAM_ADDR, stream);
    expect(qc.getQueryData(queryKeys.streams.info(STREAM_ADDR))).toEqual(stream);
  });

  it('removes the query when snapshot is undefined', () => {
    qc.setQueryData(queryKeys.streams.info(STREAM_ADDR), makeStream());
    rollbackStreamStatus(qc, STREAM_ADDR, undefined);
    expect(qc.getQueryData(queryKeys.streams.info(STREAM_ADDR))).toBeUndefined();
  });

  it('invalidates the streams list', () => {
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    rollbackStreamStatus(qc, STREAM_ADDR, undefined);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: queryKeys.streams.lists() });
  });
});

// ── optimisticWithdrawUpdate ─────────────────────────────────────────────────

describe('optimisticWithdrawUpdate', () => {
  const STREAM_ADDR = 'CSTREAM11111111111111111111111111111111111111111111111111111111111';

  it('returns undefined when no cached data exists', () => {
    const snapshot = optimisticWithdrawUpdate(qc, STREAM_ADDR, 100n);
    expect(snapshot).toBeUndefined();
  });

  it('reduces the withdrawable amount by the withdrawn value', () => {
    qc.setQueryData(queryKeys.streams.withdrawable(STREAM_ADDR), 500n);
    const snapshot = optimisticWithdrawUpdate(qc, STREAM_ADDR, 200n);
    expect(snapshot).toBe(500n);
    expect(qc.getQueryData(queryKeys.streams.withdrawable(STREAM_ADDR))).toBe(300n);
  });

  it('clamps to zero when withdrawn exceeds available', () => {
    qc.setQueryData(queryKeys.streams.withdrawable(STREAM_ADDR), 100n);
    optimisticWithdrawUpdate(qc, STREAM_ADDR, 500n);
    expect(qc.getQueryData(queryKeys.streams.withdrawable(STREAM_ADDR))).toBe(0n);
  });
});

// ── rollbackWithdraw ─────────────────────────────────────────────────────────

describe('rollbackWithdraw', () => {
  const STREAM_ADDR = 'CSTREAM11111111111111111111111111111111111111111111111111111111111';

  it('restores the snapshot when provided', () => {
    qc.setQueryData(queryKeys.streams.withdrawable(STREAM_ADDR), 0n);
    rollbackWithdraw(qc, STREAM_ADDR, 500n);
    expect(qc.getQueryData(queryKeys.streams.withdrawable(STREAM_ADDR))).toBe(500n);
  });

  it('removes the query when snapshot is undefined', () => {
    qc.setQueryData(queryKeys.streams.withdrawable(STREAM_ADDR), 100n);
    rollbackWithdraw(qc, STREAM_ADDR, undefined);
    expect(qc.getQueryData(queryKeys.streams.withdrawable(STREAM_ADDR))).toBeUndefined();
  });
});
