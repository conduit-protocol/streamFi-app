import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { NetworkConfig } from '@/lib/network-config';
import { getDefaultNetwork } from '@/lib/network-config';
import { loadSelectedNetwork, subscribeSelectedNetwork, saveSelectedNetwork } from '@/lib/network-storage';
import { NETWORKS, isValidNetworkName } from '@/lib/network-config';

function networkFromUrl() {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('network');
  return value && isValidNetworkName(value) ? NETWORKS[value] : null;
}

function subscribeWithUrl(listener: () => void) {
  const unsubscribe = subscribeSelectedNetwork(listener);
  window.addEventListener('popstate', listener);
  return () => { unsubscribe(); window.removeEventListener('popstate', listener); };
}

/**
 * Subscribe a component to the user's currently selected network (see
 * `lib/network-storage.ts`). During SSR and the first client render it
 * reports the default network so markup stays stable through hydration,
 * matching the pattern `useNetworkStatus` uses for RPC health.
 */
export function useSelectedNetwork(): NetworkConfig {
  const network = useSyncExternalStore(subscribeWithUrl, () => networkFromUrl() ?? loadSelectedNetwork(), getDefaultNetwork);
  const initialized = useRef(false);
  useEffect(() => {
    const selected = networkFromUrl();
    if (selected) saveSelectedNetwork(selected.name);
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!initialized.current) { initialized.current = true; return; }
    const url = new URL(window.location.href);
    url.searchParams.set('network', network.name);
    window.history.replaceState({}, '', url);
  }, [network.name]);
  return network;
}

