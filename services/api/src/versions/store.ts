import type { PageInput } from '../projects/store';
import type {
  ArtifactSummary,
  BranchSummary,
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
} from './types';

export type VersionOperationErrorCode =
  | 'comparison_unavailable'
  | 'denied'
  | 'idempotency_conflict'
  | 'invalid_base'
  | 'invalid_cursor'
  | 'invalid_state'
  | 'not_found'
  | 'quota_exceeded'
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

export interface CreatedUploadRecord {
  branch: BranchSummary;
  record: StagedUploadRecord;
  replayed: boolean;
}

export interface VersionStore {
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
}

export type { ArtifactSummary };
