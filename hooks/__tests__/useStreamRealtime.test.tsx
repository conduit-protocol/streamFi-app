import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { calculateBackoff, INITIAL_BACKOFF_MS, MAX_BACKOFF_MS, streamEventsUrl, useStreamRealtime } from '../useStreamRealtime';

vi.mock('@/lib/env', () => ({ getHorizonUrl: () => 'https://horizon.test/' }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useStreamRealtime (#755, #811)', () => {
  it('builds the Horizon streaming URL', () => {
    expect(streamEventsUrl('https://h.test/', 'CSTREAM')).toBe(
      'https://h.test/accounts/CSTREAM/operations?cursor=now',
    );
  });

  it('invalidates the stream queries on each event and closes on unmount', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    const { unmount } = renderHook(() => useStreamRealtime('CSTREAM'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });

    const source = FakeEventSource.instances[0];
    expect(source.url).toBe('https://horizon.test/accounts/CSTREAM/operations?cursor=now');
    source.onmessage?.({} as MessageEvent);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['stream', 'CSTREAM'] });

    unmount();
    expect(source.closed).toBe(true);
  });

  it('does nothing without a stream id', () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    renderHook(() => useStreamRealtime(null), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    });
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  describe('calculateBackoff (#811)', () => {
    it('calculates exponential backoff with base 1000 * 2^retryCount', () => {
      expect(calculateBackoff(0, 0)).toBe(1000);
      expect(calculateBackoff(1, 0)).toBe(2000);
      expect(calculateBackoff(2, 0)).toBe(4000);
      expect(calculateBackoff(3, 0)).toBe(8000);
      expect(calculateBackoff(4, 0)).toBe(16000);
    });

    it('caps backoff delay at 30000ms', () => {
      expect(calculateBackoff(5, 0)).toBe(MAX_BACKOFF_MS);
      expect(calculateBackoff(6, 0)).toBe(MAX_BACKOFF_MS);
      expect(calculateBackoff(10, 0)).toBe(MAX_BACKOFF_MS);
    });

    it('applies jitter within range', () => {
      const withHalfJitter = calculateBackoff(0, 0.5);
      expect(withHalfJitter).toBe(1500);

      const withMaxJitter = calculateBackoff(0, 1.0);
      expect(withMaxJitter).toBe(2000);
    });
  });

  describe('reconnect with exponential backoff on error (#811)', () => {
    it('closes the failed source and reconnects after backoff delay', () => {
      vi.useFakeTimers();
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(Math, 'random').mockReturnValue(0); // 0 jitter for deterministic delay

      const qc = new QueryClient();
      renderHook(() => useStreamRealtime('CSTREAM'), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      });

      expect(FakeEventSource.instances).toHaveLength(1);
      const firstSource = FakeEventSource.instances[0];

      // Simulate disconnection / error
      firstSource.onerror?.();
      expect(firstSource.closed).toBe(true);
      expect(FakeEventSource.instances).toHaveLength(1);

      // Advance by backoff delay (1000ms for attempt 0)
      vi.advanceTimersByTime(1000);
      expect(FakeEventSource.instances).toHaveLength(2);

      const secondSource = FakeEventSource.instances[1];

      // Second failure -> backoff of 2000ms
      secondSource.onerror?.();
      expect(secondSource.closed).toBe(true);

      vi.advanceTimersByTime(1999);
      expect(FakeEventSource.instances).toHaveLength(2);

      vi.advanceTimersByTime(1);
      expect(FakeEventSource.instances).toHaveLength(3);
    });

    it('resets retry count when onmessage receives data', () => {
      vi.useFakeTimers();
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const qc = new QueryClient();
      renderHook(() => useStreamRealtime('CSTREAM'), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      });

      const firstSource = FakeEventSource.instances[0];
      firstSource.onerror?.();
      vi.advanceTimersByTime(1000);

      const secondSource = FakeEventSource.instances[1];
      // Message arrives, resetting retry count
      secondSource.onmessage?.({} as MessageEvent);

      // Now on error, backoff should be reset to attempt 0 (1000ms)
      secondSource.onerror?.();
      vi.advanceTimersByTime(999);
      expect(FakeEventSource.instances).toHaveLength(2);

      vi.advanceTimersByTime(1);
      expect(FakeEventSource.instances).toHaveLength(3);
    });

    it('cancels scheduled reconnect on unmount', () => {
      vi.useFakeTimers();
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const qc = new QueryClient();
      const { unmount } = renderHook(() => useStreamRealtime('CSTREAM'), {
        wrapper: ({ children }: { children: ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      });

      const firstSource = FakeEventSource.instances[0];
      firstSource.onerror?.();
      expect(firstSource.closed).toBe(true);

      // Unmount before reconnect timer expires
      unmount();
      vi.advanceTimersByTime(5000);
      expect(FakeEventSource.instances).toHaveLength(1);
    });
  });
});
