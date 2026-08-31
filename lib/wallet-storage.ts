/**
 * wallet-storage — scoped localStorage helpers for wallet session persistence.
 *
 * All wallet data lives under a single key. Functions here only ever touch
 * that key; they never call localStorage.clear() or sessionStorage.clear(),
 * so unrelated storage (theme preference, etc.) is never disturbed.
 *
 * Every access goes through the `safe*` helpers below: Safari private mode,
 * "block all cookies / site data", and some embedded webviews make
 * `localStorage` throw (`SecurityError`) or throw on write
 * (`QuotaExceededError`). In those environments we degrade to an in-memory
 * store so the connect flow still works for the current tab (#350).
 */

export const WALLET_STORAGE_KEY = 'conduit:wallet';

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface PersistedWallet {
  key: string;
  name: string;
  expiresAt?: number;
}

const memoryStore = new Map<string, string>();

function safeGet(key: string): string | null {
  try {
    // Some environments (old Safari private mode) allow reads but throw on
    // writes, so a value may have landed in the memory fallback instead — try
    // localStorage first, then fall back.
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    /* fall through to memory */
  }
  return memoryStore.has(key) ? memoryStore.get(key)! : null;
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

function safeRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
      return;
    }
  } catch {
    /* fall through to memory */
  }
  memoryStore.delete(key);
}

/** Persist wallet session (scoped key only) with optional TTL in ms. */
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
  safeSet(WALLET_STORAGE_KEY, JSON.stringify(data));
}

/** Remove wallet session (scoped key only). */
export function clearWalletSession(): void {
  safeRemove(WALLET_STORAGE_KEY);
}

/**
 * Slide a still-valid session's expiry to `ttlMs` from now (#430).
 *
 * `expiresAt` is otherwise stamped once at connect, so a user who keeps the
 * app open is force-disconnected exactly `DEFAULT_SESSION_TTL_MS` after the
 * initial connect, mid-session. Call this on meaningful activity (a successful
 * signature) and when a valid session is restored on mount, so only a genuinely
 * idle session lapses.
 *
 * No-op when there is no stored session, or it is already expired — those go
 * through the normal connect flow. `loadWalletSession()` clears an expired
 * entry as a side effect, matching the old behaviour.
 */
export function touchWalletSession(ttlMs: number = DEFAULT_SESSION_TTL_MS): void {
  const existing = loadWalletSession();
  if (!existing) return;
  saveWalletSession({ key: existing.key, name: existing.name }, ttlMs);
}

/** Load a previously-persisted wallet session, or null if none exists, malformed, or expired. */
export function loadWalletSession(): PersistedWallet | null {
  const raw = safeGet(WALLET_STORAGE_KEY);
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
