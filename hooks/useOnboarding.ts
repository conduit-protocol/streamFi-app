"use client";

import { useEffect, useState } from "react";
import {
  loadOnboardingState,
  saveOnboardingState,
  clearOnboardingState,
} from "@/lib/onboarding-storage";

export const ONBOARDING_STEPS = [
  {
    id: "welcome",
    title: "Welcome to StreamFi",
    description:
      "Stream payments continuously. Get started in just a few steps.",
  },
  {
    id: "connect-wallet",
    title: "Connect Your Wallet",
    description:
      "First, connect your Stellar wallet to send or receive continuous streams.",
  },
  {
    id: "create-stream",
    title: "Create a Stream",
    description:
      "Once connected, you can create a stream to send continuous payments at a fixed rate.",
  },
  {
    id: "withdraw",
    title: "Withdraw Funds",
    description: "Withdraw available funds from your incoming streams anytime.",
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export interface UseOnboardingReturn {
  isActive: boolean;
  currentStepIndex: number;
  currentStep: (typeof ONBOARDING_STEPS)[number] | null;
  nextStep: () => void;
  prevStep: () => void;
  skip: () => void;
  reset: () => void;
  goToStep: (index: number) => void;
}

/** Hook for managing onboarding tour state with localStorage persistence. */
export function useOnboarding(): UseOnboardingReturn {
  const [state, setState] = useState<{
    isActive: boolean;
    currentStepIndex: number;
  }>({
    isActive: false,
    currentStepIndex: 0,
  });

  // Load initial state from storage
  useEffect(() => {
    const stored = loadOnboardingState();
    if (!stored || !stored.completed) {
      // Tour not yet completed, show it
      setState({
        isActive: true,
        currentStepIndex: stored?.currentStep ?? 0,
      });
    } else {
      setState({
        isActive: false,
        currentStepIndex: 0,
      });
    }
  }, []);

  const currentStep = state.isActive
    ? ONBOARDING_STEPS[state.currentStepIndex] || null
    : null;

  const nextStep = () => {
    const nextIndex = state.currentStepIndex + 1;
    if (nextIndex >= ONBOARDING_STEPS.length) {
      // Tour complete
      saveOnboardingState({
        completed: true,
        dismissedAt: Date.now(),
      });
      setState({ isActive: false, currentStepIndex: 0 });
    } else {
      setState({ isActive: true, currentStepIndex: nextIndex });
      saveOnboardingState({
        completed: false,
        currentStep: nextIndex,
      });
    }
  };

  const prevStep = () => {
    if (state.currentStepIndex > 0) {
      const prevIndex = state.currentStepIndex - 1;
      setState({ isActive: true, currentStepIndex: prevIndex });
      saveOnboardingState({
        completed: false,
        currentStep: prevIndex,
      });
    }
  };

  const skip = () => {
    saveOnboardingState({
      completed: true,
      dismissedAt: Date.now(),
    });
    setState({ isActive: false, currentStepIndex: 0 });
  };

  const reset = () => {
    clearOnboardingState();
    setState({ isActive: true, currentStepIndex: 0 });
  };

  const goToStep = (index: number) => {
    const clampedIndex = Math.max(
      0,
      Math.min(index, ONBOARDING_STEPS.length - 1),
    );
    setState({ isActive: true, currentStepIndex: clampedIndex });
    saveOnboardingState({
      completed: false,
      currentStep: clampedIndex,
    });
  };

  return {
    isActive: state.isActive,
    currentStepIndex: state.currentStepIndex,
    currentStep,
    nextStep,
    prevStep,
    skip,
    reset,
    goToStep,
  };
}
