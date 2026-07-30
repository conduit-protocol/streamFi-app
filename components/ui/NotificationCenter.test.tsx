import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { NotificationCenter } from './NotificationCenter';

describe('NotificationCenter', () => {
  let container: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    container?.remove();
    root = undefined;
    container = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root?.render(<NotificationCenter />));
    return container;
  }

  it('removes its event listener on unmount and bounds retained notifications', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const el = setup();

    act(() => {
      for (let i = 0; i < 8; i++) {
        window.dispatchEvent(new CustomEvent('notification', { detail: `Notice ${i}` }));
      }
      window.dispatchEvent(new CustomEvent('notification', { detail: null }));
    });

    expect(el.textContent).toContain('Notice 7');
    expect(el.textContent).not.toContain('Notice 0');

    act(() => root?.unmount());
    expect(removeListener).toHaveBeenCalledWith('notification', expect.any(Function));
  });

  it('auto-dismisses a notification after the TTL to prevent infinite loading spinners', () => {
    const el = setup();

    act(() => {
      window.dispatchEvent(new CustomEvent('notification', { detail: 'Loading…' }));
    });

    // Notification should be visible immediately
    expect(el.textContent).toContain('Loading…');

    // After TTL (10 s), the notification must be gone — fixes #195
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(el.textContent).not.toContain('Loading…');
  });

  it('clears all auto-dismiss timers on unmount to prevent memory leaks', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    setup();

    act(() => {
      window.dispatchEvent(new CustomEvent('notification', { detail: 'Notice A' }));
      window.dispatchEvent(new CustomEvent('notification', { detail: 'Notice B' }));
    });

    act(() => root?.unmount());

    // clearTimeout must have been called at least once for each notification timer
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('renders nothing when there are no notifications', () => {
    const el = setup();
    expect(el.firstChild).toBeNull();
  });

  it('ignores notification events with non-string or empty detail', () => {
    const el = setup();

    act(() => {
      window.dispatchEvent(new CustomEvent('notification', { detail: null }));
      window.dispatchEvent(new CustomEvent('notification', { detail: 42 }));
      window.dispatchEvent(new CustomEvent('notification', { detail: '' }));
    });

    expect(el.firstChild).toBeNull();
  });
});
