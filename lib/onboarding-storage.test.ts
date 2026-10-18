/**
 * onboarding-storage.test.ts
 *
 * Covers loadOnboardingState, saveOnboardingState, and clearOnboardingState.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadOnboardingState,
  saveOnboardingState,
  clearOnboardingState,
} from './onboarding-storage.js';

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

const STORAGE_KEY = 'conduit:onboarding';

beforeEach(() => {
  store.clear();
});

// ── loadOnboardingState ──────────────────────────────────────────────────────

describe('loadOnboardingState', () => {
  it('returns null when nothing is stored', () => {
    expect(loadOnboardingState()).toBeNull();
  });

  it('returns the persisted state with completed=true', () => {
    store.set(STORAGE_KEY, JSON.stringify({ completed: true, currentStep: 3 }));
    const state = loadOnboardingState();
    expect(state).toEqual({ completed: true, currentStep: 3 });
  });

  it('returns the persisted state with completed=false', () => {
    store.set(STORAGE_KEY, JSON.stringify({ completed: false, dismissedAt: 1700000000 }));
    const state = loadOnboardingState();
    expect(state).toEqual({ completed: false, dismissedAt: 1700000000 });
  });

  it('returns null on malformed JSON', () => {
    store.set(STORAGE_KEY, '{bad json');
    expect(loadOnboardingState()).toBeNull();
  });

  it('returns null when completed is not a boolean', () => {
    store.set(STORAGE_KEY, JSON.stringify({ completed: 'yes' }));
    expect(loadOnboardingState()).toBeNull();
  });

  it('returns null when stored value is an empty object', () => {
    store.set(STORAGE_KEY, JSON.stringify({}));
    expect(loadOnboardingState()).toBeNull();
  });

  it('falls back to null when localStorage.getItem throws', () => {
    const original = localStorageMock.getItem;
    localStorageMock.getItem = () => { throw new Error('storage unavailable'); };
    expect(loadOnboardingState()).toBeNull();
    localStorageMock.getItem = original;
  });
});

// ── saveOnboardingState ──────────────────────────────────────────────────────

describe('saveOnboardingState', () => {
  it('persists the state under the scoped key', () => {
    saveOnboardingState({ completed: true, currentStep: 5 });
    const raw = store.get(STORAGE_KEY);
    expect(raw).toBe(JSON.stringify({ completed: true, currentStep: 5 }));
  });

  it('overwrites a previous state', () => {
    saveOnboardingState({ completed: false });
    saveOnboardingState({ completed: true, dismissedAt: 1700000000 });
    expect(JSON.parse(store.get(STORAGE_KEY)!)).toEqual({ completed: true, dismissedAt: 1700000000 });
  });

  it('does not disturb unrelated storage keys', () => {
    store.set('theme', 'dark');
    saveOnboardingState({ completed: true });
    expect(store.get('theme')).toBe('dark');
  });

  it('falls back to memory store when localStorage.setItem throws', () => {
    const original = localStorageMock.setItem;
    localStorageMock.setItem = () => { throw new Error('storage unavailable'); };
    saveOnboardingState({ completed: true, currentStep: 2 });
    localStorageMock.setItem = original;
    // Should still be readable via loadOnboardingState (memory fallback)
    expect(loadOnboardingState()).toEqual({ completed: true, currentStep: 2 });
  });
});

// ── clearOnboardingState ─────────────────────────────────────────────────────

describe('clearOnboardingState', () => {
  it('removes the onboarding key', () => {
    saveOnboardingState({ completed: true });
    clearOnboardingState();
    expect(store.has(STORAGE_KEY)).toBe(false);
  });

  it('preserves unrelated storage keys', () => {
    store.set('theme', 'dark');
    saveOnboardingState({ completed: true });
    clearOnboardingState();
    expect(store.get('theme')).toBe('dark');
  });

  it('is a no-op when the key does not exist', () => {
    store.set('theme', 'dark');
    clearOnboardingState();
    expect(store.get('theme')).toBe('dark');
  });

  it('allows the tour to run again after clearing', () => {
    saveOnboardingState({ completed: true });
    clearOnboardingState();
    expect(loadOnboardingState()).toBeNull();
  });
});
