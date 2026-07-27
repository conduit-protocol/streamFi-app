/**
 * Convert stroops (bigint) to a human-readable display string.
 * @param stroops  Value in stroops (1 XLM = 10_000_000 stroops)
 * @param decimals Decimal places for the token (default 7 for XLM/USDC on Stellar)
 */
export function fromStroops(stroops: bigint, decimals = 7): string {
  const factor = BigInt(10 ** decimals);
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / factor;
  const frac = (abs % factor).toString().padStart(decimals, "0");
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = frac.replace(/0+$/, "").padEnd(2, "0");
  return `${negative ? "-" : ""}${whole}.${trimmed}`;
}

/** Convert a display amount string to stroops bigint */
export function toStroops(amount: string, decimals = 7): bigint {
  const factor = BigInt(10 ** decimals);
  const negative = amount.trim().startsWith("-");
  const raw = negative ? amount.trim().slice(1) : amount.trim();
  const [wholeRaw = "0", frac = ""] = raw.split(".");
  const whole = wholeRaw || "0";
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
  const result = BigInt(whole) * factor + BigInt(fracPadded);
  return negative ? -result : result;
}

/**
 * Returns true if a deposit/duration combination would truncate to a
 * per-second release rate of exactly zero.
 *
 * `depositStroops / durationSeconds` is a bigint division and truncates
 * toward zero — a small deposit spread over a long duration (e.g. the
 * default 30-day stream) can silently compute to a rate of 0n, locking
 * funds into a stream that can never actually release anything. See
 * issue #243.
 */
export function wouldRateTruncateToZero(
  depositAmount: string,
  decimals: number,
  durationSeconds: number,
): boolean {
  if (!depositAmount || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return false;
  }
  let depositStroops: bigint;
  try {
    depositStroops = toStroops(depositAmount, decimals);
  } catch {
    return false;
  }
  if (depositStroops <= 0n) return false;
  return depositStroops / BigInt(Math.floor(durationSeconds)) === 0n;
}

/** Format a unix timestamp as a locale date-time string */
export function formatTimestamp(ts: number): string {
  // Use en-US explicitly to avoid hydration mismatch between the server
  // (which may use a different default locale than the browser).
  return new Date(ts * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format seconds into a human-readable duration */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / (86400 * 7))}w`;
}

/** Truncate a Stellar address for display: GABC…XYZ */
export function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}
