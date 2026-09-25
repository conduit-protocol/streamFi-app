/**
 * network-storage.test.ts
 *
 * Covers loadSelectedNetwork, saveSelectedNetwork, and getSelectedNetworkName.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSelectedNetwork,
  saveSelectedNetwork,
  getSelectedNetworkName,
} from './network-storage.js';
import { NETWORKS, DEFAULT_NETWORK, NETWORK_STORAGE_KEY } from './network-config.js';

// ── Minimal localStorage stub ────────────────────────────────────────────────

const store = new Map<string, string>();

const localStorageMock: Storage = {
  getItem:    (k) => store.get(k) ?? null,
  setItem:    (k, v) => { store.set(k, v); },
  removeItem: (k) => { store.delete(k); },
  clear:      () => { store.clear(); },
  key:        (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  store.clear();
});

// ── loadSelectedNetwork ──────────────────────────────────────────────────────

describe('loadSelectedNetwork', () => {
  it('returns the default network when nothing is stored', () => {
    expect(loadSelectedNetwork()).toEqual(NETWORKS[DEFAULT_NETWORK]);
  });

  it('returns the stored network when a valid name is saved', () => {
    store.set(NETWORK_STORAGE_KEY, 'mainnet');
    expect(loadSelectedNetwork()).toEqual(NETWORKS.mainnet);
  });

  it('falls back to default when stored value is invalid', () => {
    store.set(NETWORK_STORAGE_KEY, 'invalid-network');
    expect(loadSelectedNetwork()).toEqual(NETWORKS[DEFAULT_NETWORK]);
  });

  it('falls back to default when localStorage throws', () => {
    const original = localStorageMock.getItem;
    localStorageMock.getItem = () => { throw new Error('storage unavailable'); };
    expect(loadSelectedNetwork()).toEqual(NETWORKS[DEFAULT_NETWORK]);
    localStorageMock.getItem = original;
  });
});

// ── saveSelectedNetwork ──────────────────────────────────────────────────────

describe('saveSelectedNetwork', () => {
  it('persists the network name to localStorage', () => {
    saveSelectedNetwork('mainnet');
    expect(store.get(NETWORK_STORAGE_KEY)).toBe('mainnet');
  });

  it('overwrites a previous selection', () => {
    saveSelectedNetwork('mainnet');
    saveSelectedNetwork('local');
    expect(store.get(NETWORK_STORAGE_KEY)).toBe('local');
  });

  it('does not disturb unrelated storage keys', () => {
    store.set('theme', 'dark');
    saveSelectedNetwork('testnet');
    expect(store.get('theme')).toBe('dark');
  });

  it('falls back to memory store when localStorage.setItem throws', () => {
    const original = localStorageMock.setItem;
    localStorageMock.setItem = () => { throw new Error('storage unavailable'); };
    saveSelectedNetwork('mainnet');
    localStorageMock.setItem = original;
    // Should still be readable via loadSelectedNetwork (memory fallback)
    expect(loadSelectedNetwork().name).toBe('mainnet');
  });
});

// ── getSelectedNetworkName ───────────────────────────────────────────────────

describe('getSelectedNetworkName', () => {
  it('returns the default network name when nothing is stored', () => {
    expect(getSelectedNetworkName()).toBe(DEFAULT_NETWORK);
  });

  it('returns the stored network name', () => {
    store.set(NETWORK_STORAGE_KEY, 'local');
    expect(getSelectedNetworkName()).toBe('local');
  });
});
