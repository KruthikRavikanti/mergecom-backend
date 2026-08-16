import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  ComparisonProcessor,
  DocumentProcessor,
  MergeProcessor,
} from './pipeline';
import {
  PermanentProcessingError,
  type ClaimedComparisonJob,
  type ClaimedMergeJob,
  type ClaimedProcessingJob,
  type ComparisonResult,
  type InspectionResult,
  type MergeResult,
} from './types';

const job: ClaimedProcessingJob = {
  artifactByteSize: 4,
  artifactObjectKey: 'organizations/org/artifacts/source.docx',
  artifactSha256: 'a'.repeat(64),
  attempts: 1,
  extension: '.docx',
  fileType: 'word_document',
  id: 'job-id',
  maxAttempts: 3,
  organizationId: '12000000-0000-4000-8000-000000000001',
  traceId: '22000000-0000-4000-8000-000000000001',
  versionId: '32000000-0000-4000-8000-000000000001',
};

const result: InspectionResult = {
  failure_code: null,
  outcome: 'completed',
  snapshot: {
    file_type: 'word_document',
    format_payload: { paragraph_count: 1 },
    package: { entry_count: 3, has_macros: false },
    parser_version: '1.1.0',
    schema_version: '1.1.0',
    source_sha256: job.artifactSha256,
    stable_hash: 'b'.repeat(64),
    unsupported_features: [],
    validation_errors: [],
    warnings: [],
  },
};

function dependencies(
  options: {
    claim?: ClaimedProcessingJob | null;
    readError?: Error;
    retry?: boolean;
  } = {},
) {
  const store = {
    claim: vi
      .fn()
      .mockResolvedValue(options.claim === undefined ? job : options.claim),
    complete: vi.fn().mockResolvedValue(undefined),
    heartbeat: vi.fn().mockResolvedValue(true),
    listDispatchable: vi.fn().mockResolvedValue([]),
    markDispatched: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(options.retry ?? false),
  };
  const storage = {
    putSnapshot: vi.fn().mockResolvedValue(undefined),
    readArtifact: options.readError
      ? vi.fn().mockRejectedValue(options.readError)
      : vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
  };
  const engine = { inspect: vi.fn().mockResolvedValue(result) };
  return { engine, storage, store };
}

describe('document processor', () => {
  it('stores a deterministic immutable snapshot before completing the job', async () => {
    const { engine, storage, store } = dependencies();
    const processor = new DocumentProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
    );

    await processor.process(job.id);

    expect(storage.putSnapshot).toHaveBeenCalledOnce();
    const snapshot = storage.putSnapshot.mock.calls[0]?.[0];
    expect(snapshot.key).toContain(
      `${job.versionId}/schema-1.1.0-parser-1.1.0.json`,
    );
    expect(snapshot.snapshotSha256).toBe(
      createHash('sha256')
        .update(new TextEncoder().encode(JSON.stringify(result.snapshot)))
        .digest('hex'),
    );
    expect(store.complete).toHaveBeenCalledOnce();
    expect(store.recordFailure).not.toHaveBeenCalled();
  });

  it('treats duplicate terminal deliveries as no-ops when the claim is absent', async () => {
    const { engine, storage, store } = dependencies({ claim: null });
    const processor = new DocumentProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
    );

    await processor.process(job.id);

    expect(storage.readArtifact).not.toHaveBeenCalled();
    expect(engine.inspect).not.toHaveBeenCalled();
    expect(store.complete).not.toHaveBeenCalled();
  });

  it('records retryable dependency failures and lets BullMQ retry', async () => {
    const dependencyError = new Error('engine unavailable');
    const { engine, storage, store } = dependencies({
      readError: dependencyError,
      retry: true,
    });
    const processor = new DocumentProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
    );

    await expect(processor.process(job.id)).rejects.toThrow(
      'engine unavailable',
    );
    expect(store.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'processing_dependency_unavailable',
        retryable: true,
      }),
    );
  });

  it('does not retry permanent integrity failures', async () => {
    const { engine, storage, store } = dependencies({
      readError: new PermanentProcessingError(
        'artifact_hash_mismatch',
        'hash mismatch',
      ),
    });
    const processor = new DocumentProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
    );

    await processor.process(job.id);

    expect(store.recordFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'artifact_hash_mismatch',
        retryable: false,
      }),
    );
  });
});

const comparisonJob: ClaimedComparisonJob = {
  attempts: 1,
  baseArtifact: {
    byteSize: 4,
    extension: '.docx',
    objectKey: 'organizations/org/artifacts/base.docx',
    sha256: 'c'.repeat(64),
    versionId: '42000000-0000-4000-8000-000000000001',
  },
  comparisonSchemaVersion: '1.0.0',
  engineVersion: '1.0.0',
  fileType: 'word_document',
  id: '52000000-0000-4000-8000-000000000001',
  maxAttempts: 3,
  organizationId: job.organizationId,
  parserVersion: '1.1.0',
  targetArtifact: {
    byteSize: 4,
    extension: '.docx',
    objectKey: 'organizations/org/artifacts/target.docx',
    sha256: 'd'.repeat(64),
    versionId: '62000000-0000-4000-8000-000000000001',
  },
  traceId: job.traceId,
};

