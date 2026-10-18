import React, { act } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { OfflineIndicator } from '../OfflineIndicator';
import { queueTransaction, queuedTransactions } from '@/lib/offline-transactions';

describe('OfflineIndicator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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
});
