/**
 * Convert stroops (bigint) to a human-readable display string.
 * @param stroops  Value in stroops (1 XLM = 10_000_000 stroops)
 * @param decimals Decimal places for the token (default 7 for XLM/USDC on Stellar)
 */
export function fromStroops(stroops: bigint, decimals = 7): string {
  const factor = 10n ** BigInt(decimals);
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / factor;
  const frac = decimals > 0 ? (abs % factor).toString().padStart(decimals, "0") : "";
  // Trim trailing zeros but keep at least 2 decimal places (if decimals >= 2)
  const minDecimals = Math.min(2, decimals);
  const trimmed = frac.replace(/0+$/, "").padEnd(minDecimals, "0");
  return decimals > 0 ? `${negative ? "-" : ""}${whole}.${trimmed}` : `${negative ? "-" : ""}${whole}`;
}

/** 
 * Convert a display amount string to stroops bigint.
 * 
 * @throws Error if input is invalid/malformed or if the fractional part has more decimals than the token supports
 */
export function toStroops(amount: string, decimals = 7): bigint {
  if (typeof amount !== "string") {
    throw new Error(`Invalid amount: expected string, got ${typeof amount}`);
  }
  const trimmed = amount.trim();
  if (!trimmed) {
    throw new Error('Invalid amount: amount cannot be empty');
  }

  // Regex validation: optional sign, digits before and/or after decimal, optional non-negative scientific exponent
  const match = trimmed.match(/^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]\+?(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid amount: "${amount}"`);
  }

  const sign = match[1] || "";
  const isNegative = sign === "-";
  const intPart = match[2] ?? (match[4] ? "0" : "0");
  const fracPart = match[3] ?? match[4] ?? "";
  const expStr = match[5];

  let whole = intPart;
  let frac = fracPart;

  if (expStr !== undefined) {
    const exp = parseInt(expStr, 10);
    if (exp > 100) {
      throw new Error(`Invalid amount: exponent too large in "${amount}"`);
    }
    const cleanW = whole.replace(/^0+/, "") || "0";
    if (frac.length <= exp) {
      const combined = (cleanW === "0" ? "" : cleanW) + frac + "0".repeat(exp - frac.length);
      whole = combined.replace(/^0+/, "") || "0";
      frac = "";
    } else {
      const shifted = frac.slice(0, exp);
      const combined = (cleanW === "0" ? "" : cleanW) + shifted;
      whole = combined.replace(/^0+/, "") || "0";
      frac = frac.slice(exp);
    }
  }

  // Issue #320: Reject amounts with more decimal places than the token supports
  // instead of silently truncating, which can lead to users submitting different
  // amounts than they intended (e.g., 100.123456789 becomes 100.1234567 for XLM).
  if (frac.length > decimals) {
    throw new Error(
      `Amount has ${frac.length} decimal places but token only supports ${decimals}. ` +
      `Please round to ${decimals} decimals or fewer.`
    );
  }

  const factor = 10n ** BigInt(decimals);
  const fracPadded = frac.padEnd(decimals, "0");
  const result = BigInt(whole) * factor + (fracPadded ? BigInt(fracPadded) : 0n);
  return isNegative && result !== 0n ? -result : result;
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
  // Use en-US explicitly and pin timeZone to UTC to avoid hydration mismatch
  // between the server (typically UTC) and the browser (local tz).
  return new Date(ts * 1000).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a unix timestamp as a relative string ("2h ago") for recent events,
 * falling back to the absolute locale string for anything older than 7 days.
 *
 * Thresholds:
 *  < 45 s  → "just now"
 *  < 1 h   → "Xm ago"
 *  < 24 h  → "Xh ago"
 *  < 7 d   → "Xd ago"
 *  ≥ 7 d   → formatTimestamp(ts)  (absolute fallback)
 *
 * Added for issue #556 — settings toggle between relative and absolute time.
 */
export function formatTimestampRelative(ts: number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const delta = nowSeconds - ts;

  if (delta < 45) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 7) return `${Math.floor(delta / 86400)}d ago`;

  return formatTimestamp(ts);
}

/** Format seconds into a human-readable duration */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 7))}w`;
}

/** Truncate a Stellar address for display: GABC…XYZ */
export function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

export interface FormatAmountOptions {
  /**
   * BCP 47 locale tag used for `Intl.NumberFormat`.
   * Defaults to the browser/runtime locale (`undefined` → system default).
   * Pass `"en-US"` to get US-style "1,234.56", `"de-DE"` for "1.234,56", etc.
   */
  locale?: string;
  /** Token decimals (1 XLM = 10^decimals stroops). Defaults to 7. */
  decimals?: number;
  /**
   * ISO 4217 currency code (e.g. "USD", "EUR").
   * When provided the value is formatted as currency (symbol + grouping).
   * When omitted it is formatted as a plain decimal number.
   */
  currency?: string;
  /**
   * Minimum fraction digits shown. Defaults to 2, or 0 when the
   * token has 0 decimals.
   */
  minimumFractionDigits?: number;
  /**
   * Maximum fraction digits shown. Defaults to `decimals`, capped at 20
   * (the `Intl.NumberFormat` hard limit).
   */
  maximumFractionDigits?: number;
}

/**
 * Format a stroops bigint as a locale-aware amount string.
 *
 * Routes through `Intl.NumberFormat` so grouping separators, decimal
 * marks, and (optionally) currency symbols follow the user's locale
 * rather than a hardcoded US convention. Fixes issue #557.
 *
 * @example
 * formatAmount(1_234_567_890n)                          // "123.46" (system locale)
 * formatAmount(1_234_567_890n, { locale: "en-US" })     // "123.46"
 * formatAmount(1_234_567_890n, { locale: "de-DE" })     // "123,46"
 * formatAmount(10_000_000_000n, { locale: "en-IN" })    // "1,000.00"
 * formatAmount(10_000_000_000n, { locale: "de-DE", currency: "EUR" }) // "1.000,00 €"
 */
export function formatAmount(
  stroops: bigint,
  {
    locale,
    decimals = 7,
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }: FormatAmountOptions = {},
): string {
  // Convert to a plain JS number for Intl.NumberFormat.
  // BigInt division loses sub-stroop precision intentionally — we only need
  // display precision, not round-trip accuracy.
  const factor = 10 ** decimals;
  const value = Number(stroops) / factor;

  const minFrac = minimumFractionDigits ?? (decimals > 0 ? 2 : 0);
  const maxFrac = maximumFractionDigits ?? Math.min(decimals, 20);

  const nfOptions: Intl.NumberFormatOptions = currency
    ? {
        style: "currency",
        currency,
        minimumFractionDigits: minFrac,
        maximumFractionDigits: maxFrac,
      }
    : {
        style: "decimal",
        minimumFractionDigits: minFrac,
        maximumFractionDigits: maxFrac,
      };

  return new Intl.NumberFormat(locale, nfOptions).format(value);
}
