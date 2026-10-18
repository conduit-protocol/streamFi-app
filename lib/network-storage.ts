import {
  DEFAULT_NETWORK,
  NETWORK_STORAGE_KEY,
  NETWORKS,
  NetworkConfig,
  NetworkName,
  isValidNetworkName,
} from './network-config';

type Listener = () => void;

const listeners = new Set<Listener>();
let crossTabListenerAttached = false;

function emit(): void {
  for (const listener of listeners) listener();
}

/** Cross-tab writes only fire the native `storage` event, never same-tab
 *  writes — attach this once so a same-tab `saveSelectedNetwork` call and a
 *  different tab's write both reach our own listener set. */
function attachCrossTabListener(): void {
  if (crossTabListenerAttached || typeof window === 'undefined') return;
  crossTabListenerAttached = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === NETWORK_STORAGE_KEY) emit();
  });
}

/**
 * Subscribe to the selected network changing, whether from this tab
 * (`saveSelectedNetwork`) or another one (native `storage` event). Returns an
 * unsubscribe function.
 */
export function subscribeSelectedNetwork(listener: Listener): () => void {
  attachCrossTabListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
  emit();
}

/** Return the currently selected network name. */
export function getSelectedNetworkName(): NetworkName {
  return loadSelectedNetwork().name;
}

/** Test-only: clear the in-memory localStorage-unavailable fallback so test
 *  cases don't leak state into each other via the module-level map. */
export function resetNetworkStorageForTests(): void {
  memoryStore.clear();
}
