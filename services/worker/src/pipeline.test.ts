import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { ComparisonProcessor, DocumentProcessor } from './pipeline';
import {
  PermanentProcessingError,
  type ClaimedComparisonJob,
  type ClaimedProcessingJob,
  type ComparisonResult,
  type InspectionResult,
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
