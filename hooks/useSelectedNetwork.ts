import { useSyncExternalStore } from 'react';
import type { NetworkConfig } from '@/lib/network-config';
import { getDefaultNetwork } from '@/lib/network-config';
import { loadSelectedNetwork, subscribeSelectedNetwork } from '@/lib/network-storage';

/**
 * Subscribe a component to the user's currently selected network (see
 * `lib/network-storage.ts`). During SSR and the first client render it
 * reports the default network so markup stays stable through hydration,
 * matching the pattern `useNetworkStatus` uses for RPC health.
 */
export function useSelectedNetwork(): NetworkConfig {
  return useSyncExternalStore(
    subscribeSelectedNetwork,
    loadSelectedNetwork,
    getDefaultNetwork,
  );
}
