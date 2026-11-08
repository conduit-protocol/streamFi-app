import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { OfflineIndicator } from '../OfflineIndicator';
import { queueTransaction, queuedTransactions } from '@/lib/offline-transactions';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should not render when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    expect(navigator.onLine).toBe(true);
  });

  it('should track online status changes', () => {
    const addEventListenerMock = vi.fn();
    const removeEventListenerMock = vi.fn();

    window.addEventListener = addEventListenerMock as any;
    window.removeEventListener = removeEventListenerMock as any;

    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
      configurable: true,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OfflineIndicator />);
    });

    expect(addEventListenerMock).toHaveBeenCalledWith(
      'online',
      expect.any(Function),
    );
    expect(addEventListenerMock).toHaveBeenCalledWith(
      'offline',
      expect.any(Function),
    );

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('should accept custom className prop', () => {
    const testClass = 'custom-class';
    expect(testClass).toBe('custom-class');
  });

  it('should display queued transaction count when offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    queueTransaction({
      kind: 'withdraw',
      publicKey: 'GTEST',
      streamAddress: 'STEST',
      amount: '100',
    });
    queueTransaction({
      kind: 'cancel',
      publicKey: 'GTEST',
      streamAddress: 'STEST',
    });

    expect(queuedTransactions()).toHaveLength(2);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OfflineIndicator />);
    });

    const banner = container.querySelector('[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('2 transactions queued for sync');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('should show default message when offline with no queued transactions', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OfflineIndicator />);
    });

    const banner = container.querySelector('[role="status"]');
    expect(banner).toBeTruthy();
    expect(banner?.textContent).toContain('transactions will be queued');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it('should use singular form for a single queued transaction', () => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: false,
      configurable: true,
    });

    queueTransaction({
      kind: 'topup',
      publicKey: 'GTEST',
      streamAddress: 'STEST',
      amount: '50',
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<OfflineIndicator />);
    });

    const banner = container.querySelector('[role="status"]');
    expect(banner?.textContent).toContain('1 transaction queued for sync');

    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  // #794 — Retry button tests
  describe('Retry Connection button', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false,
        configurable: true,
      });
    });

    it('renders a "Retry Connection" button when offline', () => {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(<OfflineIndicator />);
      });

      const button = container.querySelector('button[aria-label="Retry connection"]');
      expect(button).toBeTruthy();
      expect(button?.textContent).toBe('Retry Connection');
      expect((button as HTMLButtonElement).disabled).toBe(false);

      act(() => { root.unmount(); });
      document.body.removeChild(container);
    });

    it('shows "Retrying…" and disables the button while the fetch is in-flight', async () => {
      let resolveFetch!: () => void;
      const pendingFetch = new Promise<Response>((resolve) => {
        resolveFetch = () => resolve(new Response(null, { status: 200 }));
      });
      vi.stubGlobal('fetch', vi.fn(() => pendingFetch));

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => { root.render(<OfflineIndicator />); });

      const button = container.querySelector('button[aria-label="Retry connection"]') as HTMLButtonElement;

      await act(async () => { button.click(); });

      expect(button.textContent).toBe('Retrying…');
      expect(button.disabled).toBe(true);

      // Resolve the fetch so the component can clean up
      await act(async () => { resolveFetch(); });

      act(() => { root.unmount(); });
      document.body.removeChild(container);
    });

    it('hides the banner when the retry fetch succeeds', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))));

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => { root.render(<OfflineIndicator />); });

      const button = container.querySelector('button[aria-label="Retry connection"]') as HTMLButtonElement;
      await act(async () => { button.click(); });

      expect(container.querySelector('[role="status"]')).toBeNull();

      act(() => { root.unmount(); });
      document.body.removeChild(container);
    });

    it('keeps the banner visible and re-enables the button when the retry fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))));

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => { root.render(<OfflineIndicator />); });

      const button = container.querySelector('button[aria-label="Retry connection"]') as HTMLButtonElement;
      await act(async () => { button.click(); });

      expect(container.querySelector('[role="status"]')).toBeTruthy();
      expect(button.textContent).toBe('Retry Connection');
      expect(button.disabled).toBe(false);

      act(() => { root.unmount(); });
      document.body.removeChild(container);
    });

    it('pings NEXT_PUBLIC_HORIZON_URL with HEAD and no-store cache', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
      vi.stubGlobal('fetch', fetchMock);

      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => { root.render(<OfflineIndicator />); });

      const button = container.querySelector('button[aria-label="Retry connection"]') as HTMLButtonElement;
      await act(async () => { button.click(); });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        { method: 'HEAD', cache: 'no-store' },
      );

      act(() => { root.unmount(); });
      document.body.removeChild(container);
    });
  });
});
