/**
 * Tests for hooks/useOnboarding.ts (#611).
 *
 * Covers the onboarding tour hook: step navigation, localStorage
 * persistence, skip, reset, and edge cases.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboarding, ONBOARDING_STEPS } from '../useOnboarding';
import * as storage from '@/lib/onboarding-storage';

vi.mock('@/lib/onboarding-storage', () => ({
  loadOnboardingState: vi.fn(),
  saveOnboardingState: vi.fn(),
  clearOnboardingState: vi.fn(),
}));

const mockLoad = vi.mocked(storage.loadOnboardingState);
const mockSave = vi.mocked(storage.saveOnboardingState);
const mockClear = vi.mocked(storage.clearOnboardingState);

describe('useOnboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockReturnValue(null);
  });

  it('starts active when no stored state exists', () => {
    const { result } = renderHook(() => useOnboarding());

    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(0);
    expect(result.current.currentStep).toEqual(ONBOARDING_STEPS[0]);
  });

  it('starts inactive when onboarding was completed', () => {
    mockLoad.mockReturnValue({ completed: true, dismissedAt: Date.now() });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.isActive).toBe(false);
    expect(result.current.currentStep).toBeNull();
  });

  it('resumes from stored step when not completed', () => {
    mockLoad.mockReturnValue({ completed: false, currentStep: 2 });

    const { result } = renderHook(() => useOnboarding());

    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(2);
    expect(result.current.currentStep).toEqual(ONBOARDING_STEPS[2]);
  });

  it('nextStep advances to the next step', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.nextStep());

    expect(result.current.currentStepIndex).toBe(1);
    expect(result.current.currentStep).toEqual(ONBOARDING_STEPS[1]);
  });

  it('nextStep completes the tour on the last step', () => {
    mockLoad.mockReturnValue({ completed: false, currentStep: ONBOARDING_STEPS.length - 1 });

    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.nextStep());

    expect(result.current.isActive).toBe(false);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true }),
    );
  });

  it('prevStep goes back to the previous step', () => {
    mockLoad.mockReturnValue({ completed: false, currentStep: 2 });

    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.prevStep());

    expect(result.current.currentStepIndex).toBe(1);
  });

  it('prevStep does nothing at step 0', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.prevStep());

    expect(result.current.currentStepIndex).toBe(0);
  });

  it('skip marks the tour as completed', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.skip());

    expect(result.current.isActive).toBe(false);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ completed: true }),
    );
  });

  it('reset clears storage and restarts the tour', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.reset());

    expect(mockClear).toHaveBeenCalledOnce();
    expect(result.current.isActive).toBe(true);
    expect(result.current.currentStepIndex).toBe(0);
  });

  it('goToStep navigates to a specific step', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.goToStep(3));

    expect(result.current.currentStepIndex).toBe(3);
    expect(result.current.currentStep).toEqual(ONBOARDING_STEPS[3]);
  });

  it('goToStep clamps to valid range (below 0)', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.goToStep(-5));

    expect(result.current.currentStepIndex).toBe(0);
  });

  it('goToStep clamps to valid range (above max)', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.goToStep(999));

    expect(result.current.currentStepIndex).toBe(ONBOARDING_STEPS.length - 1);
  });

  it('saves state on nextStep', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.nextStep());

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ completed: false, currentStep: 1 }),
    );
  });

  it('saves state on goToStep', () => {
    const { result } = renderHook(() => useOnboarding());

    act(() => result.current.goToStep(2));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ completed: false, currentStep: 2 }),
    );
  });

  it('ONBOARDING_STEPS has expected step IDs', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(ids).toEqual(['welcome', 'connect-wallet', 'create-stream', 'withdraw']);
  });
});
