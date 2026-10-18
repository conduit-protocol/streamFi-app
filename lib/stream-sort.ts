import type { StreamInfo } from "./stream";

/** Sort options for the /streams list (#548). */
export type SortKey = "default" | "amount-asc" | "amount-desc" | "end-asc" | "end-desc";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "Default order" },
  { value: "amount-asc", label: "Amount: Low to High" },
  { value: "amount-desc", label: "Amount: High to Low" },
  { value: "end-asc", label: "End date: Soonest" },
  { value: "end-desc", label: "End date: Latest" },
];

export function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value);
}

/** Open-ended streams (endTime === 0) sort as if they end at +Infinity —
 *  they never appear "soonest" and always appear "latest". */
function endValue(endTime: number): number {
  return endTime === 0 ? Infinity : endTime;
}

// Memoized comparator cache for multi-key stream sorting (#751)
const comparatorCache = new Map<SortKey, <T extends { info: Pick<StreamInfo, "ratePerSecond" | "endTime"> }>(a: T, b: T) => number>();

function getComparator<T extends { info: Pick<StreamInfo, "ratePerSecond" | "endTime"> }>(
  sort: SortKey,
): (a: T, b: T) => number {
  const cached = comparatorCache.get(sort);
  if (cached) return cached;

  let comparator: (a: T, b: T) => number;
  switch (sort) {
    case "amount-asc":
      comparator = (a, b) =>
        a.info.ratePerSecond < b.info.ratePerSecond ? -1 : a.info.ratePerSecond > b.info.ratePerSecond ? 1 : 0;
      break;
    case "amount-desc":
      comparator = (a, b) =>
        a.info.ratePerSecond > b.info.ratePerSecond ? -1 : a.info.ratePerSecond < b.info.ratePerSecond ? 1 : 0;
      break;
    case "end-asc":
      comparator = (a, b) => endValue(a.info.endTime) - endValue(b.info.endTime);
      break;
    case "end-desc":
      comparator = (a, b) => endValue(b.info.endTime) - endValue(a.info.endTime);
      break;
    default:
      comparator = () => 0;
      break;
  }

  comparatorCache.set(sort, comparator as any);
  return comparator;
}

export function sortStreams<T extends { info: Pick<StreamInfo, "ratePerSecond" | "endTime"> }>(
  rows: T[],
  sort: SortKey,
): T[] {
  if (sort === "default" || rows.length <= 1) return rows;
  const comparator = getComparator<T>(sort);
  return [...rows].sort(comparator);
}
