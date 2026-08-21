import type { PageInput } from '../projects/store';
import type {
  ArtifactSummary,
  BranchSummary,
  DocumentMerge,
  VersionComparison,
  DocumentAccess,
  DocumentVersionSummary,
  ExpiredUpload,
  FinalizeVersionResult,
  StagedUploadRecord,
  UploadMode,
  VersionActor,
  VersionPage,
  VersionSource,
  VersionRendition,
  VersionVisualData,
  ComparisonVisualization,
} from './types';

export type VersionOperationErrorCode =
  | 'comparison_unavailable'
  | 'denied'
  | 'idempotency_conflict'
  | 'invalid_base'
  | 'invalid_cursor'
  | 'invalid_state'
  | 'merge_unavailable'
  | 'not_found'
  | 'quota_exceeded'
  | 'rendition_unavailable'
  | 'stale_head'
  | 'upload_expired';

export class VersionOperationError extends Error {
  public constructor(public readonly code: VersionOperationErrorCode) {
    super(code);
  }
}

export interface FinalizedArtifactInput {
  byteSize: number;
  detectedMediaType: string;
  extension: string;
  objectKey: string;
  originalFilename: string;
  sha256: string;
  storageChecksum: string | null;
  storageVersion: string | null;
}

export interface AuthorizedArtifact {
  objectKey: string;
  version: DocumentVersionSummary;
}

export interface AuthorizedMergeCandidate {
  byteSize: number;
  extension: string;
  objectKey: string;
  sha256: string;
}

export interface AuthorizedRendition {
  objectKey: string;
  rendition: VersionRendition;
}

export interface AuthorizedVisualization {
  artifactSha256: string;
  objectKey: string;
}

export interface AuthorizedVisualData {
  objectKey: string;
  snapshotSha256: string;
  visualData: Omit<VersionVisualData, 'payload'>;
}

export interface CreatedUploadRecord {
  branch: BranchSummary;
  record: StagedUploadRecord;
  replayed: boolean;
}

export interface VersionStore {
  appendMergeCandidateDownloadAudit(input: {
    actor: VersionActor;
    mergeId: string;
    requestId: string;
  }): Promise<void>;
  appendDownloadAudit(input: {
    actor: VersionActor;
    requestId: string;
    versionId: string;
  }): Promise<void>;
  cancelUpload(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    requestId: string;
    uploadId: string;
  }): Promise<StagedUploadRecord>;
  createComparison(input: {
    actor: VersionActor;
    baseVersionId: string;
    comparisonSchemaVersion: string;
    documentId: string;
    engineVersion: string;
    idempotencyKey: string;
    parserVersion: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    targetVersionId: string;
  }): Promise<{ comparison: VersionComparison; replayed: boolean }>;
  createMerge(input: {
    actor: VersionActor;
    baseVersionId: string;
    documentId: string;
    engineVersion: string;
    idempotencyKey: string;
    mergeSchemaVersion: string;
    note: string;
    oursVersionId: string;
    parserVersion: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    theirsVersionId: string;
  }): Promise<{ merge: DocumentMerge; replayed: boolean }>;
  createRendition(input: {
    actor: VersionActor;
    documentId: string;
    fontPackVersion: string;
    idempotencyKey: string;
    projectId: string;
    rendererProfile: string;
    rendererVersion: string;
    requestHash: string;
    requestId: string;
    versionId: string;
  }): Promise<{
    cacheHit?: boolean;
    rendition: VersionRendition;
    replayed: boolean;
  }>;
  createUpload(input: {
    actor: VersionActor;
    baseVersionId: string | null;
    clientMediaType: string | null;
    expectedByteSize: number;
    expectedSha256: string;
    expiresAt: Date;
    extension: string;
    idempotencyKey: string;
    mode: UploadMode;
    multipartUploadId: string | null;
    originalFilename: string;
    partSize: number | null;
    projectId: string;
    requestHash: string;
    requestId: string;
    stagingObjectKey: string;
    uploadId: string;
    documentId: string;
  }): Promise<CreatedUploadRecord>;
  expireUploads(now: Date): Promise<ExpiredUpload[]>;
  failUpload(uploadId: string, failureCode: string): Promise<void>;
  finalizeUpload(input: {
    actor: VersionActor;
    artifact: FinalizedArtifactInput;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    source: VersionSource;
    uploadId: string;
    documentId: string;
  }): Promise<FinalizeVersionResult>;
  getDocumentAccess(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    write: boolean;
  }): Promise<DocumentAccess>;
  getUpload(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    uploadId: string;
    write: boolean;
  }): Promise<StagedUploadRecord>;
  getComparison(input: {
    actor: VersionActor;
    comparisonId: string;
    documentId: string;
    projectId: string;
  }): Promise<VersionComparison>;
  getMerge(input: {
    actor: VersionActor;
    documentId: string;
    mergeId: string;
    projectId: string;
  }): Promise<DocumentMerge>;
  getMergeCandidate(input: {
    actor: VersionActor;
    documentId: string;
    mergeId: string;
    projectId: string;
  }): Promise<AuthorizedMergeCandidate>;
  getRendition(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    renditionId: string;
    versionId: string;
  }): Promise<AuthorizedRendition>;
  getRenditionForVersion(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    rendererProfile: string;
    versionId: string;
  }): Promise<VersionRendition>;
  getVisualData(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    versionId: string;
  }): Promise<AuthorizedVisualData>;
  getVisualization(input: {
    actor: VersionActor;
    comparisonId: string;
    documentId: string;
    projectId: string;
  }): Promise<AuthorizedVisualization>;
  getVersion(input: {
    actor: VersionActor;
    documentId: string;
    projectId: string;
    versionId: string;
  }): Promise<AuthorizedArtifact>;
  listReferencedObjectKeys(): Promise<Set<string>>;
  listVersions(input: {
    actor: VersionActor;
    documentId: string;
    page: PageInput;
    projectId: string;
  }): Promise<VersionPage>;
  restoreVersion(input: {
    actor: VersionActor;
    documentId: string;
    expectedHeadVersionId: string;
    idempotencyKey: string;
    note: string;
    projectId: string;
    requestHash: string;
    requestId: string;
    versionId: string;
  }): Promise<{ replayed: boolean; version: DocumentVersionSummary }>;
  appendRenditionViewAudit(input: {
    actor: VersionActor;
    renditionId: string;
    requestId: string;
  }): Promise<void>;
}

export type { ArtifactSummary, ComparisonVisualization };
