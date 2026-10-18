/** Stellar targets a ledger close roughly every 5 seconds. */
export const LEDGER_CLOSE_SECONDS = 5;

/** A known ledger sequence paired with the unix time (seconds) it was observed. */
export interface LedgerAnchor {
  sequence: number;
  timestamp: number;
}

/**
 * Estimate the ledger sequence at `timestamp` (unix seconds) by extrapolating
 * from a known anchor at the ~5s close cadence. Estimates drift with the real
 * close time, so callers should present the result as approximate.
 *
 * Returns null when no anchor is known or the estimate is not a valid ledger.
 */
export function estimateLedgerSequence(
  timestamp: number,
  anchor: LedgerAnchor | null | undefined,
): number | null {
  if (!anchor || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  const estimate = Math.round(
    anchor.sequence + (timestamp - anchor.timestamp) / LEDGER_CLOSE_SECONDS,
  );
  return estimate > 0 ? estimate : null;
}
