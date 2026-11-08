/**
 * onboarding-storage — scoped localStorage helpers for onboarding tour persistence.
 *
 * Follows the same pattern as wallet-storage.ts: all access goes through
 * safe helpers, never calls clear(), and degrades gracefully to in-memory
 * storage in restricted environments.
 */

const ONBOARDING_STORAGE_KEY = 'conduit:onboarding';

/**
 * Completed-tour flag (#798): a plain "has the user finished the tour"
 * marker kept separately from the step-by-step state above, so it survives
 * incognito / cross-tab sessions where the step state may be missing.
 */
const ONBOARDING_COMPLETED_KEY = 'has_completed_onboarding_v1';

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
  // Always drop the in-memory copy too, otherwise a clear() would leave a
  // stale fallback value behind and the key would still read as present.
  memoryStore.delete(key);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  } catch {
    /* memory copy already removed above */
  }
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

/** Whether the user has finished or skipped the onboarding tour (#798). */
export function hasCompletedOnboarding(): boolean {
  return safeGet(ONBOARDING_COMPLETED_KEY) === 'true';
}

/** Persist the completed-tour flag (#798). */
export function markOnboardingCompleted(): void {
  safeSet(ONBOARDING_COMPLETED_KEY, 'true');
}

/** Clear onboarding state (step progress + completed flag) to allow tour to run again. */
export function clearOnboardingState(): void {
  safeRemove(ONBOARDING_STORAGE_KEY);
  safeRemove(ONBOARDING_COMPLETED_KEY);
}
