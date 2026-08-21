import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useUpdateOnboardingPreferencesMutation } from '../../api/queries';
import type { CurrentUser } from '../../auth/session';

export const COMPARISON_TOUR_VERSION = 'comparison-workspace-v1';

const steps = [
  {
    description:
      'Start with deterministic counts, attention rules, coverage, and approved-baseline status.',
    selector: '[data-tour="comparison-summary"]',
    title: 'Comparison summary',
  },
  {
    description:
      'Choose a stable semantic change. Filters remain visible in the comparison URL.',
    selector: '[data-tour="change-rail"]',
    title: 'Change rail',
  },
  {
    description:
      'Verify the selected change against both source versions in visual or structured mode.',
    selector: '[data-tour="version-viewers"]',
    title: 'Version viewers',
  },
  {
    description:
      'Check exact before and after values, deterministic classification, and visual mapping confidence.',
    selector: '[data-tour="change-inspector"]',
    title: 'Change inspector',
  },
  {
    description:
      'Open an anchored discussion, request review, or record an assigned decision without changing the source versions.',
    selector: '[data-tour="review-controls"]',
    title: 'Review controls',
  },
] as const;

export function ComparisonTour({
  onClose,
  user,
}: {
  onClose: () => void;
  user: CurrentUser;
}) {
  const [step, setStep] = useState(0);
  const updatePreferences = useUpdateOnboardingPreferencesMutation(user);
  const { mutateAsync: updatePreferencesAsync } = updatePreferences;
  const current = steps[step]!;

  const finish = useCallback(
    async (status: 'completed' | 'skipped') => {
      try {
        await updatePreferencesAsync({
          tour: { status, version: COMPARISON_TOUR_VERSION },
        });
      } catch {
        // Closing the guide must not depend on preference persistence.
      } finally {
        onClose();
      }
    },
    [onClose, updatePreferencesAsync],
  );

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(current.selector);
    if (!target) return;
    target.classList.add('comparison-tour-highlight');
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'nearest',
    });
    return () => target.classList.remove('comparison-tour-highlight');
  }, [current.selector]);

  useEffect(() => {
    function navigate(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        setStep((value) => Math.min(steps.length - 1, value + 1));
      }
      if (event.key === 'ArrowLeft') {
        setStep((value) => Math.max(0, value - 1));
      }
      if (event.key === 'Escape') void finish('skipped');
    }
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [finish]);

  return (
    <section
      className="comparison-tour"
      aria-labelledby="comparison-tour-title"
    >
      <div>
        <span>
          GUIDE {step + 1} OF {steps.length}
        </span>
        <h2 id="comparison-tour-title">{current.title}</h2>
        <p>{current.description}</p>
      </div>
      <div className="comparison-tour-actions">
        <button
          aria-label="Skip comparison guide"
          className="comparison-tour-skip"
          title="Skip comparison guide"
          type="button"
          onClick={() => void finish('skipped')}
        >
          <X aria-hidden="true" size={16} />
        </button>
        <button
          aria-label="Previous guide step"
          disabled={step === 0}
          title="Previous guide step"
          type="button"
          onClick={() => setStep((value) => Math.max(0, value - 1))}
        >
          <ArrowLeft aria-hidden="true" size={16} />
        </button>
        {step === steps.length - 1 ? (
          <button
            className="comparison-tour-complete"
            type="button"
            onClick={() => void finish('completed')}
          >
            <Check aria-hidden="true" size={16} />
            Done
          </button>
        ) : (
          <button
            aria-label="Next guide step"
            title="Next guide step"
            type="button"
            onClick={() =>
              setStep((value) => Math.min(steps.length - 1, value + 1))
            }
          >
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
