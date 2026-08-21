import type {
  FeedbackReason,
  FeedbackResourceType,
  OnboardingActor,
  OnboardingEvidence,
  ProductFeedback,
  SampleComparison,
} from './types';

export type OnboardingOperationErrorCode =
  'denied' | 'invalid_sample' | 'not_found';

export class OnboardingOperationError extends Error {
  public constructor(public readonly code: OnboardingOperationErrorCode) {
    super(code);
  }
}

export interface OnboardingStore {
  appendFeedback(input: {
    actor: OnboardingActor;
    comment: string | null;
    productVersion: string;
    rating: number;
    reason: FeedbackReason;
    resourceType: FeedbackResourceType;
    route: string;
  }): Promise<ProductFeedback>;
  getEvidence(input: { actor: OnboardingActor }): Promise<OnboardingEvidence>;
  getPreferences(input: { actor: OnboardingActor }): Promise<{
    dismissed: boolean;
    tourStatus: 'completed' | 'skipped' | 'unseen';
    tourVersion: string | null;
  }>;
  listFeedback(input: {
    actor: OnboardingActor;
    limit: number;
  }): Promise<ProductFeedback[]>;
  listSamples(input: { actor: OnboardingActor }): Promise<SampleComparison[]>;
  registerSample(input: {
    actor: OnboardingActor;
    comparisonId: string;
    description: string;
    documentId: string;
    kind: 'presentation' | 'spreadsheet' | 'word_document';
    projectId: string;
    title: string;
  }): Promise<SampleComparison>;
  updatePreferences(input: {
    actor: OnboardingActor;
    dismissed?: boolean | undefined;
    tour?: { status: 'completed' | 'skipped'; version: string } | undefined;
  }): Promise<void>;
}
