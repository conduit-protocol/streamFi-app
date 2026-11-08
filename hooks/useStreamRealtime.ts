'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getHorizonUrl } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';

export function streamEventsUrl(horizonUrl: string, streamId: string): string {
  return `${horizonUrl.replace(/\/$/, '')}/accounts/${streamId}/operations?cursor=now`;
}

export const INITIAL_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 30000;

/**
 * Calculates exponential backoff with jitter for Horizon SSE reconnects (#811).
 * Formula: Math.min(1000 * 2 ** retryCount, 30000) + jitter.
 */
export function calculateBackoff(
  retryCount: number,
  jitter: number = Math.random(),
): number {
  const base = Math.min(INITIAL_BACKOFF_MS * 2 ** retryCount, MAX_BACKOFF_MS);
  const jitterAmount = jitter * 1000;
  return Math.floor(base + jitterAmount);
}

/**
 * Subscribe to Horizon server-sent events for a stream and refetch its
 * queries the moment a new operation lands, instead of waiting for the next
 * polling interval (#755). Closes and reconnects with exponential backoff on
 * disconnect to avoid 429 rate limits (#811). No-op when Horizon or EventSource
 * is unavailable, so existing polling remains the fallback.
 */
export function useStreamRealtime(streamId: string | null | undefined): void {
  const qc = useQueryClient();

  useEffect(() => {
    const horizon = getHorizonUrl();
    if (!streamId || !horizon || typeof EventSource === 'undefined') return;

    let source: EventSource | null = null;
    let reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let isDisposed = false;

    function connect() {
      if (isDisposed) return;

      source = new EventSource(streamEventsUrl(horizon as string, streamId as string));

      source.onopen = () => {
        retryCount = 0;
      };

      source.onmessage = () => {
        retryCount = 0;
        void qc.invalidateQueries({ queryKey: queryKeys.streams.detail(streamId as string) });
      };

      source.onerror = () => {
        if (source) {
          source.close();
          source = null;
        }

        if (isDisposed) return;

        const delay = calculateBackoff(retryCount);
        retryCount++;
        reconnectTimeoutId = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      isDisposed = true;
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
        reconnectTimeoutId = null;
      }
      if (source) {
        source.close();
        source = null;
      }
    };
  }, [qc, streamId]);
}
