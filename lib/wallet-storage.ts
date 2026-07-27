/**
 * wallet-storage — scoped localStorage helpers for wallet session persistence.
 *
 * All wallet data lives under a single key. Functions here only ever touch
 * that key; they never call localStorage.clear() or sessionStorage.clear(),
 * so unrelated storage (theme preference, etc.) is never disturbed.
 */

export const WALLET_STORAGE_KEY = 'conduit:wallet';

export interface PersistedWallet {
  key: string;
  name: string;
}

/** Persist wallet session to localStorage (scoped key only). */
export function saveWalletSession(wallet: PersistedWallet): void {
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
}

/** Remove wallet session from localStorage (scoped key only). */
export function clearWalletSession(): void {
  localStorage.removeItem(WALLET_STORAGE_KEY);
}

/** Load a previously-persisted wallet session, or null if none exists or malformed. */
export function loadWalletSession(): PersistedWallet | null {
  const raw = localStorage.getItem(WALLET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedWallet>;
    if (typeof parsed.key === 'string' && parsed.key && typeof parsed.name === 'string' && parsed.name) {
      return { key: parsed.key, name: parsed.name };
    }
    return null;
  } catch {
    return null;
  }
}
