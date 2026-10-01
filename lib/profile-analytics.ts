import type { StreamInfo } from "@/lib/stream";

export const CASHFLOW_WINDOW_DAYS = 30;
const DAY_S = 86_400;

export interface CashflowStream {
  info: StreamInfo;
  /** "incoming" = user is recipient, "outgoing" = user is sender */
  direction: "incoming" | "outgoing";
}

export interface DailyFlow {
  /** Unix seconds at UTC midnight starting this bucket */
  dayStart: number;
  /** Short label, e.g. "Sep 12" */
  label: string;
  incoming: bigint;
  outgoing: bigint;
}

export interface CashflowSummary {
  totalIncoming: bigint;
  totalOutgoing: bigint;
  net: bigint;
  daily: DailyFlow[];
}

/** Floor a unix timestamp to UTC midnight. */
export function startOfUtcDay(ts: number): number {
  return Math.floor(ts / DAY_S) * DAY_S;
}

/**
 * Aggregate per-day streamed volume over the trailing `days` window ending at
 * `nowSeconds` (#690).
 *
 * Volume for a stream on a given day is `ratePerSecond × overlapped seconds`
 * between the stream's [startTime, effectiveEnd] interval and the day bucket,
 * where effectiveEnd is `min(endTime || now, now)`. Cancelled/ended streams
 * naturally contribute zero after they stop. Pause skew is intentionally
 * ignored — analytics are an estimate, not settlement accounting.
 */
export function computeCashflow(
  streams: CashflowStream[],
  nowSeconds: number,
  days: number = CASHFLOW_WINDOW_DAYS,
): CashflowSummary {
  const todayStart = startOfUtcDay(nowSeconds);
  const windowStart = todayStart - (days - 1) * DAY_S;

  const daily: DailyFlow[] = Array.from({ length: days }, (_, i) => {
    const dayStart = windowStart + i * DAY_S;
    return {
      dayStart,
      label: new Date(dayStart * 1000).toLocaleDateString("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }),
      incoming: 0n,
      outgoing: 0n,
    };
  });

  let totalIncoming = 0n;
  let totalOutgoing = 0n;

  for (const { info, direction } of streams) {
    if (info.ratePerSecond <= 0n) continue;
    const streamStart = info.startTime;
    const streamEnd = info.endTime > 0 ? Math.min(info.endTime, nowSeconds) : nowSeconds;
    if (streamEnd <= streamStart) continue;
    // Skip streams that ended before the window or start in the future.
    if (streamEnd <= windowStart || streamStart >= todayStart + DAY_S) continue;

    for (const bucket of daily) {
      const bucketEnd = bucket.dayStart + DAY_S;
      const overlap = Math.min(streamEnd, bucketEnd) - Math.max(streamStart, bucket.dayStart);
      if (overlap <= 0) continue;
      const volume = info.ratePerSecond * BigInt(Math.floor(overlap));
      if (direction === "incoming") {
        bucket.incoming += volume;
        totalIncoming += volume;
      } else {
        bucket.outgoing += volume;
        totalOutgoing += volume;
      }
    }
  }

  return { totalIncoming, totalOutgoing, net: totalIncoming - totalOutgoing, daily };
}
