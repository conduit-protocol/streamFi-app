import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current[0]).toBe('hello');
  });

  it('does not fire before the delay elapses', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } },
    );

    expect(result.current[0]).toBe('initial');

    rerender({ value: 'updated', delay: 300 });

    // Only 200ms have passed — the value should not have changed yet
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current[0]).toBe('initial');

    // Once the full 300ms elapses the debounced value should update
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe('updated');
  });

  it('cleans up timeout on unmount so no state update fires after', () => {
    vi.useFakeTimers();

    const { unmount } = renderHook(() => useDebounce('test', 300));

    unmount();

    // Advancing all pending timers after unmount should not throw
    // (which would happen if the timeout tried to call setState on an
    // unmounted component)
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });

  it('only the last value fires after rapid successive updates', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } },
    );

    expect(result.current[0]).toBe('a');

    // Rapidly push three updates, each partially through the delay window
    rerender({ value: 'b', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'c', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: 'd', delay: 300 });

    // Only 200ms have passed since the last change — still the original value
    expect(result.current[0]).toBe('a');

    // Advance the remaining time for the 'd' debounce period; only 'd' should fire
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current[0]).toBe('d');
  });

  it('respects a custom delay', () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ value, delay }: { value: string; delay: number }) =>
        useDebounce(value, delay),
      { initialProps: { value: 'first', delay: 500 } },
    );

    rerender({ value: 'second', delay: 500 });

    // 400ms is not enough for a 500ms delay
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current[0]).toBe('first');

    // After the full 500ms it should update
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current[0]).toBe('second');
  });

  describe('flush / cancel', () => {
    const setup = () =>
      renderHook(
        ({ value }: { value: string }) => useDebounce(value, 300),
        { initialProps: { value: 'a' } },
      );

    it('flush applies the latest value immediately', () => {
      vi.useFakeTimers();
      const { result, rerender } = setup();

      rerender({ value: 'b' });
      expect(result.current[0]).toBe('a');

      act(() => {
        result.current[1].flush();
      });
      expect(result.current[0]).toBe('b');
    });

    it('flush drops the pending timer so it does not fire again', () => {
      vi.useFakeTimers();
      const { result, rerender } = setup();

      rerender({ value: 'b' });
      act(() => {
        result.current[1].flush();
      });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cancel discards the pending update', () => {
      vi.useFakeTimers();
      const { result, rerender } = setup();

      rerender({ value: 'b' });
      act(() => {
        result.current[1].cancel();
        vi.advanceTimersByTime(1000);
      });
      expect(result.current[0]).toBe('a');
    });

    it('debouncing resumes after cancel when the value changes again', () => {
      vi.useFakeTimers();
      const { result, rerender } = setup();

      rerender({ value: 'b' });
      act(() => {
        result.current[1].cancel();
      });
      rerender({ value: 'c' });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current[0]).toBe('c');
    });

    it('returns stable control references across renders', () => {
      const { result, rerender } = setup();
      const first = result.current[1];
      rerender({ value: 'b' });
      expect(result.current[1]).toBe(first);
    });
  });
});
