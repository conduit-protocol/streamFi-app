import {
  DEFAULT_NETWORK,
  NETWORK_STORAGE_KEY,
  NETWORKS,
  NetworkConfig,
  NetworkName,
  isValidNetworkName,
} from './network-config';

const memoryStore = new Map<string, string>();

function safeGet(key: string): string | null {
  if (memoryStore.has(key)) {
    return memoryStore.get(key)!;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    /* fall through to memory */
  }
  return null;
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    /* fall through to memory */
  }
  memoryStore.set(key, value);
}

/** Load the user's last-selected network, or the default if none/invalid. */
export function loadSelectedNetwork(): NetworkConfig {
  const raw = safeGet(NETWORK_STORAGE_KEY);
  if (raw && isValidNetworkName(raw)) {
    return NETWORKS[raw];
  }
  return NETWORKS[DEFAULT_NETWORK];
}

/** Persist the user's network choice. */
export function saveSelectedNetwork(network: NetworkName): void {
  safeSet(NETWORK_STORAGE_KEY, network);
}

/** Return the currently selected network name. */
export function getSelectedNetworkName(): NetworkName {
  return loadSelectedNetwork().name;
}
