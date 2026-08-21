import { createHash, randomUUID } from 'node:crypto';

import type { BlobStore, CompletedMultipartPart } from '../storage/blob-store';
import type { BlobStorageConfig, RenditionRequestConfig } from '../config';
import type { PageInput } from '../projects/store';
import { VersionMetrics } from './metrics';
import { VersionOperationError, type VersionStore } from './store';
import type {
  DocumentVersionSummary,
  DocumentMerge,
  FinalizeVersionResult,
  UploadIntent,
  VersionActor,
  VersionComparison,
  VersionPage,
  VersionRendition,
  VersionSource,
  VersionVisualData,
  ComparisonVisualization,
} from './types';
import {
  detectOfficeMediaType,
  UploadValidationError,
  validateUploadMetadata,
} from './validation';

function requestHash(value: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function secondsUntil(date: Date, maximum: number): number {
  return Math.max(
    1,
    Math.min(maximum, Math.floor((date.getTime() - Date.now()) / 1000)),
  );
}

export const COMPARISON_SCHEMA_VERSION = '1.0.0';
export const COMPARISON_ENGINE_VERSION = '1.0.0';
export const DOCUMENT_PARSER_VERSION = '1.2.0';
export const MERGE_ENGINE_VERSION = '1.2.0';
export const MERGE_SCHEMA_VERSION = '1.2.0';
export const DEFAULT_RENDITION_CONFIG: RenditionRequestConfig = {
  enabled: true,
  enabledFileTypes: ['presentation', 'spreadsheet', 'word_document'],
  fontPackVersion: 'mergecom-liberation-noto-v1',
  pilotOrganizationIds: [],
  rendererProfile: 'office-pdf-v1',
  rendererVersion: 'libreoffice-local',
};

const MAX_VISUAL_JSON_BYTES = 25 * 1024 * 1024;

export class VersionService {
  public constructor(
    private readonly store: VersionStore,
    private readonly blobs: BlobStore,
    private readonly config: BlobStorageConfig,
    public readonly metrics = new VersionMetrics(),
    private readonly renditionConfig: RenditionRequestConfig = DEFAULT_RENDITION_CONFIG,
  ) {}

  private async blobOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.metrics.recordObjectStoreError();
      throw error;
    }
  }

  private async inspectUpload(input: {
    expectedByteSize: number;
    expectedSha256: string;
    extension: string;
    key: string;
  }): Promise<{ byteSize: number; mediaType: string; sha256: string }> {
    const head = await this.blobOperation(() =>
      this.blobs.headObject(input.key),
    );
    if (!head) throw new UploadValidationError('invalid_size');
    if (head.byteSize !== input.expectedByteSize) {
      throw new UploadValidationError('invalid_size');
    }
    const digest = createHash('sha256');
    const prefix: number[] = [];
    let byteSize = 0;
    const body = await this.blobOperation(() =>
      this.blobs.getObject(input.key),
    );
    for await (const chunk of body) {
      byteSize += chunk.byteLength;
      digest.update(chunk);
      for (const byte of chunk) {
        if (prefix.length >= 8) break;
        prefix.push(byte);
      }
      if (byteSize > input.expectedByteSize) {
        throw new UploadValidationError('invalid_size');
      }
    }
    const sha256 = digest.digest('hex');
    if (byteSize !== input.expectedByteSize) {
      throw new UploadValidationError('invalid_size');
    }
    if (sha256 !== input.expectedSha256) {
      throw new UploadValidationError('invalid_hash');
    }
    return {
      byteSize,
      mediaType: detectOfficeMediaType(
        Uint8Array.from(prefix),
        input.extension,
      ),
      sha256,
    };
  }

  private async readVerifiedJson(
    objectKey: string,
    expectedSha256: string,
    unavailableCode: 'comparison_unavailable' | 'rendition_unavailable',
  ): Promise<unknown> {
    const chunks: Buffer[] = [];
    const digest = createHash('sha256');
    let byteCount = 0;
    const body = await this.blobOperation(() =>
      this.blobs.getObject(objectKey),
    );
    for await (const chunk of body) {
      byteCount += chunk.byteLength;
      if (byteCount > MAX_VISUAL_JSON_BYTES) {
        throw new VersionOperationError(unavailableCode);
      }
      digest.update(chunk);
      chunks.push(Buffer.from(chunk));
    }
    if (digest.digest('hex') !== expectedSha256) {
      throw new VersionOperationError(unavailableCode);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } catch {
      throw new VersionOperationError(unavailableCode);
    }
  }

  public async createUploadIntent(input: {
    actor: VersionActor;
    baseVersionId: string | null;
    byteSize: number;
    clientMediaType: string | null;
    documentId: string;
    filename: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    sha256: string;
  }): Promise<UploadIntent & { replayed: boolean }> {
    const access = await this.store.getDocumentAccess({
      actor: input.actor,
      documentId: input.documentId,
      projectId: input.projectId,
      write: true,
    });
    const validated = validateUploadMetadata({
      byteSize: input.byteSize,
      documentKind: access.documentKind,
      filename: input.filename,
      maxUploadBytes: this.config.maxUploadBytes,
      sha256: input.sha256,
    });
    const uploadId = randomUUID();
    const stagingObjectKey = `organizations/${input.actor.organizationId}/staging/${uploadId}`;
    const mode =
      input.byteSize >= this.config.multipartThresholdBytes
        ? ('multipart' as const)
        : ('single' as const);
    let multipartUploadId: string | null = null;
    if (mode === 'multipart') {
      multipartUploadId = await this.blobOperation(() =>
        this.blobs.createMultipartUpload(stagingObjectKey, validated.mediaType),
      );
    }
    const expiresAt = new Date(
      Date.now() + this.config.signedUrlSeconds * 2 * 1000,
    );
    let created;
    try {
      created = await this.store.createUpload({
        actor: input.actor,
        baseVersionId: input.baseVersionId,
        clientMediaType: input.clientMediaType,
        documentId: input.documentId,
        expectedByteSize: input.byteSize,
        expectedSha256: input.sha256,
        expiresAt,
        extension: validated.extension,
        idempotencyKey: input.idempotencyKey,
        mode,
        multipartUploadId,
        originalFilename: input.filename,
        partSize: mode === 'multipart' ? this.config.multipartPartBytes : null,
        projectId: input.projectId,
        requestHash: requestHash({
          baseVersionId: input.baseVersionId,
          byteSize: input.byteSize,
          clientMediaType: input.clientMediaType,
          filename: input.filename,
          sha256: input.sha256,
        }),
        requestId: input.requestId,
        stagingObjectKey,
        uploadId,
      });
    } catch (error) {
      if (multipartUploadId) {
        try {
          await this.blobOperation(() =>
            this.blobs.abortMultipartUpload(
              stagingObjectKey,
              multipartUploadId,
            ),
          );
        } catch {
          // Cleanup will detect the unreferenced multipart staging operation.
        }
      }
      throw error;
    }

    if (created.replayed && multipartUploadId) {
      await this.blobOperation(() =>
        this.blobs.abortMultipartUpload(stagingObjectKey, multipartUploadId),
      );
    }
    const record = created.record;
    if (record.status !== 'pending' || record.expiresAt <= new Date()) {
      return {
        branch: created.branch,
        expiresAt: record.expiresAt,
        grant: null,
        id: record.id,
        mode: record.mode,
        multipart:
          record.mode === 'multipart' && record.partSize
            ? {
                partCount: Math.ceil(record.expectedByteSize / record.partSize),
                partSize: record.partSize,
              }
            : null,
        replayed: created.replayed,
      };
    }
    const grant =
      record.mode === 'single'
        ? await this.blobOperation(() =>
            this.blobs.signUpload(
              record.stagingObjectKey,
              validated.mediaType,
              secondsUntil(record.expiresAt, this.config.signedUrlSeconds),
            ),
          )
        : null;
    return {
      branch: created.branch,
      expiresAt: record.expiresAt,
      grant,
      id: record.id,
      mode: record.mode,
      multipart:
        record.mode === 'multipart' && record.partSize
          ? {
              partCount: Math.ceil(record.expectedByteSize / record.partSize),
              partSize: record.partSize,
            }
          : null,
      replayed: created.replayed,
    };
  }

  public async signMultipartPart(input: {
    actor: VersionActor;
    documentId: string;
    partNumber: number;
    projectId: string;
    uploadId: string;
  }) {
    const upload = await this.store.getUpload({
      actor: input.actor,
      documentId: input.documentId,
      projectId: input.projectId,
      uploadId: input.uploadId,
      write: true,
    });
    if (upload.status !== 'pending') {
      throw new VersionOperationError('invalid_state');
    }
    if (upload.expiresAt <= new Date()) {
      throw new VersionOperationError('upload_expired');
    }
    if (!upload.multipartUploadId || !upload.partSize) {
      throw new VersionOperationError('invalid_state');
    }
    const partCount = Math.ceil(upload.expectedByteSize / upload.partSize);
    if (input.partNumber < 1 || input.partNumber > partCount) {
      throw new VersionOperationError('invalid_state');
    }
    return this.blobOperation(() =>
      this.blobs.signMultipartPart(
        upload.stagingObjectKey,
        upload.multipartUploadId!,
        input.partNumber,
        secondsUntil(upload.expiresAt, this.config.signedUrlSeconds),
      ),
    );
  }

  public async completeMultipart(input: {
    actor: VersionActor;
    documentId: string;
    parts: CompletedMultipartPart[];
    projectId: string;
    uploadId: string;
  }): Promise<void> {
    const upload = await this.store.getUpload({
      actor: input.actor,
      documentId: input.documentId,
      projectId: input.projectId,
      uploadId: input.uploadId,
      write: true,
    });
    if (
      upload.status !== 'pending' ||
      !upload.multipartUploadId ||
      !upload.partSize
    ) {
      throw new VersionOperationError('invalid_state');
    }
    if (upload.expiresAt <= new Date()) {
      throw new VersionOperationError('upload_expired');
    }
    const partCount = Math.ceil(upload.expectedByteSize / upload.partSize);
    if (
      input.parts.length !== partCount ||
      input.parts.some((part, index) => part.partNumber !== index + 1)
    ) {
      throw new VersionOperationError('invalid_state');
    }
    await this.blobOperation(() =>
      this.blobs.completeMultipartUpload(
        upload.stagingObjectKey,
        upload.multipartUploadId!,
        input.parts,
      ),
    );
  }

  public async cancelUpload(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    requestId: string;
    uploadId: string;
  }): Promise<void> {
    const upload = await this.store.cancelUpload(input);
    try {
      if (upload.mode === 'multipart' && upload.multipartUploadId) {
        await this.blobOperation(() =>
          this.blobs.abortMultipartUpload(
            upload.stagingObjectKey,
            upload.multipartUploadId!,
          ),
        );
      } else {
        await this.blobOperation(() =>
          this.blobs.deleteObject(upload.stagingObjectKey),
        );
      }
    } catch {
      // The row is terminal; reference-checked cleanup retries object deletion.
    }
  }

  public async finalizeUpload(input: {
    actor: VersionActor;
    documentId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestId: string;
    source: Extract<VersionSource, 'office_addin' | 'web_upload'>;
    uploadId: string;
  }): Promise<FinalizeVersionResult> {
    const upload = await this.store.getUpload({
      actor: input.actor,
      documentId: input.documentId,
      projectId: input.projectId,
      uploadId: input.uploadId,
      write: true,
    });
    const finalizeHash = requestHash({
      note: input.note,
      source: input.source,
    });
    if (upload.status === 'finalized' && upload.finalizedVersionId) {
      const existing = await this.store.getVersion({
        actor: input.actor,
        documentId: input.documentId,
        projectId: input.projectId,
        versionId: upload.finalizedVersionId,
      });
      return this.store.finalizeUpload({
        actor: input.actor,
        artifact: {
          ...existing.version.artifact,
          objectKey: existing.objectKey,
        },
        documentId: input.documentId,
        idempotencyKey: input.idempotencyKey,
        note: input.note,
        projectId: input.projectId,
        requestHash: finalizeHash,
        requestId: input.requestId,
        source: input.source,
        uploadId: input.uploadId,
      });
    }
    if (upload.status !== 'pending') {
      throw new VersionOperationError('invalid_state');
    }
    if (upload.expiresAt <= new Date()) {
      throw new VersionOperationError('upload_expired');
    }

    let inspected;
    try {
      inspected = await this.inspectUpload({
        expectedByteSize: upload.expectedByteSize,
        expectedSha256: upload.expectedSha256,
        extension: upload.extension,
        key: upload.stagingObjectKey,
      });
    } catch (error) {
      this.metrics.recordFinalizationFailure();
      const failureCode =
        error instanceof UploadValidationError
          ? error.code
          : 'object_store_error';
      await this.store.failUpload(upload.id, failureCode);
      throw error;
    }

    const artifactKey = `organizations/${input.actor.organizationId}/artifacts/${randomUUID()}`;
    const copied = await this.blobOperation(() =>
      this.blobs.copyObject({
        contentType: inspected.mediaType,
        destinationKey: artifactKey,
        metadata: { sha256: inspected.sha256, uploadid: upload.id },
        sourceKey: upload.stagingObjectKey,
      }),
    );
    if (copied.byteSize !== inspected.byteSize) {
      this.metrics.recordFinalizationFailure();
      await this.store.failUpload(upload.id, 'copy_size_mismatch');
      throw new UploadValidationError('invalid_size');
    }

    const result = await this.store.finalizeUpload({
      actor: input.actor,
      artifact: {
        byteSize: inspected.byteSize,
        detectedMediaType: inspected.mediaType,
        extension: upload.extension,
        objectKey: artifactKey,
        originalFilename: upload.originalFilename,
        sha256: inspected.sha256,
        storageChecksum: copied.checksum,
        storageVersion: copied.storageVersion,
      },
      documentId: input.documentId,
      idempotencyKey: input.idempotencyKey,
      note: input.note,
      projectId: input.projectId,
      requestHash: finalizeHash,
      requestId: input.requestId,
      source: input.source,
      uploadId: input.uploadId,
    });
    if (result.replayed) {
      await this.blobOperation(() => this.blobs.deleteObject(artifactKey));
    } else {
      this.metrics.recordFinalizationSuccess(
        inspected.byteSize,
        Math.max(0, (Date.now() - upload.createdAt.getTime()) / 1000),
      );
      if (result.outcome === 'conflict') this.metrics.recordConflict();
    }
    try {
      await this.blobOperation(() =>
        this.blobs.deleteObject(upload.stagingObjectKey),
      );
    } catch {
      // Reference-checked cleanup removes finalized staging objects later.
    }
    return result;
  }

  public async listVersions(input: {
    actor: VersionActor;
    documentId: string;
    page: PageInput;
    projectId: string;
  }): Promise<VersionPage> {
    return this.store.listVersions(input);
  }

  public async getVersion(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    versionId: string;
  }): Promise<DocumentVersionSummary> {
    return (await this.store.getVersion(input)).version;
  }

  public async recommendBaseline(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    targetVersionId: string;
    verifiedLocalBaseVersionId: string | null;
  }) {
    return this.store.recommendBaseline(input);
  }

  public async createComparison(input: {
    actor: VersionActor;
    baseVersionId: string;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    targetVersionId: string;
  }): Promise<{ comparison: VersionComparison; replayed: boolean }> {
    const result = await this.store.createComparison({
      ...input,
      comparisonSchemaVersion: COMPARISON_SCHEMA_VERSION,
      engineVersion: COMPARISON_ENGINE_VERSION,
      parserVersion: DOCUMENT_PARSER_VERSION,
      requestHash: requestHash({
        baseVersionId: input.baseVersionId,
        targetVersionId: input.targetVersionId,
      }),
    });
    await Promise.allSettled(
      [input.baseVersionId, input.targetVersionId].map((versionId) =>
        this.createRendition({
          actor: input.actor,
          documentId: input.documentId,
          idempotencyKey: `comparison-${requestHash({
            comparisonId: result.comparison.id,
            versionId,
          })}`,
          projectId: input.projectId,
          requestId: input.requestId,
          versionId,
        }),
      ),
    );
    return result;
  }

  public async getComparison(input: {
    actor: VersionActor;
    comparisonId: string;
    documentId: string;
    projectId: string;
  }): Promise<VersionComparison> {
    return this.store.getComparison(input);
  }

  public async recordViewerLoad(input: {
    actor: VersionActor;
    comparisonId: string;
    documentId: string;
    durationMilliseconds: number;
    outcome: 'failed' | 'loaded';
    projectId: string;
  }): Promise<void> {
    await this.store.getComparison(input);
    this.metrics.recordViewerLoad(
      input.durationMilliseconds / 1_000,
      input.outcome === 'failed',
    );
  }

  public async createRendition(input: {
    actor: VersionActor;
    documentId: string;
    idempotencyKey: string;
    projectId: string;
    requestId: string;
    versionId: string;
  }): Promise<{ rendition: VersionRendition; replayed: boolean }> {
    const access = await this.store.getDocumentAccess({
      actor: input.actor,
      documentId: input.documentId,
      projectId: input.projectId,
      write: false,
    });
    if (
      !this.renditionConfig.enabled ||
      !this.renditionConfig.enabledFileTypes.includes(access.documentKind) ||
      (this.renditionConfig.pilotOrganizationIds.length > 0 &&
        !this.renditionConfig.pilotOrganizationIds.includes(
          input.actor.organizationId.toLowerCase(),
        ))
    ) {
      throw new VersionOperationError('rendition_unavailable');
    }
    const result = await this.store.createRendition({
      ...input,
      ...this.renditionConfig,
      requestHash: requestHash({
        ...this.renditionConfig,
        versionId: input.versionId,
      }),
    });
    this.metrics.recordRenditionRequest(result.cacheHit ?? result.replayed);
    return result;
  }

  public async getRendition(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    versionId: string;
  }): Promise<VersionRendition> {
    return this.store.getRenditionForVersion({
      ...input,
      rendererProfile: this.renditionConfig.rendererProfile,
    });
  }

  public async createRenditionViewGrant(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    renditionId: string;
    requestId: string;
    versionId: string;
  }) {
    const authorized = await this.store.getRendition(input);
    const grant = await this.blobOperation(() =>
      this.blobs.signView(
        authorized.objectKey,
        'application/pdf',
        this.config.signedUrlSeconds,
      ),
    );
    await this.store.appendRenditionViewAudit({
      actor: input.actor,
      renditionId: input.renditionId,
      requestId: input.requestId,
    });
    this.metrics.recordRenditionViewGrant();
    return {
      ...grant,
      byteCount: authorized.rendition.byteCount,
      pageCount: authorized.rendition.pageCount,
      sha256: authorized.rendition.renditionSha256,
    };
  }

  public async getVisualData(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    versionId: string;
  }): Promise<VersionVisualData> {
    const authorized = await this.store.getVisualData(input);
    const snapshot = await this.readVerifiedJson(
      authorized.objectKey,
      authorized.snapshotSha256,
      'rendition_unavailable',
    );
    this.metrics.recordVisualArtifactRead();
    if (
      typeof snapshot !== 'object' ||
      snapshot === null ||
      !('format_payload' in snapshot)
    ) {
      throw new VersionOperationError('rendition_unavailable');
    }
    return {
      ...authorized.visualData,
      payload: (snapshot as { format_payload: unknown }).format_payload,
    };
  }

  public async getVisualization(input: {
    actor: VersionActor;
    comparisonId: string;
    documentId: string;
    projectId: string;
  }): Promise<ComparisonVisualization> {
    const authorized = await this.store.getVisualization(input);
    const artifact = await this.readVerifiedJson(
      authorized.objectKey,
      authorized.artifactSha256,
      'comparison_unavailable',
    );
    this.metrics.recordVisualArtifactRead();
    if (
      typeof artifact !== 'object' ||
      artifact === null ||
      !('comparisonId' in artifact) ||
      (artifact as { comparisonId: unknown }).comparisonId !==
        input.comparisonId ||
      !Array.isArray((artifact as { mappings?: unknown }).mappings)
    ) {
      throw new VersionOperationError('comparison_unavailable');
    }
    return artifact as ComparisonVisualization;
  }

  public async createMerge(input: {
    actor: VersionActor;
    baseVersionId: string;
    documentId: string;
    idempotencyKey: string;
    note: string;
    oursVersionId: string;
    projectId: string;
    requestId: string;
    theirsVersionId: string;
  }): Promise<{ merge: DocumentMerge; replayed: boolean }> {
    return this.store.createMerge({
      ...input,
      engineVersion: MERGE_ENGINE_VERSION,
      mergeSchemaVersion: MERGE_SCHEMA_VERSION,
      parserVersion: DOCUMENT_PARSER_VERSION,
      requestHash: requestHash({
        baseVersionId: input.baseVersionId,
        note: input.note,
        oursVersionId: input.oursVersionId,
        theirsVersionId: input.theirsVersionId,
      }),
    });
  }

  public async getMerge(input: {
    actor: VersionActor;
    documentId: string;
    mergeId: string;
    projectId: string;
  }): Promise<DocumentMerge> {
    return this.store.getMerge(input);
  }

  public async createMergeCandidateDownloadGrant(input: {
    actor: VersionActor;
    documentId: string;
    mergeId: string;
    projectId: string;
    requestId: string;
  }) {
    const candidate = await this.store.getMergeCandidate(input);
    const filename = `merge-candidate-${input.mergeId}${candidate.extension}`;
    const grant = await this.blobOperation(() =>
      this.blobs.signDownload(
        candidate.objectKey,
        filename,
        this.config.signedUrlSeconds,
      ),
    );
    await this.store.appendMergeCandidateDownloadAudit({
      actor: input.actor,
      mergeId: input.mergeId,
      requestId: input.requestId,
    });
    return { ...grant, filename, sha256: candidate.sha256 };
  }

  public async createDownloadGrant(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    requestId: string;
    versionId: string;
  }) {
    const authorized = await this.store.getVersion(input);
    const grant = await this.blobOperation(() =>
      this.blobs.signDownload(
        authorized.objectKey,
        authorized.version.artifact.originalFilename,
        this.config.signedUrlSeconds,
      ),
    );
    await this.store.appendDownloadAudit({
      actor: input.actor,
      requestId: input.requestId,
      versionId: input.versionId,
    });
    return {
      ...grant,
      filename: authorized.version.artifact.originalFilename,
      sha256: authorized.version.artifact.sha256,
    };
  }

  public async restoreVersion(input: {
    actor: VersionActor;
    documentId: string;
    expectedHeadVersionId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestId: string;
    versionId: string;
  }) {
    return this.store.restoreVersion({
      ...input,
      requestHash: requestHash({
        expectedHeadVersionId: input.expectedHeadVersionId,
        note: input.note,
        versionId: input.versionId,
      }),
    });
  }

  public async cleanup(now = new Date()): Promise<{
    expiredUploads: number;
    orphanedObjects: number;
  }> {
    const expired = await this.store.expireUploads(now);
    for (const upload of expired) {
      try {
        if (upload.mode === 'multipart' && upload.multipartUploadId) {
          await this.blobOperation(() =>
            this.blobs.abortMultipartUpload(
              upload.stagingObjectKey,
              upload.multipartUploadId!,
            ),
          );
        } else {
          await this.blobOperation(() =>
            this.blobs.deleteObject(upload.stagingObjectKey),
          );
        }
      } catch {
        // Later cleanup passes retry based on the persisted terminal state.
      }
    }

    const referenced = await this.store.listReferencedObjectKeys();
    const listed = await this.blobOperation(() =>
      this.blobs.listObjects('organizations/'),
    );
    const orphanCutoff = now.getTime() - 60 * 60 * 1000;
    const orphans = listed.filter(
      (item) =>
        !referenced.has(item.key) &&
        item.lastModified !== null &&
        item.lastModified.getTime() <= orphanCutoff,
    );
    for (const orphan of orphans) {
      await this.blobOperation(() => this.blobs.deleteObject(orphan.key));
    }
    const multipartUploads = await this.blobOperation(() =>
      this.blobs.listMultipartUploads('organizations/'),
    );
    const orphanedMultipart = multipartUploads.filter(
      (upload) =>
        !referenced.has(upload.key) &&
        upload.initiatedAt !== null &&
        upload.initiatedAt.getTime() <= orphanCutoff,
    );
    for (const upload of orphanedMultipart) {
      await this.blobOperation(() =>
        this.blobs.abortMultipartUpload(upload.key, upload.uploadId),
      );
    }
    return {
      expiredUploads: expired.length,
      orphanedObjects: orphans.length + orphanedMultipart.length,
    };
  }
}
