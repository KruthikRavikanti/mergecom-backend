import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import type { Queue, Worker } from 'bullmq';

import type { ArtifactStorage } from './artifact-storage';
import type { WorkerConfig } from './config';
import type { DocumentEngineClient } from './document-engine-client';
import type { ProcessingStore } from './processing-store';
import type { RenditionEngineClient } from './rendition-engine-client';
import { WorkerMetrics } from './metrics';
import {
  createDocumentQueue,
  createDocumentWorker,
  type DocumentQueueJob,
} from './queue';
import {
  PermanentProcessingError,
  type ClaimedComparisonJob,
  type ClaimedMergeJob,
  type ClaimedProcessingJob,
  type ClaimedRenditionJob,
  type ComparisonEngineOutput,
  type ComparisonResult,
  type DispatchableComparison,
  type DispatchableJob,
  type DispatchableMerge,
  type DispatchableRendition,
  type InspectionResult,
  type MergeResult,
  type RenditionResult,
} from './types';
import { createComparisonVisualization } from './visualization';

interface StoreLike {
  claim(
    jobId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedProcessingJob | null>;
  complete(input: {
    job: ClaimedProcessingJob;
    leaseOwner: string;
    result: InspectionResult;
    snapshotObjectKey: string;
    snapshotSha256: string;
  }): Promise<void>;
  heartbeat(
    jobId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean>;
  listDispatchable(limit?: number): Promise<DispatchableJob[]>;
  markDispatched(job: DispatchableJob): Promise<void>;
  recordFailure(input: {
    error: string;
    failureCode: string;
    job: ClaimedProcessingJob;
    leaseOwner: string;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean>;
}

interface StorageLike {
  putSnapshot(input: {
    body: Uint8Array;
    key: string;
    snapshotSha256: string;
    stableHash: string;
  }): Promise<void>;
  readArtifact(input: {
    byteSize: number;
    objectKey: string;
    sha256: string;
  }): Promise<Uint8Array>;
}

interface EngineLike {
  inspect(
    job: ClaimedProcessingJob,
    artifact: Uint8Array,
  ): Promise<InspectionResult>;
}

interface ComparisonStoreLike {
  claimComparison(
    comparisonId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedComparisonJob | null>;
  completeComparison(input: {
    comparison: ClaimedComparisonJob;
    leaseOwner: string;
    result: ComparisonResult;
    resultObjectKey: string;
    resultSha256: string;
    visualization: {
      approximateChanges: number;
      artifactSha256: string;
      engineVersion: string;
      exactChanges: number;
      mappedChanges: number;
      objectKey: string;
      rendererProfile: string;
      schemaVersion: string;
      totalChanges: number;
      unavailableChanges: number;
    };
  }): Promise<void>;
  heartbeatComparison(
    comparisonId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean>;
  listDispatchableComparisons(
    limit?: number,
  ): Promise<DispatchableComparison[]>;
  markComparisonDispatched(comparison: DispatchableComparison): Promise<void>;
  recordComparisonFailure(input: {
    comparison: ClaimedComparisonJob;
    error: string;
    failureCode: string;
    leaseOwner: string;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean>;
}

interface ComparisonStorageLike {
  putComparison(input: {
    body: Uint8Array;
    key: string;
    resultSha256: string;
    stableHash: string;
  }): Promise<void>;
  putVisualization(input: {
    body: Uint8Array;
    key: string;
    sha256: string;
  }): Promise<void>;
  readArtifact(input: {
    byteSize: number;
    objectKey: string;
    sha256: string;
  }): Promise<Uint8Array>;
}

interface ComparisonEngineLike {
  compare(
    job: ClaimedComparisonJob,
    baseArtifact: Uint8Array,
    targetArtifact: Uint8Array,
  ): Promise<ComparisonEngineOutput>;
}

interface RenditionStoreLike {
  claimRendition(
    jobId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedRenditionJob | null>;
  completeRendition(input: {
    job: ClaimedRenditionJob;
    leaseOwner: string;
    objectKey: string;
    result: RenditionResult;
  }): Promise<void>;
  heartbeatRendition(
    jobId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean>;
  listDispatchableRenditions(limit?: number): Promise<DispatchableRendition[]>;
  markRenditionDispatched(rendition: DispatchableRendition): Promise<void>;
  recordRenditionFailure(input: {
    error: string;
    failureCode: string;
    job: ClaimedRenditionJob;
    leaseOwner: string;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean>;
}

interface RenditionStorageLike {
  putRendition(input: {
    body: Uint8Array;
    key: string;
    renditionSha256: string;
    rendererProfile: string;
    rendererVersion: string;
  }): Promise<void>;
  readArtifact(input: {
    byteSize: number;
    objectKey: string;
    sha256: string;
  }): Promise<Uint8Array>;
}

interface RenditionEngineLike {
  render(
    job: ClaimedRenditionJob,
    artifact: Uint8Array,
  ): Promise<RenditionResult>;
}

interface MergeStoreLike {
  claimMerge(
    mergeId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<ClaimedMergeJob | null>;
  completeMerge(input: {
    candidateObjectKey: string | null;
    leaseOwner: string;
    merge: ClaimedMergeJob;
    result: MergeResult;
  }): Promise<void>;
  heartbeatMerge(
    mergeId: string,
    leaseOwner: string,
    leaseMilliseconds: number,
  ): Promise<boolean>;
  listDispatchableMerges(limit?: number): Promise<DispatchableMerge[]>;
  markMergeDispatched(merge: DispatchableMerge): Promise<void>;
  recordMergeFailure(input: {
    error: string;
    failureCode: string;
    leaseOwner: string;
    merge: ClaimedMergeJob;
    retryable: boolean;
    retryAt: Date;
  }): Promise<boolean>;
}

interface MergeStorageLike {
  putMergeCandidate(input: {
    body: Uint8Array;
    key: string;
    sha256: string;
    stableHash: string;
  }): Promise<void>;
  readArtifact(input: {
    byteSize: number;
    objectKey: string;
    sha256: string;
  }): Promise<Uint8Array>;
}

interface MergeEngineLike {
  merge(
    job: ClaimedMergeJob,
    baseArtifact: Uint8Array,
    oursArtifact: Uint8Array,
    theirsArtifact: Uint8Array,
    powerPointAutomaticMergeEnabled?: boolean,
    excelAutomaticMergeEnabled?: boolean,
  ): Promise<MergeResult>;
}

export class DocumentProcessor {
  private readonly leaseOwner = `${hostname()}:${process.pid}:${randomUUID()}`;

  public constructor(
    private readonly store: StoreLike,
    private readonly storage: StorageLike,
    private readonly engine: EngineLike,
    private readonly leaseMilliseconds: number,
    private readonly heartbeatMilliseconds: number,
  ) {}

  public async process(jobId: string): Promise<void> {
    const job = await this.store.claim(
      jobId,
      this.leaseOwner,
      this.leaseMilliseconds,
    );
    if (!job) return;
    const heartbeat = setInterval(() => {
      void this.store
        .heartbeat(job.id, this.leaseOwner, this.leaseMilliseconds)
        .catch(() => false);
    }, this.heartbeatMilliseconds);
    heartbeat.unref();
    try {
      const artifact = await this.storage.readArtifact({
        byteSize: job.artifactByteSize,
        objectKey: job.artifactObjectKey,
        sha256: job.artifactSha256,
      });
      const result = await this.engine.inspect(job, artifact);
      const snapshotBytes = new TextEncoder().encode(
        JSON.stringify(result.snapshot),
      );
      const snapshotSha256 = createHash('sha256')
        .update(snapshotBytes)
        .digest('hex');
      const snapshotObjectKey = [
        'organizations',
        job.organizationId,
        'snapshots',
        job.versionId,
        `schema-${result.snapshot.schema_version}-parser-${result.snapshot.parser_version}.json`,
      ].join('/');
      await this.storage.putSnapshot({
        body: snapshotBytes,
        key: snapshotObjectKey,
        snapshotSha256,
        stableHash: result.snapshot.stable_hash,
      });
      await this.store.complete({
        job,
        leaseOwner: this.leaseOwner,
        result,
        snapshotObjectKey,
        snapshotSha256,
      });
    } catch (error) {
      const permanent = error instanceof PermanentProcessingError;
      const retryDelay = Math.min(60_000, 1_000 * 2 ** (job.attempts - 1));
      const retry = await this.store.recordFailure({
        error: errorMessage(error),
        failureCode: permanent
          ? error.code
          : 'processing_dependency_unavailable',
        job,
        leaseOwner: this.leaseOwner,
        retryable: !permanent,
        retryAt: new Date(Date.now() + retryDelay),
      });
      if (retry) throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export class ComparisonProcessor {
  private readonly leaseOwner = `${hostname()}:${process.pid}:${randomUUID()}`;

  public constructor(
    private readonly store: ComparisonStoreLike,
    private readonly storage: ComparisonStorageLike,
    private readonly engine: ComparisonEngineLike,
    private readonly leaseMilliseconds: number,
    private readonly heartbeatMilliseconds: number,
    private readonly rendererProfile = 'office-pdf-v1',
    private readonly metrics = new WorkerMetrics(),
  ) {}

  public async process(comparisonId: string): Promise<void> {
    const comparison = await this.store.claimComparison(
      comparisonId,
      this.leaseOwner,
      this.leaseMilliseconds,
    );
    if (!comparison) return;
    const heartbeat = setInterval(() => {
      void this.store
        .heartbeatComparison(
          comparison.id,
          this.leaseOwner,
          this.leaseMilliseconds,
        )
        .catch(() => false);
    }, this.heartbeatMilliseconds);
    heartbeat.unref();
    try {
      const [baseArtifact, targetArtifact] = await Promise.all([
        this.storage.readArtifact({
          byteSize: comparison.baseArtifact.byteSize,
          objectKey: comparison.baseArtifact.objectKey,
          sha256: comparison.baseArtifact.sha256,
        }),
        this.storage.readArtifact({
          byteSize: comparison.targetArtifact.byteSize,
          objectKey: comparison.targetArtifact.objectKey,
          sha256: comparison.targetArtifact.sha256,
        }),
      ]);
      const output = await this.engine.compare(
        comparison,
        baseArtifact,
        targetArtifact,
      );
      const result = output.result;
      const resultBytes = new TextEncoder().encode(JSON.stringify(result));
      const resultSha256 = createHash('sha256')
        .update(resultBytes)
        .digest('hex');
      const resultObjectKey = [
        'organizations',
        comparison.organizationId,
        'comparisons',
        comparison.id,
        `schema-${result.comparison_schema_version}-parser-${result.parser_version}.json`,
      ].join('/');
      const visualization = createComparisonVisualization({
        baseSnapshot: output.baseSnapshot,
        comparisonId: comparison.id,
        fileType: comparison.fileType,
        rendererProfile: this.rendererProfile,
        result,
        targetSnapshot: output.targetSnapshot,
      });
      const visualizationBytes = new TextEncoder().encode(
        JSON.stringify(visualization),
      );
      const visualizationSha256 = createHash('sha256')
        .update(visualizationBytes)
        .digest('hex');
      const visualizationObjectKey = [
        'organizations',
        comparison.organizationId,
        'comparison-visualizations',
        comparison.id,
        `schema-${visualization.schemaVersion}-engine-${visualization.engineVersion}.json`,
      ].join('/');
      this.metrics.recordMapping(
        visualization.coverage.total,
        visualization.coverage.mapped,
      );
      await Promise.all([
        this.storage.putComparison({
          body: resultBytes,
          key: resultObjectKey,
          resultSha256,
          stableHash: result.stable_hash,
        }),
        this.storage.putVisualization({
          body: visualizationBytes,
          key: visualizationObjectKey,
          sha256: visualizationSha256,
        }),
      ]);
      await this.store.completeComparison({
        comparison,
        leaseOwner: this.leaseOwner,
        result,
        resultObjectKey,
        resultSha256,
        visualization: {
          approximateChanges: visualization.coverage.approximate,
          artifactSha256: visualizationSha256,
          engineVersion: visualization.engineVersion,
          exactChanges: visualization.coverage.exact,
          mappedChanges: visualization.coverage.mapped,
          objectKey: visualizationObjectKey,
          rendererProfile: visualization.rendererProfile,
          schemaVersion: visualization.schemaVersion,
          totalChanges: visualization.coverage.total,
          unavailableChanges: visualization.coverage.unavailable,
        },
      });
    } catch (error) {
      const permanent = error instanceof PermanentProcessingError;
      const retryDelay = Math.min(
        60_000,
        1_000 * 2 ** (comparison.attempts - 1),
      );
      const retry = await this.store.recordComparisonFailure({
        comparison,
        error: errorMessage(error),
        failureCode: permanent
          ? error.code
          : 'comparison_dependency_unavailable',
        leaseOwner: this.leaseOwner,
        retryable: !permanent,
        retryAt: new Date(Date.now() + retryDelay),
      });
      if (retry) throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export class RenditionProcessor {
  private readonly leaseOwner = `${hostname()}:${process.pid}:${randomUUID()}`;

  public constructor(
    private readonly store: RenditionStoreLike,
    private readonly storage: RenditionStorageLike,
    private readonly engine: RenditionEngineLike,
    private readonly leaseMilliseconds: number,
    private readonly heartbeatMilliseconds: number,
    private readonly metrics = new WorkerMetrics(),
  ) {}

  public async process(jobId: string): Promise<void> {
    const job = await this.store.claimRendition(
      jobId,
      this.leaseOwner,
      this.leaseMilliseconds,
    );
    if (!job) return;
    const startedAt = performance.now();
    const heartbeat = setInterval(() => {
      void this.store
        .heartbeatRendition(job.id, this.leaseOwner, this.leaseMilliseconds)
        .catch(() => false);
    }, this.heartbeatMilliseconds);
    heartbeat.unref();
    try {
      const artifact = await this.storage.readArtifact({
        byteSize: job.artifactByteSize,
        objectKey: job.artifactObjectKey,
        sha256: job.artifactSha256,
      });
      const result = await this.engine.render(job, artifact);
      const objectKey = [
        'organizations',
        job.organizationId,
        'renditions',
        'cache',
        job.rendererProfile,
        `${job.artifactSha256}-${job.rendererVersion}-${job.fontPackVersion}.pdf`,
      ].join('/');
      await this.storage.putRendition({
        body: result.pdf,
        key: objectKey,
        renditionSha256: result.outputSha256,
        rendererProfile: result.rendererProfile,
        rendererVersion: result.rendererVersion,
      });
      await this.store.completeRendition({
        job,
        leaseOwner: this.leaseOwner,
        objectKey,
        result,
      });
      this.metrics.recordRenditionSuccess(
        (performance.now() - startedAt) / 1000,
        result.byteCount,
      );
    } catch (error) {
      this.metrics.recordRenditionFailure();
      const permanent = error instanceof PermanentProcessingError;
      const retryDelay = Math.min(60_000, 1_000 * 2 ** (job.attempts - 1));
      const retry = await this.store.recordRenditionFailure({
        error: errorMessage(error),
        failureCode: permanent
          ? error.code
          : 'rendition_dependency_unavailable',
        job,
        leaseOwner: this.leaseOwner,
        retryable: !permanent,
        retryAt: new Date(Date.now() + retryDelay),
      });
      if (retry) throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export class MergeProcessor {
  private readonly leaseOwner = `${hostname()}:${process.pid}:${randomUUID()}`;

  public constructor(
    private readonly store: MergeStoreLike,
    private readonly storage: MergeStorageLike,
    private readonly engine: MergeEngineLike,
    private readonly leaseMilliseconds: number,
    private readonly heartbeatMilliseconds: number,
    private readonly powerPointAutomaticMergeEnabled = false,
    private readonly powerPointAutomaticMergePilotOrganizationIds: string[] = [],
    private readonly excelAutomaticMergeEnabled = false,
    private readonly excelAutomaticMergePilotOrganizationIds: string[] = [],
  ) {}

  public async process(mergeId: string): Promise<void> {
    const merge = await this.store.claimMerge(
      mergeId,
      this.leaseOwner,
      this.leaseMilliseconds,
    );
    if (!merge) return;
    const heartbeat = setInterval(() => {
      void this.store
        .heartbeatMerge(merge.id, this.leaseOwner, this.leaseMilliseconds)
        .catch(() => false);
    }, this.heartbeatMilliseconds);
    heartbeat.unref();
    try {
      const [baseArtifact, oursArtifact, theirsArtifact] = await Promise.all([
        this.storage.readArtifact(merge.baseArtifact),
        this.storage.readArtifact(merge.oursArtifact),
        this.storage.readArtifact(merge.theirsArtifact),
      ]);
      const result = await this.engine.merge(
        merge,
        baseArtifact,
        oursArtifact,
        theirsArtifact,
        this.powerPointAutomaticMergeEnabled &&
          this.powerPointAutomaticMergePilotOrganizationIds.includes(
            merge.organizationId,
          ),
        this.excelAutomaticMergeEnabled &&
          this.excelAutomaticMergePilotOrganizationIds.includes(
            merge.organizationId,
          ),
      );
      let candidateObjectKey: string | null = null;
      if (result.candidate_bytes && result.candidate_sha256) {
        candidateObjectKey = [
          'organizations',
          merge.organizationId,
          'merge-candidates',
          merge.id,
          `${result.candidate_sha256}${merge.oursArtifact.extension}`,
        ].join('/');
        await this.storage.putMergeCandidate({
          body: result.candidate_bytes,
          key: candidateObjectKey,
          sha256: result.candidate_sha256,
          stableHash: result.stable_hash,
        });
      }
      await this.store.completeMerge({
        candidateObjectKey,
        leaseOwner: this.leaseOwner,
        merge,
        result,
      });
    } catch (error) {
      const permanent = error instanceof PermanentProcessingError;
      const retryDelay = Math.min(60_000, 1_000 * 2 ** (merge.attempts - 1));
      const retry = await this.store.recordMergeFailure({
        error: errorMessage(error),
        failureCode: permanent ? error.code : 'merge_dependency_unavailable',
        leaseOwner: this.leaseOwner,
        merge,
        retryable: !permanent,
        retryAt: new Date(Date.now() + retryDelay),
      });
      if (retry) throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

export class DocumentPipeline {
  private readonly comparisonProcessor: ComparisonProcessor;
  private readonly mergeProcessor: MergeProcessor;
  private readonly processor: DocumentProcessor;
  private readonly renditionProcessor: RenditionProcessor;
  private readonly queue: Queue<DocumentQueueJob>;
  private readonly worker: Worker<DocumentQueueJob>;
  private dispatchTimer: NodeJS.Timeout | null = null;
  private dispatching = false;

  public constructor(
    private readonly config: WorkerConfig,
    private readonly store: ProcessingStore,
    storage: ArtifactStorage,
    engine: DocumentEngineClient,
    renditionEngine: RenditionEngineClient,
    private readonly metrics = new WorkerMetrics(),
  ) {
    this.processor = new DocumentProcessor(
      store,
      storage,
      engine,
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
    );
    this.comparisonProcessor = new ComparisonProcessor(
      store,
      storage,
      engine,
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
      config.renditionRendererProfile,
      metrics,
    );
    this.mergeProcessor = new MergeProcessor(
      store,
      storage,
      engine,
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
      config.powerPointAutomaticMergeEnabled,
      config.powerPointAutomaticMergePilotOrganizationIds,
      config.excelAutomaticMergeEnabled,
      config.excelAutomaticMergePilotOrganizationIds,
    );
    this.renditionProcessor = new RenditionProcessor(
      store,
      storage,
      renditionEngine,
      config.leaseMilliseconds,
      config.heartbeatMilliseconds,
      metrics,
    );
    this.queue = createDocumentQueue(config.redisUrl);
    this.worker = createDocumentWorker(
      config.redisUrl,
      config.concurrency,
      (job) => {
        if ('processingJobId' in job) {
          return this.processor.process(job.processingJobId);
        }
        if (job.kind === 'comparison') {
          return this.comparisonProcessor.process(job.jobId);
        }
        if (job.kind === 'rendition') {
          return this.renditionProcessor.process(job.jobId);
        }
        return job.kind === 'merge'
          ? this.mergeProcessor.process(job.jobId)
          : this.processor.process(job.jobId);
      },
    );
    this.worker.on('error', (error) => {
      process.stderr.write(`Document worker error: ${error.message}\n`);
    });
  }

  public async start(): Promise<void> {
    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);
    await this.dispatch();
    this.dispatchTimer = setInterval(() => {
      void this.dispatch().catch((error: unknown) => {
        process.stderr.write(
          `Document dispatch error: ${errorMessage(error)}\n`,
        );
      });
    }, this.config.dispatchIntervalMilliseconds);
    this.dispatchTimer.unref();
  }

  public async dispatch(): Promise<void> {
    if (this.dispatching) return;
    this.dispatching = true;
    try {
      for (const job of await this.store.listDispatchable()) {
        const existing = await this.queue.getJob(job.id);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          'semantic-ingestion',
          { jobId: job.id, kind: 'inspection' },
          {
            attempts: job.maxAttempts,
            backoff: { delay: 1_000, type: 'exponential' },
            jobId: job.id,
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        await this.store.markDispatched(job);
      }
      for (const comparison of await this.store.listDispatchableComparisons()) {
        const queueJobId = `comparison-${comparison.id}`;
        const existing = await this.queue.getJob(queueJobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          'semantic-comparison',
          { jobId: comparison.id, kind: 'comparison' },
          {
            attempts: comparison.maxAttempts,
            backoff: { delay: 1_000, type: 'exponential' },
            jobId: queueJobId,
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        await this.store.markComparisonDispatched(comparison);
      }
      for (const merge of await this.store.listDispatchableMerges()) {
        const queueJobId = `merge-${merge.id}`;
        const existing = await this.queue.getJob(queueJobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          'conservative-merge',
          { jobId: merge.id, kind: 'merge' },
          {
            attempts: merge.maxAttempts,
            backoff: { delay: 1_000, type: 'exponential' },
            jobId: queueJobId,
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        await this.store.markMergeDispatched(merge);
      }
      for (const rendition of await this.store.listDispatchableRenditions()) {
        this.metrics.recordRenditionQueueAge(rendition.queueAgeSeconds);
        const queueJobId = `rendition-${rendition.renditionId}`;
        const existing = await this.queue.getJob(queueJobId);
        if (existing) {
          const state = await existing.getState();
          if (state === 'completed' || state === 'failed') {
            await existing.remove();
          }
        }
        await this.queue.add(
          'office-rendition',
          { jobId: rendition.id, kind: 'rendition' },
          {
            attempts: rendition.maxAttempts,
            backoff: { delay: 1_000, type: 'exponential' },
            jobId: queueJobId,
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        await this.store.markRenditionDispatched(rendition);
      }
    } finally {
      this.dispatching = false;
    }
  }

  public async close(): Promise<void> {
    if (this.dispatchTimer) clearInterval(this.dispatchTimer);
    await Promise.all([this.worker.close(), this.queue.close()]);
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}
