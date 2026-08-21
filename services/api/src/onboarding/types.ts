import type { DocumentKind, ProjectActor } from '../projects/types';

export type OnboardingActor = ProjectActor;
export type OnboardingStepKey =
  | 'explore_sample'
  | 'project_access'
  | 'add_document'
  | 'first_version'
  | 'save_and_compare'
  | 'review';

export interface OnboardingStep {
  completed: boolean;
  description: string;
  destination: string;
  key: OnboardingStepKey;
  label: string;
}

export interface OnboardingEvidence {
  canWriteContent: boolean;
  hasComparison: boolean;
  hasDocument: boolean;
  hasProject: boolean;
  hasReviewAction: boolean;
  hasSampleRecent: boolean;
  hasVersion: boolean;
}

export interface SampleComparison {
  description: string;
  destination: string;
  document: { id: string; name: string };
  id: string;
  kind: DocumentKind;
  project: { id: string; name: string };
  title: string;
}

export interface OnboardingState {
  dismissed: boolean;
  progress: { completed: number; total: number };
  samples: SampleComparison[];
  steps: OnboardingStep[];
  tour: {
    status: 'completed' | 'skipped' | 'unseen';
    version: string | null;
  };
}

export type FeedbackReason =
  | 'confusing'
  | 'missing_capability'
  | 'performance'
  | 'incorrect_result'
  | 'positive'
  | 'other';
export type FeedbackResourceType =
  | 'onboarding'
  | 'comparison'
  | 'office_addin'
  | 'setup'
  | 'workspace'
  | 'other';

export interface ProductFeedback {
  comment: string | null;
  createdAt: Date;
  id: string;
  productVersion: string;
  rating: number;
  reason: FeedbackReason;
  resourceType: FeedbackResourceType;
  route: string;
  userId: string;
}
