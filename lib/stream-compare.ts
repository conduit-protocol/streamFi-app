import type { StreamInfo } from '@/lib/stream';

export type StreamStatus = 'active' | 'paused' | 'ended' | 'cancelled';

/** Selecting more than this many streams makes the comparison table too wide
 *  to read on anything but a very large screen. */
export const MAX_COMPARE = 4;
export const MIN_COMPARE = 2;

export interface CompareMetrics {
  status:          StreamStatus;
  /** 0–100, or null for open-ended streams (endTime === 0) */
  progressPct:     number | null;
  /** Seconds of streaming left, or null for open-ended streams */
  remainingSec:    number | null;
  ratePerDay:      bigint;
  /** Tokens still to be streamed (rate × remaining), or null if open-ended */
  remainingAmount: bigint | null;
}

export function deriveStatus(info: StreamInfo, now: number): StreamStatus {
  if (info.cancelled) return 'cancelled';
  if (info.paused) return 'paused';
  if (info.endTime > 0 && now >= info.endTime) return 'ended';
  return 'active';
}

/** Snapshot the metrics shown side-by-side on /streams/compare. Paused
 *  streams are frozen at `pausedAt`, matching StreamCard / StreamProgressBar. */
export function compareMetrics(info: StreamInfo, now: number): CompareMetrics {
  const status     = deriveStatus(info, now);
  const ratePerDay = info.ratePerSecond * 86_400n;
  const total      = info.endTime - info.startTime;

  if (info.endTime === 0 || total <= 0) {
    return { status, progressPct: null, remainingSec: null, ratePerDay, remainingAmount: null };
  }

  const reference = status === 'paused' && info.pausedAt ? info.pausedAt : now;
  const elapsed   = Math.min(total, Math.max(0, reference - info.startTime));
  const progressPct = status === 'ended' ? 100 : (elapsed / total) * 100;
  // Ended and cancelled streams will never stream again.
  const remainingSec = status === 'ended' || status === 'cancelled' ? 0 : total - elapsed;

  return {
    status,
    progressPct,
    remainingSec,
    ratePerDay,
    remainingAmount: info.ratePerSecond * BigInt(remainingSec),
  };
}

/** Parse the `?ids=1,2,3` query param into a de-duplicated list of numeric
 *  stream ids, dropping anything that isn't a non-negative integer. */
export function parseCompareIds(param: string | null): string[] {
  if (!param) return [];
  const ids = param
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
  return Array.from(new Set(ids)).slice(0, MAX_COMPARE);
}
