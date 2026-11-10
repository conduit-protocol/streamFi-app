import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FirstStreamNotificationPrompt } from '../FirstStreamNotificationPrompt';
import { markFirstStreamCreated } from '@/lib/notifications';

const PROMPT_SHOWN_KEY = 'conduit:notification-prompt-shown';

interface NotificationMock {
  permission: NotificationPermission;
  requestPermission: ReturnType<typeof vi.fn>;
}

function installNotification(permission: NotificationPermission, result?: NotificationPermission): NotificationMock {
  const requestPermission = vi.fn(async () => {
    const next = result ?? permission;
    MockNotification.permission = next;
    return next;
  });
  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermission;
    constructor(_title: string, _options?: NotificationOptions) {}
  }
  (globalThis as unknown as { Notification: unknown }).Notification = MockNotification;
  (window as unknown as { Notification: unknown }).Notification = MockNotification;
  return { permission, requestPermission };
}

function uninstallNotification() {
  delete (globalThis as unknown as { Notification?: unknown }).Notification;
  delete (window as unknown as { Notification?: unknown }).Notification;
}

function render(firstStream: boolean) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(FirstStreamNotificationPrompt, { firstStream }));
  });
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => root.unmount());
  document.body.removeChild(container);
}

describe('FirstStreamNotificationPrompt (#810)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    markFirstStreamCreated();
  });

  afterEach(() => {
    uninstallNotification();
    window.localStorage.clear();
  });

  it('renders nothing when this was not the first stream', () => {
    installNotification('default');
    const { container, root } = render(false);
    expect(container.textContent).toBe('');
    cleanup(root, container);
  });

  it('renders nothing when the browser does not support notifications', () => {
    const { container, root } = render(true);
    expect(container.textContent).toBe('');
    cleanup(root, container);
  });

  it('offers the opt-in after the first stream while permission is undecided', () => {
    installNotification('default');
    const { container, root } = render(true);
    expect(container.textContent).toContain('Get notified when your stream pays out');
    cleanup(root, container);
  });

  it('requests permission when the user opts in', async () => {
    const notification = installNotification('default', 'granted');
    const { container, root } = render(true);

    const enable = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Enable notifications'),
    ) as HTMLButtonElement;

    await act(async () => {
      enable.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
    cleanup(root, container);
  });

  it('dismissing marks the prompt as shown and hides it', async () => {
    const notification = installNotification('default');
    const { container, root } = render(true);

    const dismiss = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Not now'),
    ) as HTMLButtonElement;

    await act(async () => {
      dismiss.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PROMPT_SHOWN_KEY)).toBe('true');
    expect(container.textContent).toBe('');
    cleanup(root, container);
  });
});
