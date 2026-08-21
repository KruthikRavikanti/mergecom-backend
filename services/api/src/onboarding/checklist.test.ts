import { describe, expect, it } from 'vitest';

import { deriveOnboardingSteps } from './checklist';
import type { OnboardingEvidence } from './types';

const emptyEvidence: OnboardingEvidence = {
  canWriteContent: false,
  hasComparison: false,
  hasDocument: false,
  hasProject: false,
  hasReviewAction: false,
  hasSampleRecent: false,
  hasVersion: false,
};

describe('onboarding checklist', () => {
  it('shows persisted creation outcomes to roles that can write', () => {
    const steps = deriveOnboardingSteps({
      evidence: {
        ...emptyEvidence,
        canWriteContent: true,
        hasDocument: true,
        hasProject: true,
        hasVersion: true,
      },
      role: 'contributor',
    });
    expect(steps.map((step) => step.key)).toEqual([
      'explore_sample',
      'project_access',
      'add_document',
      'first_version',
      'save_and_compare',
      'review',
    ]);
    expect(steps.find((step) => step.key === 'first_version')?.completed).toBe(
      true,
    );
  });

  it('removes unauthorized creation actions for reviewers and viewers', () => {
    expect(
      deriveOnboardingSteps({ evidence: emptyEvidence, role: 'reviewer' }).map(
        (step) => step.key,
      ),
    ).toEqual(['explore_sample', 'project_access', 'review']);
    expect(
      deriveOnboardingSteps({ evidence: emptyEvidence, role: 'viewer' }).map(
        (step) => step.key,
      ),
    ).toEqual(['explore_sample', 'project_access']);
  });

  it('derives completion only from server-owned evidence', () => {
    const evidence = Object.fromEntries(
      Object.keys(emptyEvidence).map((key) => [key, true]),
    ) as unknown as OnboardingEvidence;
    expect(
      deriveOnboardingSteps({ evidence, role: 'owner' }).every(
        (step) => step.completed,
      ),
    ).toBe(true);
  });
});
