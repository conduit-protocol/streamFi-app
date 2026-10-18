import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { streamEventsUrl, useStreamRealtime } from '../useStreamRealtime';

vi.mock('@/lib/env', () => ({ getHorizonUrl: () => 'https://horizon.test/' }));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
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
});

describe('useStreamRealtime (#755)', () => {
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
});
