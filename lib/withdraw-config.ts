/**
 * Configurable threshold above which a withdrawal is treated as "large" and
 * requires an extra explicit confirmation step before submission (#560).
 *
 * Expressed in the token's display units (e.g. `1000` means 1000
 * XLM/USDC/etc.), not stroops, since it's compared against the
 * already-formatted amount shown to the user.
 */
export const DEFAULT_LARGE_WITHDRAWAL_THRESHOLD = 1000;

/** Reads the configured threshold, falling back to the default when unset
 *  or invalid. */
export function getLargeWithdrawalThreshold(): number {
  const raw = process.env.NEXT_PUBLIC_LARGE_WITHDRAWAL_THRESHOLD;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_LARGE_WITHDRAWAL_THRESHOLD;
}

/**
 * Whether a withdrawal amount (display units, e.g. `"1200.5"`) meets or
 * exceeds the large-withdrawal threshold.
 */
export function isLargeWithdrawal(
  amountDisplay: string,
  threshold: number = getLargeWithdrawalThreshold(),
): boolean {
  const value = Number(amountDisplay);
  return Number.isFinite(value) && value >= threshold;
}
