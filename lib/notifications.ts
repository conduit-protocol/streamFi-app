/**
 * Browser Web Push / Notifications API helper for stream milestones and claims (#754).
 */

export type NotificationPermissionState = NotificationPermission | 'unsupported';

/** localStorage flag written when the wallet creates its first stream (#810). */
export const FIRST_STREAM_CREATED_KEY = 'conduit:first-stream-created';

/** localStorage flag written once the permission prompt has been offered (#810). */
export const NOTIFICATION_PROMPT_SHOWN_KEY = 'conduit:notification-prompt-shown';

function readBooleanFlag(key: string): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeBooleanFlag(key: string, value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, value ? 'true' : 'false');
  } catch {
    /* storage is optional — a blocked write must not break the page */
  }
}

/**
 * Whether the user has created at least one stream. The notification prompt is
 * gated on this so we only ask after value has been demonstrated (#810).
 */
export function hasCreatedStream(): boolean {
  return readBooleanFlag(FIRST_STREAM_CREATED_KEY);
}

/** Record that the wallet has now created a stream (#810). */
export function markFirstStreamCreated(): void {
  writeBooleanFlag(FIRST_STREAM_CREATED_KEY, true);
}

/** Whether the contextual notification prompt has already been offered. */
export function hasPromptedForNotificationPermission(): boolean {
  return readBooleanFlag(NOTIFICATION_PROMPT_SHOWN_KEY);
}

function markNotificationPrompted(): void {
  writeBooleanFlag(NOTIFICATION_PROMPT_SHOWN_KEY, true);
}

export type NotificationChannel = 'email' | 'telegram' | 'browserPush';

export type NotificationEventKey =
  | 'streamCancel'
  | 'cliffReach'
  | 'streamCompleted'
  | 'fundsWithdrawn';

export interface NotificationChannelConfig {
  email: boolean;
  telegram: boolean;
  browserPush: boolean;
  emailAddress?: string;
  telegramHandle?: string;
}

export interface NotificationMatrix {
  streamCancel: { email: boolean; telegram: boolean; browserPush: boolean };
  cliffReach: { email: boolean; telegram: boolean; browserPush: boolean };
  streamCompleted: { email: boolean; telegram: boolean; browserPush: boolean };
  fundsWithdrawn: { email: boolean; telegram: boolean; browserPush: boolean };
}

export const DEFAULT_NOTIFICATION_CHANNELS: NotificationChannelConfig = {
  email: true,
  telegram: true,
  browserPush: true,
  emailAddress: '',
  telegramHandle: '',
};

export const DEFAULT_NOTIFICATION_MATRIX: NotificationMatrix = {
  streamCancel: { email: true, telegram: true, browserPush: true },
  cliffReach: { email: true, telegram: false, browserPush: true },
  streamCompleted: { email: true, telegram: true, browserPush: true },
  fundsWithdrawn: { email: false, telegram: true, browserPush: true },
};

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEventKey, { title: string; desc: string }> = {
  streamCancel: {
    title: 'Stream Cancelled',
    desc: 'Alert when a sender or recipient halts an active payment stream.',
  },
  cliffReach: {
    title: 'Cliff Reached',
    desc: 'Notice when a cliff vesting period ends and tokens become available.',
  },
  streamCompleted: {
    title: 'Stream Completed',
    desc: 'Confirmation when a stream reaches its full scheduled duration.',
  },
  fundsWithdrawn: {
    title: 'Funds Withdrawn',
    desc: 'Notification when streamed funds are claimed or withdrawn to a wallet.',
  },
};

/**
 * Check if the browser supports the Notifications API.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Current permission, or `'unsupported'` where the API is unavailable. */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Whether the contextual permission prompt should be shown: the API is
 * available, the user has created a stream, we have not asked before, and the
 * browser still reports the undecided `'default'` permission (#810).
 */
export function shouldRequestNotificationPermission(): boolean {
  if (!isNotificationSupported()) return false;
  if (!hasCreatedStream()) return false;
  if (hasPromptedForNotificationPermission()) return false;
  return Notification.permission === 'default';
}

/**
 * Request notification permissions from the user.
 *
 * This is the low-level primitive; UI should prefer
 * {@link requestNotificationPermissionAfterFirstStream} so the browser prompt
 * never appears before the user has created their first stream (#810).
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
 * Request notification permission *only* once the user has created their first
 * stream and only while the permission is still undecided (#810). Marks the
 * prompt as shown so the user is never nagged on later visits, and resolves to
 * the current permission when no request is warranted.
 */
export async function requestNotificationPermissionAfterFirstStream(): Promise<NotificationPermissionState> {
  if (!shouldRequestNotificationPermission()) return getNotificationPermission();
  markNotificationPrompted();
  return requestNotificationPermission();
}

/**
 * Remember that the user dismissed the contextual prompt so it is not offered
 * again (#810).
 */
export function dismissNotificationPermissionPrompt(): void {
  markNotificationPrompted();
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

/** Notify when a stream receives its scheduled deposit. */
export function notifyStreamFunded(streamId: string, amount?: string): Notification | null {
  return notifyStreamMilestone('Stream Funded', {
    body: amount ? `Stream ${streamId.slice(0, 8)}... received ${amount}.` : `Stream ${streamId.slice(0, 8)}... was funded.`,
    tag: `funded-${streamId}`,
  });
}

/** Notify when a stream is paused or resumed by its sender. */
export function notifyStreamPaused(streamId: string, paused = true): Notification | null {
  return notifyStreamMilestone(paused ? 'Stream Paused' : 'Stream Resumed', {
    body: `Stream ${streamId.slice(0, 8)}... was ${paused ? 'paused' : 'resumed'}.`,
    tag: `pause-${streamId}`,
  });
}

/** Notify when streamed funds are withdrawn. */
export function notifyStreamWithdrawn(streamId: string, amount?: string): Notification | null {
  return notifyStreamMilestone('Stream Withdrawal Confirmed', {
    body: amount ? `${amount} was withdrawn from stream ${streamId.slice(0, 8)}....` : `A withdrawal from stream ${streamId.slice(0, 8)}... was confirmed.`,
    tag: `withdraw-${streamId}`,
  });
}