const comparisonResult: ComparisonResult = {
  base_source_sha256: comparisonJob.baseArtifact.sha256,
  byte_equal: false,
  changes: [
    {
      after: 'After',
      before: 'Before',
      category: 'content',
      change_type: 'modified',
      entity_type: 'paragraph',
      id: 'f'.repeat(64),
      impact: 'medium',
      label: 'Paragraph',
      path: '/body/1/paragraph',
    },
  ],
  comparison_schema_version: comparisonJob.comparisonSchemaVersion,
  completeness: 'complete',
  engine_version: comparisonJob.engineVersion,
  file_type: comparisonJob.fileType,
  parser_version: comparisonJob.parserVersion,
  semantic_equal: false,
  stable_hash: 'e'.repeat(64),
  summary: { modified: 1, total: 1 },
  target_source_sha256: comparisonJob.targetArtifact.sha256,
  warnings: [],
};

describe('comparison processor', () => {
  it('verifies both artifacts and stores an immutable result before completion', async () => {
    const store = {
      claimComparison: vi.fn().mockResolvedValue(comparisonJob),
      completeComparison: vi.fn().mockResolvedValue(undefined),
      heartbeatComparison: vi.fn().mockResolvedValue(true),
      listDispatchableComparisons: vi.fn().mockResolvedValue([]),
      markComparisonDispatched: vi.fn().mockResolvedValue(undefined),
      recordComparisonFailure: vi.fn().mockResolvedValue(false),
    };
    const storage = {
      putComparison: vi.fn().mockResolvedValue(undefined),
      readArtifact: vi
        .fn()
        .mockResolvedValueOnce(Uint8Array.from([1, 2, 3, 4]))
        .mockResolvedValueOnce(Uint8Array.from([4, 3, 2, 1])),
    };
    const engine = { compare: vi.fn().mockResolvedValue(comparisonResult) };
    const processor = new ComparisonProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
    );

    await processor.process(comparisonJob.id);

    expect(storage.readArtifact).toHaveBeenCalledTimes(2);
    expect(engine.compare).toHaveBeenCalledOnce();
    expect(storage.putComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(
          `${comparisonJob.id}/schema-1.0.0-parser-1.1.0.json`,
        ),
        stableHash: comparisonResult.stable_hash,
      }),
    );
    expect(store.completeComparison).toHaveBeenCalledOnce();
    expect(store.recordComparisonFailure).not.toHaveBeenCalled();
  });
});

const mergeCandidate = Uint8Array.from([9, 8, 7, 6]);
const mergeJob: ClaimedMergeJob = {
  attempts: 1,
  baseArtifact: comparisonJob.baseArtifact,
  branchId: '72000000-0000-4000-8000-000000000001',
  documentId: '82000000-0000-4000-8000-000000000001',
  engineVersion: '1.2.0',
  fileType: 'word_document',
  id: '92000000-0000-4000-8000-000000000001',
  maxAttempts: 3,
  mergeSchemaVersion: '1.2.0',
  note: 'Merge approved edits',
  organizationId: job.organizationId,
  oursArtifact: {
    byteSize: 4,
    detectedMediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: '.docx',
    objectKey: 'organizations/org/artifacts/ours.docx',
    originalFilename: 'proposal.docx',
    sha256: '1'.repeat(64),
    versionId: 'a2000000-0000-4000-8000-000000000001',
  },
  parserVersion: '1.1.0',
  requestedByUserId: 'b2000000-0000-4000-8000-000000000001',
  theirsArtifact: comparisonJob.targetArtifact,
  traceId: job.traceId,
};
const mergeResult: MergeResult = {
  analysis: {
    automatic_merge_eligible: true,
    automatic_merge_enabled: false,
    blockers: [],
    items: [],
    schema_version: '1.0.0',
    summary: {
      ambiguous: 0,
      compatible_overlap: 0,
      non_overlapping: 0,
      true_conflict: 0,
      unsupported: 0,
    },
  },
  applied_paths: ['/body/p/2'],
  base_source_sha256: mergeJob.baseArtifact.sha256,
  candidate_byte_size: mergeCandidate.byteLength,
  candidate_bytes: mergeCandidate,
  candidate_sha256: createHash('sha256').update(mergeCandidate).digest('hex'),
  engine_version: mergeJob.engineVersion,
  failure_code: null,
  file_type: mergeJob.fileType,
  merge_schema_version: mergeJob.mergeSchemaVersion,
  outcome: 'completed',
  ours_source_sha256: mergeJob.oursArtifact.sha256,
  parser_version: mergeJob.parserVersion,
  stable_hash: '2'.repeat(64),
  strategy: 'disjoint_word_text',
  theirs_source_sha256: mergeJob.theirsArtifact.sha256,
  warnings: [],
};

