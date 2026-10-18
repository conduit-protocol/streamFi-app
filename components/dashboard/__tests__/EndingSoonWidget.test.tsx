import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Test coverage for EndingSoonWidget.tsx (issue #631).
 */

vi.mock('next/link', () => ({
  default: ({ href, children, className }: any) =>
    React.createElement('a', { href, className, 'data-testid': `link-${href}` }, children),
}));

vi.mock('@/components/ui/CopyAddress', () => ({
  CopyAddress: ({ address }: { address: string }) =>
    React.createElement('span', { 'data-testid': 'copyable-address' }, address),
}));

import { EndingSoonWidget, ENDING_SOON_WINDOW_DAYS } from '../EndingSoonWidget';
import type { StreamInfo } from '@/lib/stream';

const NOW = 1_700_000_000;
const DAY = 24 * 60 * 60;

function renderInto(el: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(el);
  });
  return { container, root };
}

function unmount(container: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  document.body.removeChild(container);
}

function makeStream(overrides: Partial<{
  id: string;
  address: string;
  counterparty: string;
  role: 'sender' | 'recipient';
  endTime: number;
  status: 'active' | 'paused' | 'ended' | 'cancelled';
}>) {
  const info: StreamInfo = {
    sender: 'GSENDER',
    recipient: 'GRECIPIENT',
    token: 'USDC',
    ratePerSecond: 1n,
    startTime: NOW - 1000,
    endTime: overrides.endTime ?? NOW + DAY,
    withdrawn: 0n,
    paused: false,
    pausedAt: 0,
    clawbackEnabled: false,
    cancelled: false,
    operator: null,
  };
  return {
    id: 'stream-1',
    address: 'CADDRESS',
    counterparty: 'GCOUNTERPARTY',
    role: 'recipient' as const,
    endTime: NOW + DAY,
    status: 'active' as const,
    info,
    ...overrides,
  };
}

describe('EndingSoonWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing while loading, even with ending-soon streams', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={true}
        receiving={[makeStream({ endTime: NOW + DAY })]}
        sending={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('renders nothing when there are no streams at all', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget loading={false} receiving={[]} sending={[]} />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('renders nothing when a stream ends soon but is not active', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW + DAY, status: 'paused' })]}
        sending={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('renders nothing for an open-ended stream (endTime === 0), even if active', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: 0, status: 'active' })]}
        sending={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('renders nothing when the stream ends further out than the window', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW + (ENDING_SOON_WINDOW_DAYS + 1) * DAY })]}
        sending={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('renders nothing for a stream that has already ended', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW - 10 })]}
        sending={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('shows a single active stream ending within the window, with singular heading', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW + 2 * DAY, counterparty: 'GALICE' })]}
        sending={[]}
      />,
    );
    expect(container.textContent).toContain('Stream ending soon');
    expect(container.textContent).not.toContain('Streams ending soon');
    expect(container.textContent).toContain('GALICE');
    unmount(container, root);
  });

  it('uses plural heading when more than one stream is ending soon', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[
          makeStream({ id: 'a', endTime: NOW + DAY, counterparty: 'GALICE' }),
          makeStream({ id: 'b', endTime: NOW + 2 * DAY, counterparty: 'GBOB' }),
        ]}
        sending={[]}
      />,
    );
    expect(container.textContent).toContain('Streams ending soon');
    unmount(container, root);
  });

  it('labels a receiving stream "Receiving from" and a sending stream "Sending to"', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ id: 'r1', role: 'recipient', endTime: NOW + DAY })]}
        sending={[makeStream({ id: 's1', role: 'sender', endTime: NOW + DAY })]}
      />,
    );
    expect(container.textContent).toContain('Receiving from');
    expect(container.textContent).toContain('Sending to');
    unmount(container, root);
  });

  it('links each entry to /stream/:id', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ id: 'stream-42', endTime: NOW + DAY })]}
        sending={[]}
      />,
    );
    expect(container.querySelector('[data-testid="link-/stream/stream-42"]')).not.toBeNull();
    unmount(container, root);
  });

  it('formats time remaining in days and hours', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW + 2 * DAY + 3 * 60 * 60 })]}
        sending={[]}
      />,
    );
    expect(container.textContent).toContain('2d 3h');
    unmount(container, root);
  });

  it('formats time remaining in hours only when less than a day remains', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW + 5 * 60 * 60 })]}
        sending={[]}
      />,
    );
    expect(container.textContent).toContain('5h');
    expect(container.textContent).not.toContain('0d');
    unmount(container, root);
  });

  it('formats time remaining as "Less than 1h" for anything under an hour', () => {
    const { container, root } = renderInto(
      <EndingSoonWidget
        loading={false}
        receiving={[makeStream({ endTime: NOW + 30 * 60 })]}
        sending={[]}
      />,
    );
    expect(container.textContent).toContain('Less than 1h');
    unmount(container, root);
  });
});
