/**
 * OnboardingTour — unit tests
 *
 * Coverage targets:
 *   1. Renders nothing when the tour is not active.
 *   2. Renders nothing when there is no current step, even if active.
 *   3. Renders the current step's title (as the Modal title) and description.
 *   4. Renders a step indicator dot per step in ONBOARDING_STEPS.
 *   5. Shows the "Step X of N" counter.
 *   6. Hides the "Back" button on the first step, shows it otherwise.
 *   7. Shows "Next" as the primary action label on non-final steps, "Finish"
 *      on the final step.
 *   8. Clicking Skip / Back / Next call the corresponding hook actions.
 *   9. Closing the Modal (onClose) calls skip.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OnboardingTour } from './OnboardingTour';
import { ONBOARDING_STEPS, useOnboarding } from '@/hooks/useOnboarding';

const nextStep = vi.fn();
const prevStep = vi.fn();
const skip = vi.fn();

vi.mock('@/hooks/useOnboarding', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useOnboarding')>('@/hooks/useOnboarding');
  return {
    ...actual,
    useOnboarding: vi.fn(),
  };
});

function mockOnboarding(overrides: Partial<ReturnType<typeof useOnboarding>>) {
  vi.mocked(useOnboarding).mockReturnValue({
    isActive: true,
    currentStepIndex: 0,
    currentStep: ONBOARDING_STEPS[0],
    nextStep,
    prevStep,
    skip,
    reset: vi.fn(),
    goToStep: vi.fn(),
    ...overrides,
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  const cleanup = () => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
  };
  return { container, cleanup };
}

function textOfButton(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === text);
}

beforeEach(() => {
  nextStep.mockClear();
  prevStep.mockClear();
  skip.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('OnboardingTour — inactive / empty states', () => {
  it('renders nothing when the tour is not active', () => {
    mockOnboarding({ isActive: false, currentStep: null });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(container.textContent).toBe('');
    cleanup();
  });

  it('renders nothing when there is no current step, even if active', () => {
    mockOnboarding({ isActive: true, currentStep: null });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(container.textContent).toBe('');
    cleanup();
  });
});

describe('OnboardingTour — step content', () => {
  it('renders the first step title and description', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(container.textContent).toContain(ONBOARDING_STEPS[0].title);
    expect(container.textContent).toContain(ONBOARDING_STEPS[0].description);
    cleanup();
  });

  it('renders one step-indicator dot per step', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 1, currentStep: ONBOARDING_STEPS[1] });
    const { container, cleanup } = render(<OnboardingTour />);
    const dots = container.querySelectorAll('.flex.items-center.gap-2 > div');
    expect(dots.length).toBe(ONBOARDING_STEPS.length);
    cleanup();
  });

  it('shows the "Step X of N" counter', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 2, currentStep: ONBOARDING_STEPS[2] });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(container.textContent).toContain(`Step 3 of ${ONBOARDING_STEPS.length}`);
    cleanup();
  });
});

describe('OnboardingTour — navigation buttons', () => {
  it('hides the Back button on the first step', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(textOfButton(container, 'Back')).toBeUndefined();
    cleanup();
  });

  it('shows the Back button on non-first steps', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 1, currentStep: ONBOARDING_STEPS[1] });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(textOfButton(container, 'Back')).toBeDefined();
    cleanup();
  });

  it('shows "Next" as the primary label on non-final steps', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(textOfButton(container, 'Next')).toBeDefined();
    expect(textOfButton(container, 'Finish')).toBeUndefined();
    cleanup();
  });

  it('shows "Finish" as the primary label on the final step', () => {
    const lastIndex = ONBOARDING_STEPS.length - 1;
    mockOnboarding({ isActive: true, currentStepIndex: lastIndex, currentStep: ONBOARDING_STEPS[lastIndex] });
    const { container, cleanup } = render(<OnboardingTour />);
    expect(textOfButton(container, 'Finish')).toBeDefined();
    expect(textOfButton(container, 'Next')).toBeUndefined();
    cleanup();
  });

  it('calls skip when the Skip button is clicked', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { container, cleanup } = render(<OnboardingTour />);
    act(() => { textOfButton(container, 'Skip')!.click(); });
    expect(skip).toHaveBeenCalledOnce();
    cleanup();
  });

  it('calls prevStep when the Back button is clicked', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 1, currentStep: ONBOARDING_STEPS[1] });
    const { container, cleanup } = render(<OnboardingTour />);
    act(() => { textOfButton(container, 'Back')!.click(); });
    expect(prevStep).toHaveBeenCalledOnce();
    cleanup();
  });

  it('calls nextStep when the Next/Finish button is clicked', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { container, cleanup } = render(<OnboardingTour />);
    act(() => { textOfButton(container, 'Next')!.click(); });
    expect(nextStep).toHaveBeenCalledOnce();
    cleanup();
  });
});

describe('OnboardingTour — modal dismissal', () => {
  it('calls skip when the modal close button is clicked', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { container, cleanup } = render(<OnboardingTour />);
    const closeButton = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    expect(closeButton).toBeTruthy();
    act(() => { closeButton.click(); });
    expect(skip).toHaveBeenCalledOnce();
    cleanup();
  });

  it('calls skip when Escape is pressed', () => {
    mockOnboarding({ isActive: true, currentStepIndex: 0, currentStep: ONBOARDING_STEPS[0] });
    const { cleanup } = render(<OnboardingTour />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(skip).toHaveBeenCalledOnce();
    cleanup();
  });
});
