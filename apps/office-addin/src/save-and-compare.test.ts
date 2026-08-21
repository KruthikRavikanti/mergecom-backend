import { describe, expect, it } from 'vitest';

import type { KeyValueStorage } from './base-context';
import type { DocumentBinding } from './document-binding';
import {
  comparisonReviewPath,
  createSaveCompareWorkflowStore,
  transitionSaveCompare,
} from './save-and-compare';

const binding: DocumentBinding = {
  documentId: '33333333-3333-4333-8333-333333333333',
  documentKind: 'presentation',
  organizationId: '11111111-1111-4111-8111-111111111111',
  projectId: '22222222-2222-4222-8222-222222222222',
  schemaVersion: 1,
};

function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('Save & Compare workflow', () => {
  it('follows the durable happy-path state machine', () => {
    let state = transitionSaveCompare('idle', 'begin');
    state = transitionSaveCompare(state, 'captured');
    state = transitionSaveCompare(state, 'upload_requested');
    state = transitionSaveCompare(state, 'uploaded');
    state = transitionSaveCompare(state, 'finalized');
    state = transitionSaveCompare(state, 'version_ready');
    state = transitionSaveCompare(state, 'baseline_selected');
    state = transitionSaveCompare(state, 'comparison_created');
    expect(transitionSaveCompare(state, 'comparison_ready')).toBe(
      'ready_for_review',
    );
  });

  it('rejects impossible transitions', () => {
    expect(() => transitionSaveCompare('idle', 'uploaded')).toThrow(
      'Invalid Save & Compare transition',
    );
  });

  it('restores durable resource identifiers after reload', () => {
    const store = createSaveCompareWorkflowStore(memoryStorage());
    const workflow = {
      baselineVersionId: '44444444-4444-4444-8444-444444444444',
      comparisonId: null,
      schemaVersion: 1 as const,
      stage: 'processing_version' as const,
      targetVersionId: '55555555-5555-4555-8555-555555555555',
      verifiedBaseVersionId: null,
    };
    store.save(binding, workflow);
    expect(store.load(binding)).toEqual(workflow);
  });

  it('builds an immutable visual-review deep link', () => {
    expect(
      comparisonReviewPath(binding, '66666666-6666-4666-8666-666666666666'),
    ).toBe(
      '/app/projects/22222222-2222-4222-8222-222222222222/documents/33333333-3333-4333-8333-333333333333/history/comparisons/66666666-6666-4666-8666-666666666666?mode=visual&returnTo=office-addin',
    );
  });
});
