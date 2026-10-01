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

// ── Auto-withdraw threshold reminders (#696) ────────────────────────────────
// Recipients want a local reminder (email/browser notification) when their
// claimable balance reaches a specific threshold (e.g. > 100 USDC), instead
// of having to manually poll their streams.

/**
 * Default claimable-balance threshold (display units, e.g. `100` means 100
 * XLM/USDC/etc.) that triggers a reminder notification.
 */
export const DEFAULT_AUTO_WITHDRAW_THRESHOLD = 100;

/** Local-storage key for the user-configured reminder threshold. */
export const AUTO_WITHDRAW_THRESHOLD_STORAGE_KEY =
  'conduit:auto-withdraw-threshold';

/** Reads the reminder threshold from the env, falling back to the default. */
export function getDefaultAutoWithdrawThreshold(): number {
  const raw = process.env.NEXT_PUBLIC_AUTO_WITHDRAW_THRESHOLD;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_AUTO_WITHDRAW_THRESHOLD;
}

/**
 * Reads the user-configured auto-withdraw reminder threshold.
 * Priority: localStorage override → env default → hardcoded default.
 * Always returns a finite positive number.
 */
export function getAutoWithdrawThreshold(): number {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(
        AUTO_WITHDRAW_THRESHOLD_STORAGE_KEY,
      );
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
    } catch {
      // Storage can be unavailable (private mode / SSR) — fall through.
    }
  }
  return getDefaultAutoWithdrawThreshold();
}

/**
 * Persists the user-configured reminder threshold (display units).
 * Returns `true` when the value was accepted and stored.
 */
export function setAutoWithdrawThreshold(value: number): boolean {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(
      AUTO_WITHDRAW_THRESHOLD_STORAGE_KEY,
      String(value),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a claimable balance (display units, e.g. `"120.5"` or `120.5`)
 * has reached the reminder threshold.
 */
export function hasReachedWithdrawThreshold(
  balanceDisplay: string | number,
  threshold: number = getAutoWithdrawThreshold(),
): boolean {
  const value =
    typeof balanceDisplay === 'number'
      ? balanceDisplay
      : Number(balanceDisplay);
  return Number.isFinite(value) && Number.isFinite(threshold) && value >= threshold;
}

/** `true` when the browser Notification API is available. */
export function isNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    typeof Notification !== 'undefined'
  );
}

/**
 * Requests browser-notification permission when supported.
 * Resolves to the resulting permission (`'granted' | 'denied' | 'default'`).
 * Returns `'default'` when the API is unavailable (e.g. SSR).
 */
export async function requestThresholdNotificationPermission(): Promise<
  NotificationPermission
> {
  if (!isNotificationSupported()) return 'default';
  try {
    if (Notification.permission === 'granted') return 'granted';
    return await Notification.requestPermission();
  } catch {
    return 'default';
  }
}

/**
 * Fires a local browser notification that the claimable balance crossed the
 * configured threshold. No-op unless permission was granted. Returns `true`
 * when a notification was shown.
 */
export function notifyWithdrawThresholdReached(
  balanceDisplay: string | number,
  threshold: number = getAutoWithdrawThreshold(),
  tokenLabel = 'USDC',
): boolean {
  if (!isNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  if (!hasReachedWithdrawThreshold(balanceDisplay, threshold)) return false;
  try {
    new Notification('StreamFi — funds ready to withdraw', {
      body: `Your claimable balance (${balanceDisplay} ${tokenLabel}) reached your ${threshold} ${tokenLabel} reminder threshold.`,
      tag: 'streamfi-withdraw-threshold',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convenience helper: checks the balance against the threshold and, when
 * reached *and* notification permission is granted, shows a reminder.
 * Returns `true` when the threshold was reached (regardless of whether a
 * notification could be displayed).
 */
export function checkAndNotifyWithdrawThreshold(
  balanceDisplay: string | number,
  threshold: number = getAutoWithdrawThreshold(),
  tokenLabel = 'USDC',
): boolean {
  if (!hasReachedWithdrawThreshold(balanceDisplay, threshold)) return false;
  notifyWithdrawThresholdReached(balanceDisplay, threshold, tokenLabel);
  return true;
}
