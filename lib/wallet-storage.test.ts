/**
 * wallet-storage.test.ts
 *
 * Verifies that the wallet session helpers only ever touch the wallet-scoped
 * localStorage key — never performing a blanket clear() that would wipe
 * unrelated state such as the user's theme preference.
 *
 * Regression test for: disconnect() blanket localStorage.clear() bug (#237).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WALLET_STORAGE_KEY,
  clearWalletSession,
  loadWalletSession,
  saveWalletSession,
} from './wallet-storage.js';

// ── Minimal localStorage stub ────────────────────────────────────────────────
// vitest's 'node' environment has no DOM, so we provide a Map-backed fake.

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

// ── Test helpers ─────────────────────────────────────────────────────────────

const THEME_KEY = 'theme';
const THEME_VALUE = 'dark';

beforeEach(() => {
  store.clear();
  // Simulate an unrelated key (e.g. next-themes persistence) being present.
  store.set(THEME_KEY, THEME_VALUE);
});

// ── saveWalletSession ────────────────────────────────────────────────────────

describe('saveWalletSession', () => {
  it('persists the wallet under the scoped key with expiresAt timestamp', () => {
    saveWalletSession({ key: 'GTEST', name: 'Freighter' });
    const raw = store.get(WALLET_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toEqual({
      key: 'GTEST',
      name: 'Freighter',
      expiresAt: expect.any(Number),
    });
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });

  it('allows custom TTL or explicit expiresAt', () => {
    const customExpiry = Date.now() + 60000;
    saveWalletSession({ key: 'GTEST', name: 'Freighter', expiresAt: customExpiry });
    const raw = store.get(WALLET_STORAGE_KEY);
    expect(JSON.parse(raw!)).toEqual({
      key: 'GTEST',
      name: 'Freighter',
      expiresAt: customExpiry,
    });
  });

  it('does not disturb unrelated storage keys', () => {
    saveWalletSession({ key: 'GTEST', name: 'Freighter' });
    expect(store.get(THEME_KEY)).toBe(THEME_VALUE);
  });
});

// ── clearWalletSession (the core regression) ─────────────────────────────────

describe('clearWalletSession', () => {
  it('removes the wallet session key', () => {
    saveWalletSession({ key: 'GTEST', name: 'Freighter' });
    clearWalletSession();
    expect(store.has(WALLET_STORAGE_KEY)).toBe(false);
  });

  it('preserves unrelated storage keys — theme preference survives disconnect', () => {
    saveWalletSession({ key: 'GTEST', name: 'Freighter' });
    clearWalletSession(); // simulates what disconnect() calls
    expect(store.get(THEME_KEY)).toBe(THEME_VALUE);
  });

  it('leaves other unrelated keys intact even when wallet key is absent', () => {
    // No wallet session was ever saved — clearing should be a no-op for others.
    clearWalletSession();
    expect(store.get(THEME_KEY)).toBe(THEME_VALUE);
  });
});

// ── loadWalletSession ────────────────────────────────────────────────────────

describe('loadWalletSession', () => {
  it('returns null when nothing is stored', () => {
    expect(loadWalletSession()).toBeNull();
  });

  it('returns the persisted wallet when not expired', () => {
    saveWalletSession({ key: 'GTEST', name: 'Freighter' });
    const loaded = loadWalletSession();
    expect(loaded).toEqual({
      key: 'GTEST',
      name: 'Freighter',
      expiresAt: expect.any(Number),
    });
  });

  it('purges and returns null when stored session expiresAt is in the past', () => {
    const pastTime = Date.now() - 10000;
    store.set(
      WALLET_STORAGE_KEY,
      JSON.stringify({ key: 'GTEST', name: 'Freighter', expiresAt: pastTime }),
    );
    expect(loadWalletSession()).toBeNull();
    expect(store.has(WALLET_STORAGE_KEY)).toBe(false);
  });

  it('purges and returns null when stored session exp field is in the past', () => {
    const pastTime = Date.now() - 10000;
    store.set(
      WALLET_STORAGE_KEY,
      JSON.stringify({ key: 'GTEST', name: 'Freighter', exp: pastTime }),
    );
    expect(loadWalletSession()).toBeNull();
    expect(store.has(WALLET_STORAGE_KEY)).toBe(false);
  });

  it('returns null and does not throw on malformed JSON', () => {
    store.set(WALLET_STORAGE_KEY, '{bad json');
    expect(loadWalletSession()).toBeNull();
  });

  it('returns null when the stored shape is missing required fields', () => {
    store.set(WALLET_STORAGE_KEY, JSON.stringify({ key: 'GTEST' }));
    expect(loadWalletSession()).toBeNull();
  });
});
