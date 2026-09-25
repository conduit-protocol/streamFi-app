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

export function sortStreams<T extends { info: Pick<StreamInfo, "ratePerSecond" | "endTime"> }>(
  rows: T[],
  sort: SortKey,
): T[] {
  if (sort === "default") return rows;
  const sorted = [...rows];
  switch (sort) {
    case "amount-asc":
      sorted.sort((a, b) =>
        a.info.ratePerSecond < b.info.ratePerSecond ? -1 : a.info.ratePerSecond > b.info.ratePerSecond ? 1 : 0,
      );
      break;
    case "amount-desc":
      sorted.sort((a, b) =>
        a.info.ratePerSecond > b.info.ratePerSecond ? -1 : a.info.ratePerSecond < b.info.ratePerSecond ? 1 : 0,
      );
      break;
    case "end-asc":
      sorted.sort((a, b) => endValue(a.info.endTime) - endValue(b.info.endTime));
      break;
    case "end-desc":
      sorted.sort((a, b) => endValue(b.info.endTime) - endValue(a.info.endTime));
      break;
  }
  return sorted;
}
