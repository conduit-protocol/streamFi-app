import React, { act } from 'react';
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

  it('clears the interval on unmount (no updates after unmount)', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    act(() => {
      root.render(
        <RateTicker ratePerSecond={10_000_000n} startBalance={0n} endTime={0} />,
      );
    });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const intervalId = setIntervalSpy.mock.results[0]!.value;

    act(() => root.unmount());

    expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
    clearIntervalSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });

  it('clears the old interval when ratePerSecond changes', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    act(() => {
      root.render(
        <RateTicker ratePerSecond={10_000_000n} startBalance={0n} endTime={0} />,
      );
    });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const firstId = setIntervalSpy.mock.results[0]!.value;

    act(() => {
      root.render(
        <RateTicker ratePerSecond={20_000_000n} startBalance={0n} endTime={0} />,
      );
    });

    expect(setIntervalSpy).toHaveBeenCalledTimes(2);
    expect(clearIntervalSpy).toHaveBeenCalledWith(firstId);

    clearIntervalSpy.mockRestore();
    setIntervalSpy.mockRestore();
  });

  it('reflects the new rate after ratePerSecond changes', () => {
    act(() => {
      root.render(
        <RateTicker ratePerSecond={10_000_000n} startBalance={0n} endTime={0} />,
      );
    });

    act(() => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toBe('1.00');

    act(() => {
      root.render(
        <RateTicker ratePerSecond={20_000_000n} startBalance={0n} endTime={0} />,
      );
    });

    act(() => vi.advanceTimersByTime(1_000));
    expect(container.textContent).toBe('4.00');
  });
});
