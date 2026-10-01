/**
 * Date-range filtering for the dashboard's aggregate totals (#547).
 *
 * Ranges are expressed as unix-second bounds, either of which may be `null`
 * to mean "unbounded". A stream is considered "in range" if its active
 * window overlaps the selected range at all — not just if it *started*
 * inside it — so a long-running stream still counts toward e.g. "this
 * month" totals even if it started earlier.
 */

export type DateRangePreset = "all" | "today" | "7d" | "30d" | "month" | "custom";

export interface DateRange {
  /** Inclusive lower bound (unix seconds), or null for no lower bound. */
  start: number | null;
  /** Inclusive upper bound (unix seconds), or null for no upper bound. */
  end: number | null;
}

export const DATE_RANGE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

/** The unbounded, "all time" range — filtering with this is a no-op. */
export const ALL_TIME_RANGE: DateRange = { start: null, end: null };

/**
 * Resolve a preset into a concrete { start, end } range, anchored to `now`
 * (defaults to the current time; accepts an override for testability).
 */
export function presetToRange(preset: DateRangePreset, now = Date.now()): DateRange {
  const nowSec = Math.floor(now / 1000);
  const startOfDay = (d: Date) => {
    d.setHours(0, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  };

  switch (preset) {
    case "today":
      return { start: startOfDay(new Date(now)), end: nowSec };
    case "7d":
      return { start: nowSec - 7 * 86_400, end: nowSec };
    case "30d":
      return { start: nowSec - 30 * 86_400, end: nowSec };
    case "month": {
      const d = new Date(now);
      d.setDate(1);
      return { start: startOfDay(d), end: nowSec };
    }
    case "all":
    case "custom":
    default:
      return ALL_TIME_RANGE;
  }
}

/**
 * Whether a stream's active window [startTime, endTime) overlaps `range`.
 * `endTime === 0` means the stream is open-ended (never stops on its own).
 */
export function streamInRange(
  streamStart: number,
  streamEnd: number,
  range: DateRange,
): boolean {
  if (range.start !== null && streamEnd !== 0 && streamEnd < range.start) {
    return false;
  }
  if (range.end !== null && streamStart > range.end) {
    return false;
  }
  return true;
}
