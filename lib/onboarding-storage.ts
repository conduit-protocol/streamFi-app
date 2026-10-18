/**
 * onboarding-storage — scoped localStorage helpers for onboarding tour persistence.
 *
 * Follows the same pattern as wallet-storage.ts: all access goes through
 * safe helpers, never calls clear(), and degrades gracefully to in-memory
 * storage in restricted environments.
 */

const ONBOARDING_STORAGE_KEY = 'conduit:onboarding';

export interface OnboardingState {
  completed: boolean;
  dismissedAt?: number;
  currentStep?: number;
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

/** Load onboarding state, or null if none exists or malformed. */
export function loadOnboardingState(): OnboardingState | null {
  const raw = safeGet(ONBOARDING_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    if (typeof parsed.completed === 'boolean') {
      return {
        completed: parsed.completed,
        dismissedAt: parsed.dismissedAt,
        currentStep: parsed.currentStep,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist onboarding state (scoped key only). */
export function saveOnboardingState(state: OnboardingState): void {
  safeSet(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
}

/** Clear onboarding state to allow tour to run again. */
export function clearOnboardingState(): void {
  safeRemove(ONBOARDING_STORAGE_KEY);
}
