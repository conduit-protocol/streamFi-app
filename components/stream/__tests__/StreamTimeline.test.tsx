import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { StreamTimeline } from '../StreamTimeline';
import { formatTimestamp } from '@/lib/format';

/**
 * Test coverage for StreamTimeline.tsx (issue #630).
 */

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

const START = 1_700_000_000;
const END = START + 10_000; // 10,000-second bounded stream

describe('StreamTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing for an open-ended stream (endTime === 0)', () => {
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={0} paused={false} pausedAt={0} />,
    );
    expect(container.firstChild).toBeNull();
    unmount(container, root);
  });

  it('shows 0% complete at the very start of the stream', () => {
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );
    expect(container.textContent).toContain('0% complete');
    unmount(container, root);
  });

  it('shows the start and end timestamps as labels', () => {
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );
    expect(container.textContent).toContain(formatTimestamp(START));
    expect(container.textContent).toContain(formatTimestamp(END));
    unmount(container, root);
  });

  it('shows 50% complete and fills the bar to 50% width when now is exactly halfway', () => {
    vi.setSystemTime((START + 5_000) * 1000);
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );

    expect(container.textContent).toContain('50% complete');
    const filledBar = container.querySelector('div[style*="width"]') as HTMLDivElement;
    expect(filledBar.style.width).toBe('50%');
    unmount(container, root);
  });

  it('clamps progress to 100% once now is past endTime', () => {
    vi.setSystemTime((END + 999) * 1000);
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );
    expect(container.textContent).toContain('100% complete');
    unmount(container, root);
  });

  it('does not render a pause marker when the stream is not paused', () => {
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );
    expect(container.querySelector('[title^="Paused at"]')).toBeNull();
    unmount(container, root);
  });

  it('renders a pause marker with a title showing when it was paused', () => {
    const pausedAt = START + 2_500;
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={true} pausedAt={pausedAt} />,
    );

    const marker = container.querySelector('[title^="Paused at"]') as HTMLDivElement;
    expect(marker).not.toBeNull();
    expect(marker.title).toBe(`Paused at ${formatTimestamp(pausedAt)}`);
    unmount(container, root);
  });

  it('positions the pause marker at the correct percentage along the bar', () => {
    const pausedAt = START + 2_500; // 25% of a 10,000s stream
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={true} pausedAt={pausedAt} />,
    );

    const marker = container.querySelector('[title^="Paused at"]') as HTMLDivElement;
    expect(marker.style.left).toBe('25%');
    unmount(container, root);
  });

  it('updates progress after the 10-second refresh interval elapses', () => {
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );
    expect(container.textContent).toContain('0% complete');

    act(() => {
      vi.setSystemTime((START + 1_000) * 1000);
      vi.advanceTimersByTime(10_000);
    });

    expect(container.textContent).toContain('10% complete');
    unmount(container, root);
  });

  it('clears its refresh interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { container, root } = renderInto(
      <StreamTimeline startTime={START} endTime={END} paused={false} pausedAt={0} />,
    );

    unmount(container, root);

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});
