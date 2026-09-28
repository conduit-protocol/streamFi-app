/**
 * Optimistic update helpers for stream mutations (#454).
 *
 * These helpers apply immediate cache updates so the UI reflects the
 * expected state change before the transaction confirms, then roll
 * back on error.
 */

import type { QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
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

export interface RollbackWithdrawOptions {
  /** Override the default revert explanation shown in the toast. */
  reason?: string;
  /** Skip the toast (e.g. caller already surfaced the error). Defaults to false. */
  silent?: boolean;
}

const ROLLBACK_SHAKE_STYLE_ID = 'optimistic-rollback-shake-style';

/**
 * Inject the error-shake keyframes once per document (#695). The animation
 * is applied via `triggerRollbackShake` to balance elements so a reverted
 * optimistic withdrawal is visually explained instead of silently snapping.
 */
function ensureRollbackShakeStyle(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(ROLLBACK_SHAKE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ROLLBACK_SHAKE_STYLE_ID;
  style.textContent = [
    '@keyframes optimistic-rollback-shake {',
    '  0%, 100% { transform: translateX(0); }',
    '  20% { transform: translateX(-4px); }',
    '  40% { transform: translateX(4px); }',
    '  60% { transform: translateX(-3px); }',
    '  80% { transform: translateX(3px); }',
    '}',
    '.optimistic-rollback-shake { animation: optimistic-rollback-shake 0.4s ease; }',
    '@media (prefers-reduced-motion: reduce) {',
    '  .optimistic-rollback-shake { animation: none; }',
    '}',
  ].join('\n');
  document.head.appendChild(style);
}

/**
 * Trigger the error-shake animation on withdrawable balance elements (#695).
 * Falls back to a document-level CustomEvent (`optimistic-withdraw-rollback`)
 * so any mounted balance display can animate even without the data attribute.
 */
export function triggerRollbackShake(streamAddress: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  ensureRollbackShakeStyle();

  window.dispatchEvent(
    new CustomEvent('optimistic-withdraw-rollback', { detail: { streamAddress } }),
  );

  const selector = `[data-withdrawable="${streamAddress}"]`;
  const targets = document.querySelectorAll(selector);
  targets.forEach(el => {
    el.classList.remove('optimistic-rollback-shake');
    // Force reflow so repeated rollbacks re-trigger the animation.
    void (el as HTMLElement).offsetWidth;
    el.classList.add('optimistic-rollback-shake');
    window.setTimeout(() => el.classList.remove('optimistic-rollback-shake'), 450);
  });
}

/**
 * Roll back an optimistic withdraw update.
 *
 * When a withdrawal transaction reverts, the restored number no longer snaps
 * silently: an error-shake animation is triggered and a toast explains the
 * revert (#695). Pass `{ silent: true }` if the caller already surfaced the
 * failure to avoid a duplicate toast.
 */
export function rollbackWithdraw(
  qc: QueryClient,
  streamAddress: string,
  snapshot: bigint | undefined,
  options?: RollbackWithdrawOptions,
): void {
  const key = queryKeys.streams.withdrawable(streamAddress);
  if (snapshot !== undefined) {
    qc.setQueryData(key, snapshot);
  } else {
    qc.removeQueries({ queryKey: key });
  }

  triggerRollbackShake(streamAddress);

  if (options?.silent !== true && typeof window !== 'undefined') {
    const message =
      options?.reason ?? 'Withdrawal reverted — your balance was restored.';
    try {
      toast.error(message);
    } catch {
      // No toaster mounted — the CustomEvent above still lets UI animate.
    }
  }
}
