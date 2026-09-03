import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/contexts/WalletContext', () => ({ useWallet: vi.fn() }));

vi.mock('@/lib/factory', () => ({
  streamsBySender: vi.fn(),
  streamsByRecipient: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
  getWithdrawable: vi.fn(),
}));

vi.mock('@/components/stream/StreamCard', () => ({
  StreamCard: () => React.createElement('div', { 'data-testid': 'stream-card' }),
}));
vi.mock('@/components/stream/StreamCardSkeleton', () => ({
  StreamCardSkeleton: () => React.createElement('div', null, 'loading'),
}));
vi.mock('@/components/stream/BulkWithdrawButton', () => ({
  BulkWithdrawButton: () => React.createElement('div'),
}));
vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement('a', null, children),
}));

import { useWallet } from '@/contexts/WalletContext';
import { streamsByRecipient, streamsBySender } from '@/lib/factory';
import { getStreamAddress } from '@/lib/stream';
import DashboardPage from '../page';

const mockUseWallet = vi.mocked(useWallet);
const mockByRecipient = vi.mocked(streamsByRecipient);
const mockBySender = vi.mocked(streamsBySender);
const mockAddr = vi.mocked(getStreamAddress);

function retryButton(container: HTMLElement): HTMLButtonElement | undefined {
  return [...container.querySelectorAll('button')].find((b) =>
    /retry/i.test(b.textContent ?? ''),
  ) as HTMLButtonElement | undefined;
}

describe('DashboardPage — manual refresh rate limiting', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockUseWallet.mockReturnValue({
      publicKey: 'PUBKEY',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);
    // One recipient stream whose address never resolves -> counts as a
    // partial-load failure, which surfaces the "Retry" control.
    mockBySender.mockResolvedValue([]);
    mockByRecipient.mockResolvedValue([1n]);
    mockAddr.mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('ignores extra Retry clicks while a refresh is already in flight', async () => {
    act(() => root.render(React.createElement(DashboardPage)));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    const initialCalls = mockByRecipient.mock.calls.length;
    expect(retryButton(container)).toBeTruthy();

    // The next refresh hangs, so it stays "in flight" for the whole test.
    mockByRecipient.mockImplementation(() => new Promise<bigint[]>(() => {}));

    await act(async () => {
      const button = retryButton(container)!;
      button.click();
      button.click();
      button.click();
    });

    // Exactly one additional fetch, no matter how many times it was clicked.
    expect(mockByRecipient.mock.calls.length).toBe(initialCalls + 1);
  });

  it('disables the Retry control while the refresh runs', async () => {
    act(() => root.render(React.createElement(DashboardPage)));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    mockByRecipient.mockImplementation(() => new Promise<bigint[]>(() => {}));

    await act(async () => { retryButton(container)!.click(); });

    // Still rendered (the partial-load bar), now disabled while loading.
    const button = retryButton(container);
    expect(button?.disabled).toBe(true);
  });
});
