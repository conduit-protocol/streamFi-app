/**
 * Convert stroops (bigint) to a human-readable display string.
 * @param stroops  Value in stroops (1 XLM = 10_000_000 stroops)
 * @param decimals Decimal places for the token (default 7 for XLM/USDC on Stellar)
 */
export function fromStroops(stroops: bigint, decimals = 7): string {
  const factor  = BigInt(10 ** decimals);
  const whole   = stroops / factor;
  const frac    = (stroops % factor).toString().padStart(decimals, '0');
  // Trim trailing zeros but keep at least 2 decimal places
  const trimmed = frac.replace(/0+$/, '').padEnd(2, '0');
  return `${whole}.${trimmed}`;
}

/** Convert a display amount string to stroops bigint */
export function toStroops(amount: string, decimals = 7): bigint {
  const [whole = '0', frac = ''] = amount.split('.');
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(fracPadded);
}

/** Format a unix timestamp as a locale date-time string */
export function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

/** Format seconds into a human-readable duration */
export function formatDuration(seconds: number): string {
  if (seconds < 60)       return `${seconds}s`;
  if (seconds < 3600)     return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)    return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 86400 * 7) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / (86400 * 7))}w`;
}

/** Truncate a Stellar address for display: GABC…XYZ */
export function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}
