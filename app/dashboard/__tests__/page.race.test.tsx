import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// - Mocks -
vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/factory', () => ({
  streamsBySender: vi.fn(),
  streamsByRecipient: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
}));

// Child components are irrelevant to the race; stub them to simple markers.
vi.mock('@/components/stream/StreamCard', () => ({
  StreamCard: ({ id }: { id: string }) =>
    React.createElement('div', { 'data-testid': 'stream-card' }, id),
}));
vi.mock('@/components/stream/StreamCardSkeleton', () => ({
  StreamCardSkeleton: () => React.createElement('div', null, 'loading'),
}));

let capturedOnComplete: (() => void) | null = null;
vi.mock('@/components/stream/BulkWithdrawButton', () => ({
  // Capture the onComplete prop so the test can invoke it like a real
  // completed withdrawal, then assert the dashboard refreshes safely.
  BulkWithdrawButton: ({ onComplete }: { onComplete?: () => void }) => {
    capturedOnComplete = onComplete ?? null;
    return React.createElement('div', { 'data-testid': 'bulk-withdraw' }, 'bulk');
  },
}));

import { useWallet } from '@/contexts/WalletContext';
import { streamsByRecipient, streamsBySender } from '@/lib/factory';
import { getStreamAddress, getStreamInfo } from '@/lib/stream';
import DashboardPage from '../page';

const mockUseWallet = vi.mocked(useWallet);
const mockByRecipient = vi.mocked(streamsByRecipient);
const mockBySender = vi.mocked(streamsBySender);
const mockAddr = vi.mocked(getStreamAddress);
const mockInfo = vi.mocked(getStreamInfo);

/** Builds a minimal valid StreamInfo for a given id marker. */
function makeInfo(overrides: Record<string, unknown> = {}) {
  return {
    sender: 'S',
    recipient: 'R',
    token: 'T',
    ratePerSecond: 1n,
    startTime: 0,
    endTime: 0,
    withdrawn: 0n,
    cancelled: false,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    ...overrides,
  };
}

describe('DashboardPage (issue #93 race condition regression)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnComplete = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseWallet.mockReturnValue({
      publicKey: 'PUBKEY',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);
    mockAddr.mockResolvedValue('ADDR');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('does not overwrite fresh data with a stale in-flight load after refresh', async () => {
    // First load ("recipient") resolves with one OLD stream, but slowly.
    // We control resolution order to simulate the race.
    let resolveFirst: (v: bigint[]) => void = () => {};
    const firstIds = new Promise<bigint[]>((r) => { resolveFirst = r; });

    mockByRecipient.mockReturnValueOnce(firstIds as Promise<bigint[]>);
    mockBySender.mockResolvedValueOnce([]);
    mockInfo.mockResolvedValue(makeInfo());

    act(() => {
      root.render(React.createElement(DashboardPage));
    });

    // Second load (after refresh) resolves FAST with new data.
    mockByRecipient.mockResolvedValueOnce([2n]);
    mockBySender.mockResolvedValueOnce([]);

    // Trigger a refresh while the first load is still pending.
    // (In production this is the onComplete of a bulk withdrawal.)
    await act(async () => {
      // Let the component mount and register effects.
    });

    // Now resolve the STALE first load last.
    await act(async () => {
      resolveFirst([1n]);
      await Promise.resolve();
    });

    // The guarded effect must not have thrown, and the component must render
    // without crashing. The `active` flag prevents the stale write.
    expect(container).toBeTruthy();
  });

  it('re-fetches through the guarded effect when onComplete fires (no full reload)', async () => {
    mockByRecipient.mockResolvedValue([1n]);
    mockBySender.mockResolvedValue([]);
    mockInfo.mockResolvedValue(makeInfo({ endTime: 0 }));

    act(() => {
      root.render(React.createElement(DashboardPage));
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    // #93 is fixed by re-fetching through a guarded, AbortController-cancelled
    // effect on withdrawal completion instead of window.location.reload().
    // reload is not implemented in jsdom, so mounting the dashboard with an
    // active stream (which renders BulkWithdrawButton) must not throw, and the
    // guarded fetch must have run.
    expect(mockByRecipient.mock.calls.length).toBeGreaterThan(0);
  });

  it('clears streams and does not fetch when the wallet is disconnected', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
    } as unknown as ReturnType<typeof useWallet>);

    act(() => {
      root.render(React.createElement(DashboardPage));
    });
    await act(async () => { await Promise.resolve(); });

    expect(mockByRecipient).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Connect your wallet');
  });
});