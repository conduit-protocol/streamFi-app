'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getHorizonUrl } from '@/lib/env';
import { queryKeys } from '@/lib/query-keys';

export function streamEventsUrl(horizonUrl: string, streamId: string): string {
  return `${horizonUrl.replace(/\/$/, '')}/accounts/${streamId}/operations?cursor=now`;
}

/**
 * Subscribe to Horizon server-sent events for a stream and refetch its
 * queries the moment a new operation lands, instead of waiting for the next
 * polling interval (#755). No-op when Horizon or EventSource is unavailable,
 * so existing polling remains the fallback.
 */
export function useStreamRealtime(streamId: string | null | undefined): void {
  const qc = useQueryClient();

  useEffect(() => {
    const horizon = getHorizonUrl();
    if (!streamId || !horizon || typeof EventSource === 'undefined') return;

    const source = new EventSource(streamEventsUrl(horizon, streamId));
    source.onmessage = () => {
      void qc.invalidateQueries({ queryKey: queryKeys.streams.detail(streamId) });
    };
    source.onerror = () => {
      // Horizon closes idle streams; EventSource reconnects on its own.
    };
    return () => source.close();
  }, [qc, streamId]);
}
