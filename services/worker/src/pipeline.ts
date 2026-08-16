import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import type { Queue, Worker } from 'bullmq';

import type { ArtifactStorage } from './artifact-storage';
import type { WorkerConfig } from './config';
import type { DocumentEngineClient } from './document-engine-client';
import type { ProcessingStore } from './processing-store';
import {
  createDocumentQueue,
  createDocumentWorker,
  type DocumentQueueJob,
} from './queue';
import {
  PermanentProcessingError,
  type ClaimedComparisonJob,
  type ClaimedProcessingJob,
  type ComparisonResult,
  type DispatchableComparison,
  type DispatchableJob,
  type InspectionResult,
} from './types';

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
  ): Promise<ComparisonResult>;
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
      const result = await this.engine.compare(
        comparison,
        baseArtifact,
        targetArtifact,
      );
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
      await this.storage.putComparison({
        body: resultBytes,
        key: resultObjectKey,
        resultSha256,
        stableHash: result.stable_hash,
      });
      await this.store.completeComparison({
        comparison,
        leaseOwner: this.leaseOwner,
        result,
        resultObjectKey,
        resultSha256,
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

export class DocumentPipeline {
  private readonly comparisonProcessor: ComparisonProcessor;
  private readonly processor: DocumentProcessor;
  private readonly queue: Queue<DocumentQueueJob>;
  private readonly worker: Worker<DocumentQueueJob>;
  private dispatchTimer: NodeJS.Timeout | null = null;
  private dispatching = false;

  public constructor(
    private readonly config: WorkerConfig,
    private readonly store: ProcessingStore,
    storage: ArtifactStorage,
    engine: DocumentEngineClient,
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
    );
    this.queue = createDocumentQueue(config.redisUrl);
    this.worker = createDocumentWorker(
      config.redisUrl,
      config.concurrency,
      (job) => {
        if ('processingJobId' in job) {
          return this.processor.process(job.processingJobId);
        }
        return job.kind === 'comparison'
          ? this.comparisonProcessor.process(job.jobId)
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
