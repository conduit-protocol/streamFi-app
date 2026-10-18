/**
 * Browser Web Push / Notifications API helper for stream milestones and claims (#754).
 */

export type NotificationPermissionState = NotificationPermission | 'unsupported';

/**
 * Check if the browser supports the Notifications API.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Request notification permissions from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Dispatch a browser notification when a stream milestone or claim completes.
 */
export function notifyStreamMilestone(title: string, options?: NotificationOptions): Notification | null {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    return new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
  } catch (error) {
    console.warn('[notifications] Failed to dispatch notification:', error);
    return null;
  }
}

/**
 * Convenience helper to notify user when a stream claim or milestone is confirmed.
 */
export function notifyClaimConfirmed(streamId: string, amount?: string): void {
  notifyStreamMilestone('Stream Claim Confirmed', {
    body: amount
      ? `Your claim of ${amount} for stream ${streamId.slice(0, 8)}... has been confirmed.`
      : `Your stream milestone claim for ${streamId.slice(0, 8)}... has been confirmed.`,
    tag: `claim-${streamId}`,
  });
}
