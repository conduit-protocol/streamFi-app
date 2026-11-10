import type { StreamInfo } from "./stream";

/** Sort options for the /streams list (#548). */
export type SortKey = "default" | "amount-asc" | "amount-desc" | "end-asc" | "end-desc" | "claimable-desc";

/**
 * Sort key for "largest accrued claimable balance first" (#807). Recipients use
 * it to prioritise withdrawing from the streams that have accumulated the most
 * funds.
 */
export const CLAIMABLE_DESC: SortKey = "claimable-desc";

export interface StreamSortCriterion<T> { key: keyof T; direction?: "asc" | "desc"; }

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default", label: "Default order" },
  { value: "amount-asc", label: "Amount: Low to High" },
  { value: "amount-desc", label: "Amount: High to Low" },
  { value: "end-asc", label: "End date: Soonest" },
  { value: "end-desc", label: "End date: Latest" },
  { value: CLAIMABLE_DESC, label: "Claimable: High to Low" },
];

export function isSortKey(value: string | null): value is SortKey {
  return SORT_OPTIONS.some((o) => o.value === value);
}

/** Open-ended streams (endTime === 0) sort as if they end at +Infinity —
 *  they never appear "soonest" and always appear "latest". */
function endValue(endTime: number): number {
  return endTime === 0 ? Infinity : endTime;
}

/**
 * The subset of {@link StreamInfo} needed to *derive* an accrued claimable
 * balance. `startTime`, `withdrawn`, `paused` and `pausedAt` are optional so
 * callers that only care about the cheaper amount/end-date sorts (and older
 * fixtures) keep compiling.
 */
type SortableInfo = Pick<StreamInfo, "ratePerSecond" | "endTime"> &
  Partial<Pick<StreamInfo, "startTime" | "withdrawn" | "paused" | "pausedAt" | "cancelled">>;

export interface SortableStream {
  info: SortableInfo;
  /** On-chain claimable balance, when the caller already fetched it. */
  withdrawable?: bigint;
  /** Alias some callers use for the same value as {@link withdrawable}. */
  claimable?: bigint;
}

// Memoized comparator cache for multi-key stream sorting (#751)
const comparatorCache = new Map<SortKey, <T extends SortableStream>(a: T, b: T) => number>();

function getComparator<T extends SortableStream>(sort: SortKey): (a: T, b: T) => number {
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

/**
 * Accrued claimable balance of a stream: how much the recipient can withdraw
 * right now.
 *
 * When the caller supplies the on-chain `withdrawable` (or `claimable`) value,
 * that is authoritative and is returned as-is. Otherwise the amount is derived
 * from `ratePerSecond × elapsed − withdrawn`, honouring the end cap and the
 * frozen `pausedAt` reference used elsewhere in the app (#807).
 *
 * Limitation: `StreamInfo` has no cancellation timestamp, so a cancelled stream
 * is treated as if it kept accruing until `now`. Callers that need exact
 * values for cancelled streams should pass the on-chain `withdrawable`.
 */
export function claimableBalance<T extends SortableStream>(row: T, now: number): bigint {
  const explicit = row.withdrawable ?? row.claimable;
  if (typeof explicit === "bigint") return explicit > 0n ? explicit : 0n;

  const { ratePerSecond, endTime } = row.info;
  const startTime = row.info.startTime ?? 0;
  const withdrawn = row.info.withdrawn ?? 0n;
  const reference = row.info.paused && row.info.pausedAt ? row.info.pausedAt : now;

  let elapsed = Math.max(0, reference - startTime);
  if (endTime > 0) elapsed = Math.min(elapsed, Math.max(0, endTime - startTime));

  const accrued = ratePerSecond * BigInt(Math.floor(elapsed));
  const remaining = accrued - withdrawn;
  return remaining > 0n ? remaining : 0n;
}

/**
 * Comparator for {@link CLAIMABLE_DESC}: largest accrued claimable balance
 * first. `now` is passed in (rather than read from the clock inside the
 * comparator) so the same snapshot is used for every comparison.
 */
export function compareClaimableDesc<T extends SortableStream>(a: T, b: T, now: number): number {
  const aValue = claimableBalance(a, now);
  const bValue = claimableBalance(b, now);
  if (aValue === bValue) return 0;
  return aValue > bValue ? -1 : 1;
}

function sortStreamsByKey<T extends SortableStream>(
  rows: T[],
  sort: SortKey,
  now: number = Math.floor(Date.now() / 1000),
): T[] {
  if (sort === "default" || rows.length <= 1) return rows;

  if (sort === CLAIMABLE_DESC) {
    // BigInt arithmetic and Date.now() are evaluated once per row: doing it
    // inside the comparator would recompute on every comparison and leave the
    // ordering at the mercy of the clock. `index` keeps equal balances stable.
    return rows
      .map((row, index) => ({ row, index, value: claimableBalance(row, now) }))
      .sort((a, b) => (a.value === b.value ? a.index - b.index : a.value > b.value ? -1 : 1))
      .map(({ row }) => row);
  }

  const comparator = getComparator<T>(sort);
  return [...rows].sort(comparator);
}

/** Stable multi-criteria sorting; criteria are evaluated in declaration order. */
export function sortStreamsByCriteria<T extends object>(rows: readonly T[], criteria: readonly StreamSortCriterion<T>[]): T[] {
  return rows.map((value, index) => ({ value, index })).sort((a, b) => {
    for (const criterion of criteria) {
      const left = a.value[criterion.key];
      const right = b.value[criterion.key];
      if (left === right) continue;
      const direction = criterion.direction === "desc" ? -1 : 1;
      if (left == null) return -direction;
      if (right == null) return direction;
      return (left < right ? -1 : 1) * direction;
    }
    return a.index - b.index;
  }).map(({ value }) => value);
}

export function sortStreams<T extends SortableStream>(
  rows: T[], sort: SortKey, now?: number,
): T[];
export function sortStreams<T extends object>(
  rows: readonly T[], criteria: readonly StreamSortCriterion<T>[],
): T[];
export function sortStreams(
  rows: readonly any[], sortOrCriteria: SortKey | readonly StreamSortCriterion<any>[], now?: number,
): any[] {
  return Array.isArray(sortOrCriteria)
    ? sortStreamsByCriteria(rows, sortOrCriteria)
    : sortStreamsByKey([...rows], sortOrCriteria, now);
}
