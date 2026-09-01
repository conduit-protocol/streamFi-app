import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RateTicker } from '../RateTicker';

describe('RateTicker', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-30T12:00:00.000Z'));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('stops increasing once the stream reaches endTime', () => {
    const endTime = Math.floor(Date.now() / 1000) + 2;

    act(() => {
      root.render(
        <RateTicker
          ratePerSecond={10_000_000n}
          startBalance={0n}
          endTime={endTime}
        />,
      );
    });

    act(() => vi.advanceTimersByTime(5_000));
    expect(container.textContent).toBe('2.00');

    act(() => vi.advanceTimersByTime(5_000));
    expect(container.textContent).toBe('2.00');
  });
});
