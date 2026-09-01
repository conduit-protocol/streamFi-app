import { useSyncExternalStore } from 'react';
import {
  getNetworkEpisode,
  getNetworkStatus,
  subscribeNetworkStatus,
  type NetworkStatus,
} from '@/lib/network-status';

export interface NetworkStatusSnapshot {
  /** `'trouble'` once a Soroban RPC round-trip fails or the circuit breaker opens. */
  status: NetworkStatus;
  /** Identifier for the current outage; changes when a fresh outage begins. */
  episode: number;
}

/**
 * Subscribe a component to the global RPC health signal (see
 * `lib/network-status.ts`). During SSR and the first client render it reports
 * `'ok'` so markup stays stable through hydration.
 */
export function useNetworkStatus(): NetworkStatusSnapshot {
  const status = useSyncExternalStore(
    subscribeNetworkStatus,
    getNetworkStatus,
    () => 'ok' as NetworkStatus,
  );
  const episode = useSyncExternalStore(
    subscribeNetworkStatus,
    getNetworkEpisode,
    () => 0,
  );
  return { status, episode };
}
