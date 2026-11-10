import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockSignTx = vi.fn();
let currentPublicKey: string | null = 'GTESTPUBLICKEY';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({ publicKey: currentPublicKey, signTx: mockSignTx }),
}));

let queued: { id: string }[] = [];

vi.mock('@/lib/offline-transactions', async () => {
  const actual = await vi.importActual<typeof import('@/lib/offline-transactions')>('@/lib/offline-transactions');
  return {
    startOnlineSync: vi.fn(),
    stopOnlineSync: vi.fn(),
    flushQueuedTransactions: vi.fn().mockResolvedValue(undefined),
    queuedTransactions: vi.fn(() => queued),
    queuedDraftsLabel: actual.queuedDraftsLabel,
    OFFLINE_QUEUE_STORAGE_KEY: actual.OFFLINE_QUEUE_STORAGE_KEY,
  };
});

import { OfflineTransactionSync } from '../OfflineTransactionSync';
import {
  startOnlineSync,
  stopOnlineSync,
  flushQueuedTransactions,
} from '@/lib/offline-transactions';

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(OfflineTransactionSync));
  });
  return { container, root };
}

function cleanup(root: ReturnType<typeof createRoot>, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

describe('OfflineTransactionSync (#809)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = 'GTESTPUBLICKEY';
    queued = [];
  });

  it('binds the online listener and flushes once when a wallet is connected', async () => {
    const { container, root } = render();
    await act(async () => { await Promise.resolve(); });

    expect(startOnlineSync).toHaveBeenCalledWith(mockSignTx);
    expect(flushQueuedTransactions).toHaveBeenCalledWith(mockSignTx);

    cleanup(root, container);
  });

  it('detaches the listener on unmount', () => {
    const { container, root } = render();
    cleanup(root, container);
    expect(stopOnlineSync).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a disconnected wallet', () => {
    currentPublicKey = null;
    const { container, root } = render();

    expect(startOnlineSync).not.toHaveBeenCalled();
    expect(flushQueuedTransactions).not.toHaveBeenCalled();

    cleanup(root, container);
  });
});

describe('OfflineTransactionSync queue badge (#795)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = 'GTESTPUBLICKEY';
    queued = [];
  });

  it('renders nothing while the queue is empty', () => {
    const { container, root } = render();
    expect(container.textContent).toBe('');
    cleanup(root, container);
  });

  it('shows how many drafts are queued offline', () => {
    queued = [{ id: 'a' }, { id: 'b' }];
    const { container, root } = render();
    expect(container.textContent).toContain('2 drafts queued offline');
    expect(container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('2 drafts queued offline');
    cleanup(root, container);
  });

  it('uses the singular for one draft', () => {
    queued = [{ id: 'a' }];
    const { container, root } = render();
    expect(container.textContent).toContain('1 draft queued offline');
    cleanup(root, container);
  });

  it('updates the count when the queue changes', () => {
    const { container, root } = render();
    expect(container.textContent).toBe('');
    queued = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    act(() => { window.dispatchEvent(new Event('offline-transactions-changed')); });
    expect(container.textContent).toContain('3 drafts queued offline');
    queued = [];
    act(() => { window.dispatchEvent(new Event('offline-transactions-changed')); });
    expect(container.textContent).toBe('');
    cleanup(root, container);
  });

  it('updates the count when another tab changes the queue', () => {
    const { container, root } = render();
    queued = [{ id: 'a' }];
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'conduit-offline-transactions' }));
    });
    expect(container.textContent).toContain('1 draft queued offline');
    cleanup(root, container);
  });
});
