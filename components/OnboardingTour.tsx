'use client';

import { useOnboarding, ONBOARDING_STEPS } from '@/hooks/useOnboarding';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

export function OnboardingTour() {
  const { isActive, currentStepIndex, currentStep, nextStep, prevStep, skip } = useOnboarding();

  if (!isActive || !currentStep) return null;

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === ONBOARDING_STEPS.length - 1;
  const stepNumber = currentStepIndex + 1;
  const totalSteps = ONBOARDING_STEPS.length;

  return (
    <Modal
      onClose={skip}
      title={currentStep.title}
      headerAction={
        <button
          type="button"
          onClick={skip}
          aria-label="Skip tour"
          className="text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-black dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          Skip Tour
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-gray-600">{currentStep.description}</p>

        {/* Step indicator — dots + "Step X of N" counter (#694) */}
        <div
          className="flex items-center gap-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={stepNumber}
          aria-label={`Step ${stepNumber} of ${totalSteps}`}
        >
          {ONBOARDING_STEPS.map((step, idx) => (
            <div
              key={step.id}
              aria-hidden="true"
              className={`h-2 flex-1 rounded-full transition-colors ${
                idx <= currentStepIndex ? 'bg-black' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        <div className="text-sm text-gray-500">
          Step {stepNumber} of {totalSteps}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <Button
            variant="secondary"
            onClick={skip}
            className="flex-1"
          >
            Skip
          </Button>

          {!isFirstStep && (
            <Button
              variant="secondary"
              onClick={prevStep}
              className="flex-1"
            >
              Back
            </Button>
          )}

          <Button
            variant="primary"
            onClick={nextStep}
            className="flex-1"
          >
            {isLastStep ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
