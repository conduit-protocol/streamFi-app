import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { RateTicker } from './RateTicker';

const NOW = new Date('2026-01-01T00:00:00Z').getTime();

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('RateTicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const text = () => container.querySelector('.amount')?.textContent;
  const render = (props: Partial<React.ComponentProps<typeof RateTicker>> = {}) =>
    act(() => {
      root.render(
        <RateTicker ratePerSecond={10_000_000n} startBalance={0n} endTime={0} {...props} />,
      );
    });

  it('renders the start balance initially', () => {
    render({ startBalance: 50_000_000n });
    expect(text()).toBe('5.00');
  });

  it('increments by ratePerSecond as time elapses', () => {
    render();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(text()).toBe('3.00');
  });

  it('freezes at endTime and does not overshoot', () => {
    render({ endTime: NOW / 1000 + 2 });
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(text()).toBe('2.00');
  });

  it('does not start an interval when the stream has already ended', () => {
    render({ endTime: NOW / 1000 - 5, startBalance: 10_000_000n });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('respects the decimals prop', () => {
    render({ startBalance: 12_345n, decimals: 3 });
    expect(text()).toBe('12.345');
  });

  it('pauses the interval when the tab is hidden and resyncs on visible (#596)', () => {
    render();
    expect(vi.getTimerCount()).toBe(1);

    act(() => setHidden(true));
    expect(vi.getTimerCount()).toBe(0);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(text()).toBe('0.00');

    act(() => setHidden(false));
    expect(text()).toBe('5.00');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears the interval and listener on unmount', () => {
    render();
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });
});
