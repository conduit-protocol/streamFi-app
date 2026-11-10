/**
 * imported-tokens-storage — local persistence for user-imported (unverified)
 * Soroban tokens (#789).
 *
 * Follows the same pattern as wallet-storage.ts and onboarding-storage.ts:
 * all access goes through safe helpers, never calls clear(), and degrades
 * gracefully to in-memory storage in restricted environments.
 *
 * Imported tokens are scoped per network so a testnet contract never shows
 * up in the mainnet list, and every entry is stored with `verified: false`.
 */

import type { TokenMeta } from './tokens';
import { isValidStellarContract } from './stellar-address';

export const IMPORTED_TOKENS_STORAGE_KEY = 'conduit:imported-tokens';

export type ImportedTokenNetwork = 'mainnet' | 'testnet' | 'local';

type ImportedTokensStore = Partial<Record<ImportedTokenNetwork, TokenMeta[]>>;

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

/** Defensive shape check — storage may contain stale or tampered data. */
function isImportedToken(value: unknown): value is TokenMeta {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.symbol === 'string' &&
    typeof t.name === 'string' &&
    typeof t.decimals === 'number' &&
    Number.isInteger(t.decimals) &&
    typeof t.address === 'string' &&
    isValidStellarContract(t.address)
  );
}

function loadStore(): ImportedTokensStore {
  const raw = safeGet(IMPORTED_TOKENS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as ImportedTokensStore)
      : {};
  } catch {
    return {};
  }
}

/** Load the imported tokens for a network. Entries are always unverified. */
export function loadImportedTokens(network: ImportedTokenNetwork): TokenMeta[] {
  const list = loadStore()[network];
  if (!Array.isArray(list)) return [];
  return list
    .filter(isImportedToken)
    .map(t => ({
      symbol:   t.symbol,
      name:     t.name,
      decimals: t.decimals,
      address:  t.address,
      verified: false,
    }));
}

/**
 * Persist an imported token for a network. Re-importing an address replaces
 * the previous entry. Returns the updated list for that network.
 */
export function saveImportedToken(
  network: ImportedTokenNetwork,
  token: TokenMeta,
): TokenMeta[] {
  if (!token.address || !isValidStellarContract(token.address)) {
    throw new Error('Imported tokens require a valid Soroban contract address.');
  }
  const entry: TokenMeta = {
    symbol:   token.symbol,
    name:     token.name,
    decimals: token.decimals,
    address:  token.address,
    verified: false,
  };
  const store = loadStore();
  const next = [
    ...loadImportedTokens(network).filter(t => t.address !== entry.address),
    entry,
  ];
  safeSet(IMPORTED_TOKENS_STORAGE_KEY, JSON.stringify({ ...store, [network]: next }));
  return next;
}

/** Remove an imported token. Returns the updated list for that network. */
export function removeImportedToken(
  network: ImportedTokenNetwork,
  address: string,
): TokenMeta[] {
  const store = loadStore();
  const next = loadImportedTokens(network).filter(t => t.address !== address);
  safeSet(IMPORTED_TOKENS_STORAGE_KEY, JSON.stringify({ ...store, [network]: next }));
  return next;
}

/** Test-only: reset the in-memory fallback store. */
export function __clearImportedTokensMemory(): void {
  memoryStore.clear();
}
