import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: '42' }),
}));

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: vi.fn(),
}));

vi.mock('@/lib/stream', () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
  getWithdrawable: vi.fn(),
}));

vi.mock('@/lib/tokens', () => ({
  tokenByAddress: vi.fn(() => undefined),
}));

// Child components are irrelevant to this page's own state machine; stub
// them to simple markers so the tests exercise only page.tsx's own logic.
vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ status }: { status: string }) =>
    React.createElement('div', { 'data-testid': 'badge' }, status),
}));
vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', null, children),
}));
vi.mock('@/components/stream/RateTicker', () => ({
  RateTicker: () => React.createElement('div', { 'data-testid': 'rate-ticker' }),
}));
vi.mock('@/components/stream/StreamTimeline', () => ({
  StreamTimeline: () => React.createElement('div', { 'data-testid': 'timeline' }),
}));
vi.mock('@/components/stream/StreamFlowChart', () => ({
  StreamFlowChart: () => React.createElement('div', { 'data-testid': 'flow-chart' }),
}));
vi.mock('@/components/stream/StreamActions', () => ({
  StreamActions: ({ token }: { token: string }) =>
    React.createElement('div', { 'data-testid': 'stream-actions' }, token),
}));

import { useWallet } from '@/contexts/WalletContext';
import { getStreamAddress, getStreamInfo, getWithdrawable } from '@/lib/stream';
import { tokenByAddress } from '@/lib/tokens';
import StreamPage from '../page';

const mockUseWallet = vi.mocked(useWallet);
const mockAddr = vi.mocked(getStreamAddress);
const mockInfo = vi.mocked(getStreamInfo);
const mockWithdrawable = vi.mocked(getWithdrawable);
const mockTokenByAddress = vi.mocked(tokenByAddress);

/** Builds a minimal valid StreamInfo, overridable per test. */
function makeInfo(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'CTOKENADDRESS',
    ratePerSecond: 1_000_000n,
    startTime: now - 3600,
    endTime: now + 3600 * 24, // ends in the future — active by default
    withdrawn: 0n,
    cancelled: false,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    ...overrides,
  };
}

describe('StreamPage (app/stream/[id]/page.tsx)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTokenByAddress.mockReturnValue(undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows a connect-wallet prompt when disconnected, without calling any RPC helper', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: null,
      connected: false,
    } as unknown as ReturnType<typeof useWallet>);

    await act(async () => {
      root.render(React.createElement(StreamPage));
    });

    expect(container.textContent).toContain('Connect your wallet');
    expect(mockAddr).not.toHaveBeenCalled();
  });

  it('renders a loading skeleton before the stream data resolves', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GWALLET',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);
    let resolveAddr: (v: string) => void = () => {};
    mockAddr.mockReturnValue(new Promise((r) => { resolveAddr = r; }));

    await act(async () => {
      root.render(React.createElement(StreamPage));
    });

    // Still loading — the skeleton's pulse placeholders are rendered, not
    // the real content (no stream-actions marker yet).
    expect(container.querySelector('[data-testid="stream-actions"]')).toBeNull();

    await act(async () => {
      resolveAddr('ADDR');
      await Promise.resolve();
    });
  });

  it('shows an error state when the stream is not found', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GWALLET',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);
    mockAddr.mockResolvedValue(null);

    await act(async () => {
      root.render(React.createElement(StreamPage));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Stream not found.');
  });

  it('derives isSender/isRecipient correctly and renders StreamActions once loaded', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GSENDER',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);
    mockAddr.mockResolvedValue('STREAM_ADDR');
    mockInfo.mockResolvedValue(makeInfo());
    mockWithdrawable.mockResolvedValue(500_000n);

    await act(async () => {
      root.render(React.createElement(StreamPage));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="stream-actions"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="badge"]')?.textContent).toBe('active');
  });

  it('#318 — resolves a known token address to its symbol instead of the truncated address', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GSENDER',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);
    mockAddr.mockResolvedValue('STREAM_ADDR');
    mockInfo.mockResolvedValue(makeInfo());
    mockWithdrawable.mockResolvedValue(500_000n);
    mockTokenByAddress.mockReturnValue({ symbol: 'XLM', name: 'Stellar Lumens', decimals: 7 });

    await act(async () => {
      root.render(React.createElement(StreamPage));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const actions = container.querySelector('[data-testid="stream-actions"]');
    expect(actions?.textContent).toBe('XLM');
    expect(actions?.textContent).not.toContain('CTOKENADDRESS'.slice(0, 4));
  });

  it('#93/#307-style regression — an older in-flight load does not overwrite a newer one', async () => {
    mockUseWallet.mockReturnValue({
      publicKey: 'GSENDER',
      connected: true,
    } as unknown as ReturnType<typeof useWallet>);

    let resolveFirstAddr: (v: string) => void = () => {};
    const firstAddr = new Promise<string>((r) => { resolveFirstAddr = r; });
    mockAddr.mockReturnValueOnce(firstAddr);
    mockInfo.mockResolvedValue(makeInfo({ cancelled: true }));
    mockWithdrawable.mockResolvedValue(0n);

    // Mount triggers the first (slow) load.
    await act(async () => {
      root.render(React.createElement(StreamPage));
    });

    // A second load starts (e.g. a re-render caused by a prop/id change)
    // and resolves fully before the first one's address lookup returns.
    mockAddr.mockResolvedValueOnce('SECOND_ADDR');
    await act(async () => {
      root.render(React.createElement(StreamPage));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now let the stale first load's address resolve. Its downstream
    // getStreamInfo/getWithdrawable calls would otherwise race the second
    // load's already-committed state.
    await act(async () => {
      resolveFirstAddr('FIRST_ADDR_STALE');
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The page should still reflect the second (current) load's result —
    // a cancelled stream renders the "cancelled" badge, not a crash or a
    // silently stale "active" state from the first request.
    expect(container.querySelector('[data-testid="badge"]')?.textContent).toBe('cancelled');
  });
});
