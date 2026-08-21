import type { KeyValueStorage } from './base-context';
import type { DocumentBinding } from './document-binding';

export type SaveCompareState =
  | 'idle'
  | 'capturing'
  | 'requesting_upload'
  | 'uploading'
  | 'finalizing'
  | 'processing_version'
  | 'selecting_baseline'
  | 'creating_comparison'
  | 'processing_comparison'
  | 'ready_for_review'
  | 'cancelled'
  | 'preserved_conflict'
  | 'quarantined'
  | 'retryable_failure'
  | 'terminal_failure';

export type SaveCompareEvent =
  | 'begin'
  | 'captured'
  | 'upload_requested'
  | 'uploaded'
  | 'finalized'
  | 'version_ready'
  | 'baseline_selected'
  | 'comparison_created'
  | 'comparison_ready'
  | 'cancel'
  | 'conflict'
  | 'quarantine'
  | 'retryable_error'
  | 'terminal_error';

const TRANSITIONS: Record<
  SaveCompareState,
  Partial<Record<SaveCompareEvent, SaveCompareState>>
> = {
  cancelled: {},
  capturing: {
    cancel: 'cancelled',
    captured: 'requesting_upload',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
  },
  creating_comparison: {
    comparison_created: 'processing_comparison',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
  },
  finalizing: {
    conflict: 'preserved_conflict',
    finalized: 'processing_version',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
  },
  idle: { begin: 'capturing' },
  preserved_conflict: {
    finalized: 'processing_version',
    terminal_error: 'terminal_failure',
  },
  processing_comparison: {
    comparison_ready: 'ready_for_review',
    quarantine: 'quarantined',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
  },
  processing_version: {
    quarantine: 'quarantined',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
    version_ready: 'selecting_baseline',
  },
  quarantined: {},
  ready_for_review: {},
  requesting_upload: {
    cancel: 'cancelled',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
    upload_requested: 'uploading',
  },
  retryable_failure: {
    begin: 'capturing',
    comparison_created: 'processing_comparison',
    finalized: 'processing_version',
    version_ready: 'selecting_baseline',
  },
  selecting_baseline: {
    baseline_selected: 'creating_comparison',
    comparison_ready: 'ready_for_review',
    terminal_error: 'terminal_failure',
  },
  terminal_failure: {},
  uploading: {
    cancel: 'cancelled',
    retryable_error: 'retryable_failure',
    terminal_error: 'terminal_failure',
    uploaded: 'finalizing',
  },
};

export interface SaveCompareWorkflow {
  baselineVersionId: string | null;
  comparisonId: string | null;
  schemaVersion: 1;
  stage: SaveCompareState;
  targetVersionId: string;
  verifiedBaseVersionId: string | null;
}

export function transitionSaveCompare(
  state: SaveCompareState,
  event: SaveCompareEvent,
): SaveCompareState {
  const next = TRANSITIONS[state][event];
  if (!next) {
    throw new Error(`Invalid Save & Compare transition: ${state} -> ${event}`);
  }
  return next;
}

export function comparisonReviewPath(
  binding: DocumentBinding,
  comparisonId: string,
): string {
  const query = new URLSearchParams({
    mode: 'visual',
    returnTo: 'office-addin',
  });
  return `/app/projects/${binding.projectId}/documents/${binding.documentId}/history/comparisons/${comparisonId}?${query.toString()}`;
}

export function createSaveCompareWorkflowStore(storage: KeyValueStorage) {
  return {
    clear(binding: DocumentBinding) {
      storage.removeItem(storageKey(binding));
    },
    load(binding: DocumentBinding): SaveCompareWorkflow | null {
      const raw = storage.getItem(storageKey(binding));
      if (!raw) return null;
      try {
        return parseWorkflow(JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    },
    save(binding: DocumentBinding, workflow: SaveCompareWorkflow) {
      storage.setItem(storageKey(binding), JSON.stringify(workflow));
    },
  };
}

function parseWorkflow(value: unknown): SaveCompareWorkflow | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    !isUuid(value.targetVersionId) ||
    !isNullableUuid(value.comparisonId) ||
    !isNullableUuid(value.baselineVersionId) ||
    !isNullableUuid(value.verifiedBaseVersionId) ||
    typeof value.stage !== 'string' ||
    !(value.stage in TRANSITIONS)
  ) {
    return null;
  }
  return value as unknown as SaveCompareWorkflow;
}

function storageKey(binding: DocumentBinding): string {
  return `mergecom.save-compare.v1.${binding.organizationId}.${binding.projectId}.${binding.documentId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isUuid(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
