import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  FIRST_STREAM_CREATED_KEY,
  NOTIFICATION_PROMPT_SHOWN_KEY,
  dismissNotificationPermissionPrompt,
  getNotificationPermission,
  hasCreatedStream,
  hasPromptedForNotificationPermission,
  isNotificationSupported,
  markFirstStreamCreated,
  notifyClaimConfirmed,
  notifyStreamFunded,
  notifyStreamPaused,
  notifyStreamWithdrawn,
  notifyStreamMilestone,
  requestNotificationPermission,
  requestNotificationPermissionAfterFirstStream,
  shouldRequestNotificationPermission,
} from './notifications';

interface MockNotificationConstructor {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
  instances: Array<{ title: string; options?: NotificationOptions }>;
}

let mock: MockNotificationConstructor | null = null;

function installNotification(permission: NotificationPermission, result?: NotificationPermission) {
  const instances: Array<{ title: string; options?: NotificationOptions }> = [];
  const requestPermission = vi.fn(async () => {
    const next = result ?? permission;
    MockNotification.permission = next;
    return next;
  });

  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermission;
    constructor(public title: string, public options?: NotificationOptions) {
      instances.push({ title, options });
    }
  }

  (globalThis as unknown as { Notification: unknown }).Notification = MockNotification;
  (window as unknown as { Notification: unknown }).Notification = MockNotification;
  mock = { permission, requestPermission, instances };
  return mock;
}

function uninstallNotification() {
  delete (globalThis as unknown as { Notification?: unknown }).Notification;
  delete (window as unknown as { Notification?: unknown }).Notification;
  mock = null;
}

describe('notifications — first-stream permission gating (#810)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    uninstallNotification();
    window.localStorage.clear();
  });

  it('tracks whether the user has created a stream', () => {
    expect(hasCreatedStream()).toBe(false);
    markFirstStreamCreated();
    expect(hasCreatedStream()).toBe(true);
    expect(window.localStorage.getItem(FIRST_STREAM_CREATED_KEY)).toBe('true');
  });

  it('reports unsupported when the Notifications API is missing', () => {
    expect(isNotificationSupported()).toBe(false);
    expect(getNotificationPermission()).toBe('unsupported');
    expect(shouldRequestNotificationPermission()).toBe(false);
  });

  it('does not ask before the first stream is created', async () => {
    const notification = installNotification('default');
    expect(shouldRequestNotificationPermission()).toBe(false);

    const result = await requestNotificationPermissionAfterFirstStream();

    expect(result).toBe('default');
    expect(notification.requestPermission).not.toHaveBeenCalled();
    // Gated-out calls must not burn the one-shot prompt flag.
    expect(hasPromptedForNotificationPermission()).toBe(false);
  });

  it('asks once after the first stream, then remembers it was asked', async () => {
    const notification = installNotification('default', 'granted');
    markFirstStreamCreated();
    expect(shouldRequestNotificationPermission()).toBe(true);

    const first = await requestNotificationPermissionAfterFirstStream();
    expect(first).toBe('granted');
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(hasPromptedForNotificationPermission()).toBe(true);

    const second = await requestNotificationPermissionAfterFirstStream();
    expect(second).toBe('granted');
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('does not ask when permission was already granted or denied', async () => {
    const granted = installNotification('granted');
    markFirstStreamCreated();
    expect(shouldRequestNotificationPermission()).toBe(false);
    expect(await requestNotificationPermissionAfterFirstStream()).toBe('granted');
    expect(granted.requestPermission).not.toHaveBeenCalled();

    uninstallNotification();
    window.localStorage.clear();
    const denied = installNotification('denied');
    markFirstStreamCreated();
    expect(shouldRequestNotificationPermission()).toBe(false);
    expect(await requestNotificationPermissionAfterFirstStream()).toBe('denied');
    expect(denied.requestPermission).not.toHaveBeenCalled();
  });

  it('stays silent after the prompt is dismissed', async () => {
    const notification = installNotification('default');
    markFirstStreamCreated();
    dismissNotificationPermissionPrompt();

    expect(shouldRequestNotificationPermission()).toBe(false);
    await requestNotificationPermissionAfterFirstStream();
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(NOTIFICATION_PROMPT_SHOWN_KEY)).toBe('true');
  });

  it('requestNotificationPermission is a low-level primitive that still asks when capable', async () => {
    const notification = installNotification('default', 'granted');
    expect(await requestNotificationPermission()).toBe('granted');
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('returns unsupported from the request helper without the API', async () => {
    expect(await requestNotificationPermissionAfterFirstStream()).toBe('unsupported');
  });
});

describe('notifications — dispatch (#754)', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => uninstallNotification());

  it('does not dispatch when permission is not granted', () => {
    installNotification('default');
    expect(notifyStreamMilestone('hello')).toBeNull();
  });

  it('dispatches a milestone notification when permission is granted', () => {
    const notification = installNotification('granted');
    const result = notifyStreamMilestone('Stream funded', { body: 'ready' });
    expect(result).not.toBeNull();
    expect(notification.instances).toHaveLength(1);
    expect(notification.instances[0].title).toBe('Stream funded');
    expect(notification.instances[0].options?.body).toBe('ready');
  });

  it('forwards claim confirmations through the milestone helper', () => {
    const notification = installNotification('granted');
    notifyClaimConfirmed('1234567890', '10 XLM');
    expect(notification.instances).toHaveLength(1);
    expect(notification.instances[0].options?.tag).toBe('claim-1234567890');
  });

  it('dispatches named funding, pause, and withdrawal milestones', () => {
    const notification = installNotification('granted');
    notifyStreamFunded('stream-1', '10 XLM');
    notifyStreamPaused('stream-1');
    notifyStreamWithdrawn('stream-1', '2 XLM');
    expect(notification.instances.map((item) => item.title)).toEqual([
      'Stream Funded', 'Stream Paused', 'Stream Withdrawal Confirmed',
    ]);
  });
});