describe('merge processor', () => {
  it('stores a content-addressed candidate before transactional completion', async () => {
    const store = {
      claimMerge: vi.fn().mockResolvedValue(mergeJob),
      completeMerge: vi.fn().mockResolvedValue(undefined),
      heartbeatMerge: vi.fn().mockResolvedValue(true),
      listDispatchableMerges: vi.fn().mockResolvedValue([]),
      markMergeDispatched: vi.fn().mockResolvedValue(undefined),
      recordMergeFailure: vi.fn().mockResolvedValue(false),
    };
    const storage = {
      putMergeCandidate: vi.fn().mockResolvedValue(undefined),
      readArtifact: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
    };
    const engine = { merge: vi.fn().mockResolvedValue(mergeResult) };
    const processor = new MergeProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
      true,
      [mergeJob.organizationId],
    );

    await processor.process(mergeJob.id);

    expect(storage.readArtifact).toHaveBeenCalledTimes(3);
    expect(engine.merge).toHaveBeenCalledWith(
      mergeJob,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      true,
      false,
    );
    expect(storage.putMergeCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(
          `${mergeJob.id}/${mergeResult.candidate_sha256}.docx`,
        ),
        sha256: mergeResult.candidate_sha256,
      }),
    );
    expect(store.completeMerge).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateObjectKey: expect.stringContaining(
          mergeResult.candidate_sha256!,
        ),
      }),
    );
    expect(store.recordMergeFailure).not.toHaveBeenCalled();
  });

  it('completes manual resolution without inventing a candidate', async () => {
    const manual: MergeResult = {
      ...mergeResult,
      applied_paths: [],
      candidate_byte_size: null,
      candidate_bytes: null,
      candidate_sha256: null,
      failure_code: 'merge_changes_overlap',
      outcome: 'manual_resolution_required',
      strategy: null,
    };
    const store = {
      claimMerge: vi.fn().mockResolvedValue(mergeJob),
      completeMerge: vi.fn().mockResolvedValue(undefined),
      heartbeatMerge: vi.fn().mockResolvedValue(true),
      listDispatchableMerges: vi.fn().mockResolvedValue([]),
      markMergeDispatched: vi.fn().mockResolvedValue(undefined),
      recordMergeFailure: vi.fn().mockResolvedValue(false),
    };
    const storage = {
      putMergeCandidate: vi.fn().mockResolvedValue(undefined),
      readArtifact: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
    };
    const processor = new MergeProcessor(
      store,
      storage,
      { merge: vi.fn().mockResolvedValue(manual) },
      30_000,
      60_000,
    );

    await processor.process(mergeJob.id);

    expect(storage.putMergeCandidate).not.toHaveBeenCalled();
    expect(store.completeMerge).toHaveBeenCalledWith(
      expect.objectContaining({ candidateObjectKey: null }),
    );
  });

  it('requires both the global flag and organization pilot membership', async () => {
    const store = {
      claimMerge: vi.fn().mockResolvedValue(mergeJob),
      completeMerge: vi.fn().mockResolvedValue(undefined),
      heartbeatMerge: vi.fn().mockResolvedValue(true),
      listDispatchableMerges: vi.fn().mockResolvedValue([]),
      markMergeDispatched: vi.fn().mockResolvedValue(undefined),
      recordMergeFailure: vi.fn().mockResolvedValue(false),
    };
    const storage = {
      putMergeCandidate: vi.fn().mockResolvedValue(undefined),
      readArtifact: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
    };
    const engine = { merge: vi.fn().mockResolvedValue(mergeResult) };
    const processor = new MergeProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
      true,
      ['10000000-0000-4000-8000-000000000099'],
    );

    await processor.process(mergeJob.id);

    expect(engine.merge).toHaveBeenCalledWith(
      mergeJob,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      false,
      false,
    );
  });

  it('requires both the Excel global flag and organization pilot membership', async () => {
    const store = {
      claimMerge: vi.fn().mockResolvedValue(mergeJob),
      completeMerge: vi.fn().mockResolvedValue(undefined),
      heartbeatMerge: vi.fn().mockResolvedValue(true),
      listDispatchableMerges: vi.fn().mockResolvedValue([]),
      markMergeDispatched: vi.fn().mockResolvedValue(undefined),
      recordMergeFailure: vi.fn().mockResolvedValue(false),
    };
    const storage = {
      putMergeCandidate: vi.fn().mockResolvedValue(undefined),
      readArtifact: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3, 4])),
    };
    const engine = { merge: vi.fn().mockResolvedValue(mergeResult) };
    const processor = new MergeProcessor(
      store,
      storage,
      engine,
      30_000,
      60_000,
      false,
      [],
      true,
      [mergeJob.organizationId],
    );

    await processor.process(mergeJob.id);

    expect(engine.merge).toHaveBeenCalledWith(
      mergeJob,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      false,
      true,
    );
  });
});
