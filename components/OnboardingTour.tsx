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
    <Modal onClose={skip} title={currentStep.title}>
      <div className="space-y-4">
        <p className="text-gray-600">{currentStep.description}</p>

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {ONBOARDING_STEPS.map((_, idx) => (
            <div
              key={idx}
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
