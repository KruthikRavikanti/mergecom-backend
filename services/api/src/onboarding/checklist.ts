import type { OrganizationRole } from '../identity/types';
import type {
  OnboardingEvidence,
  OnboardingStep,
  OnboardingStepKey,
} from './types';

const definitions: Record<
  OnboardingStepKey,
  Omit<OnboardingStep, 'completed' | 'key'>
> = {
  add_document: {
    description: 'Create, upload, or link an Office document in a project.',
    destination: '/app/projects',
    label: 'Add or link a document',
  },
  explore_sample: {
    description: 'Inspect a synthetic comparison and its source changes.',
    destination: '/app/getting-started#samples',
    label: 'Explore a sample comparison',
  },
  first_version: {
    description: 'Save an exact Office package as the first immutable version.',
    destination: '/app/setup',
    label: 'Save the first version',
  },
  project_access: {
    description: 'Create a project or join one shared with you.',
    destination: '/app/projects',
    label: 'Create or join a project',
  },
  review: {
    description: 'Request a review or record an assigned review decision.',
    destination: '/app',
    label: 'Request or complete a review',
  },
  save_and_compare: {
    description: 'Save a second version and open its semantic comparison.',
    destination: '/app/setup',
    label: 'Save and compare a second version',
  },
};

export function deriveOnboardingSteps(input: {
  evidence: OnboardingEvidence;
  role: OrganizationRole;
}): OnboardingStep[] {
  const canCreateProject = ['owner', 'admin', 'project_lead'].includes(
    input.role,
  );
  const canWrite = canCreateProject || input.evidence.canWriteContent;
  const canReview = input.role !== 'viewer';
  const visible: OnboardingStepKey[] = [
    'explore_sample',
    'project_access',
    ...(canWrite
      ? (['add_document', 'first_version', 'save_and_compare'] as const)
      : []),
    ...(canReview ? (['review'] as const) : []),
  ];
  const completion: Record<OnboardingStepKey, boolean> = {
    add_document: input.evidence.hasDocument,
    explore_sample: input.evidence.hasSampleRecent,
    first_version: input.evidence.hasVersion,
    project_access: input.evidence.hasProject,
    review: input.evidence.hasReviewAction,
    save_and_compare: input.evidence.hasComparison,
  };
  return visible.map((key) => ({
    ...definitions[key],
    completed: completion[key],
    key,
  }));
}
