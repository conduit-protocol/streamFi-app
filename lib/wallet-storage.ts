/**
 * wallet-storage — scoped localStorage helpers for wallet session persistence.
 *
 * All wallet data lives under a single key. Functions here only ever touch
 * that key; they never call localStorage.clear() or sessionStorage.clear(),
 * so unrelated storage (theme preference, etc.) is never disturbed.
 */

export const WALLET_STORAGE_KEY = 'conduit:wallet';

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PersistedWallet {
  key: string;
  name: string;
  expiresAt?: number;
}

/** Persist wallet session to localStorage (scoped key only) with optional TTL in ms. */
export function saveWalletSession(
  wallet: Omit<PersistedWallet, 'expiresAt'> & { expiresAt?: number },
  ttlMs: number = DEFAULT_SESSION_TTL_MS
): void {
  const expiresAt = wallet.expiresAt ?? (Date.now() + ttlMs);
  const data: PersistedWallet = {
    key: wallet.key,
    name: wallet.name,
    expiresAt,
  };
  localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(data));
}

/** Remove wallet session from localStorage (scoped key only). */
export function clearWalletSession(): void {
  localStorage.removeItem(WALLET_STORAGE_KEY);
}

/** Load a previously-persisted wallet session, or null if none exists, malformed, or expired. */
export function loadWalletSession(): PersistedWallet | null {
  const raw = localStorage.getItem(WALLET_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedWallet> & { exp?: number };
    if (typeof parsed.key === 'string' && parsed.key && typeof parsed.name === 'string' && parsed.name) {
      const expiresAt = parsed.expiresAt ?? parsed.exp;
      if (typeof expiresAt === 'number' && Date.now() > expiresAt) {
        clearWalletSession();
        return null;
      }
      return { key: parsed.key, name: parsed.name, expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}
