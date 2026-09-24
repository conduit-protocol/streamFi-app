/**
 * Optimistic update helpers for stream mutations (#454).
 *
 * These helpers apply immediate cache updates so the UI reflects the
 * expected state change before the transaction confirms, then roll
 * back on error.
 */

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './query-keys';
import type { StreamInfo } from './stream';

/**
 * Apply an optimistic status change to a stream in the cache.
 * Returns a snapshot of the previous value for rollback.
 *
 * @example
 * const snapshot = optimisticStreamStatusUpdate(qc, address, 'paused');
 * try {
 *   await pause(address);
 * } catch (e) {
 *   rollbackStreamStatus(qc, address, snapshot);
 *   throw e;
 * }
 */
export function optimisticStreamStatusUpdate(
  qc: QueryClient,
  streamAddress: string,
  newStatus: string,
): StreamInfo | undefined {
  const key = queryKeys.streams.info(streamAddress);
  const previous = qc.getQueryData<StreamInfo>(key);

  if (previous) {
    qc.setQueryData<StreamInfo>(key, {
      ...previous,
      paused: newStatus === 'paused',
      pausedAt: newStatus === 'paused' ? Math.floor(Date.now() / 1000) : previous.pausedAt,
    });
  }

  // Also update the streams list if it contains this stream
  const listKey = queryKeys.streams.lists();
  const listData = qc.getQueryData<unknown[]>(listKey);
  if (Array.isArray(listData)) {
    qc.setQueryData(listKey, listData.map((item: any) => {
      if (item?.address === streamAddress || item?.id === streamAddress) {
        return { ...item, status: newStatus, paused: newStatus === 'paused' };
      }
      return item;
    }));
  }

  return previous;
}

/**
 * Roll back an optimistic stream status update.
 */
export function rollbackStreamStatus(
  qc: QueryClient,
  streamAddress: string,
  snapshot: StreamInfo | undefined,
): void {
  const key = queryKeys.streams.info(streamAddress);
  if (snapshot) {
    qc.setQueryData(key, snapshot);
  } else {
    qc.removeQueries({ queryKey: key });
  }
  // Invalidate the list to refetch correct data
  qc.invalidateQueries({ queryKey: queryKeys.streams.lists() });
}

/**
 * Apply an optimistic withdrawable balance update.
 * Reduces the displayed withdrawable amount by the withdrawn value.
 */
export function optimisticWithdrawUpdate(
  qc: QueryClient,
  streamAddress: string,
  withdrawnAmount: bigint,
): bigint | undefined {
  const key = queryKeys.streams.withdrawable(streamAddress);
  const previous = qc.getQueryData<bigint>(key);

  if (previous !== undefined && typeof previous === 'bigint') {
    const newValue = previous > withdrawnAmount ? previous - withdrawnAmount : 0n;
    qc.setQueryData(key, newValue);
  }

  return previous;
}

/**
 * Roll back an optimistic withdraw update.
 */
export function rollbackWithdraw(
  qc: QueryClient,
  streamAddress: string,
  snapshot: bigint | undefined,
): void {
  const key = queryKeys.streams.withdrawable(streamAddress);
  if (snapshot !== undefined) {
    qc.setQueryData(key, snapshot);
  } else {
    qc.removeQueries({ queryKey: key });
  }
}
