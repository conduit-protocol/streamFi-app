import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

let currentPublicKey: string | null = 'GME';
let currentIds: string | null = '1,2';

vi.mock('@/contexts/WalletContext', () => ({
  useWallet: () => ({ publicKey: currentPublicKey, connected: currentPublicKey !== null }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (k: string) => (k === 'ids' ? currentIds : null) }),
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', props, children),
}));

vi.mock('@/lib/stream', () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
}));

vi.mock('lucide-react');

import ComparePage from '../page';
import { getStreamAddress, getStreamInfo, type StreamInfo } from '@/lib/stream';

const mockAddr = vi.mocked(getStreamAddress);
const mockInfo = vi.mocked(getStreamInfo);

function makeInfo(overrides: Partial<StreamInfo> = {}): StreamInfo {
  const now = Math.floor(Date.now() / 1000);
  return {
    sender: 'GSENDERAAAAAAAAAAAAAAAAAAAAAA',
    recipient: 'GME',
    token: 'CTOKENAAAAAAAAAAAAAAAAAAAAAAA',
    ratePerSecond: 10_000_000n,
    startTime: now - 3600,
    endTime: now + 3600,
    withdrawn: 0n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
    ...overrides,
  };
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(ComparePage));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      document.body.removeChild(container);
    },
  };
}

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPublicKey = 'GME';
    currentIds = '1,2';
    mockAddr.mockImplementation(async (_pk, id) => `CADDR${id}`);
  });

  it('renders one column per selected stream with key metrics', async () => {
    mockInfo.mockImplementation(async (_pk, addr) =>
      addr === 'CADDR1'
        ? makeInfo({ ratePerSecond: 10_000_000n })
        : makeInfo({ ratePerSecond: 20_000_000n, paused: true, pausedAt: Math.floor(Date.now() / 1000) }),
    );

    const { container, cleanup } = await render();
    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent);
    expect(headers).toEqual(['Metric', 'Stream #1', 'Stream #2']);

    const text = container.textContent ?? '';
    expect(text).toContain('Rate / second');
    expect(text).toContain('1.00');
    expect(text).toContain('2.00');
    expect(text).toContain('Time remaining');
    expect(text).toContain('1h');
    expect(text).toContain('(paused)');
    expect(text).toContain('50%');
    cleanup();
  });

  it('shows a per-column error when one stream fails to load', async () => {
    mockAddr.mockImplementation(async (_pk, id) => (id === 2n ? null : `CADDR${id}`));
    mockInfo.mockResolvedValue(makeInfo());

    const { container, cleanup } = await render();
    expect(container.textContent).toContain('Stream #1');
    expect(container.textContent).toContain('Stream not found.');
    cleanup();
  });

  it('asks for more streams when fewer than two ids are given', async () => {
    currentIds = '1';
    const { container, cleanup } = await render();
    expect(container.textContent).toContain('Select at least 2 streams');
    expect(mockAddr).not.toHaveBeenCalled();
    cleanup();
  });

  it('prompts to connect when no wallet is connected', async () => {
    currentPublicKey = null;
    const { container, cleanup } = await render();
    expect(container.textContent).toContain('Connect your wallet');
    cleanup();
  });
});
