import type { DocumentKind, ProjectActor } from '../projects/types';
import type { SignedBlobGrant } from '../storage/blob-store';

export type VersionActor = ProjectActor;
export type UploadMode = 'single' | 'multipart';
export type VersionSource =
  'web_upload' | 'office_addin' | 'restore' | 'merge' | 'import';
export type VersionStatus =
  'pending_processing' | 'ready' | 'conflicted' | 'quarantined' | 'failed';

export interface ArtifactSummary {
  byteSize: number;
  detectedMediaType: string;
  extension: string;
  id: string;
  originalFilename: string;
  scanStatus: 'pending' | 'clean' | 'quarantined' | 'failed';
  sha256: string;
  storageChecksum: string | null;
  storageVersion: string | null;
}

export interface BranchSummary {
  headVersionId: string | null;
  id: string;
  name: string;
}

export interface DocumentVersionSummary {
  artifact: ArtifactSummary;
  author: { id: string; name: string };
  baseVersionId: string | null;
  branchId: string;
  conflictReason: string | null;
  createdAt: Date;
  displayNumber: number;
  documentId: string;
  id: string;
  mergeParentVersionId: string | null;
  note: string;
  parentVersionId: string | null;
  sequence: number;
  source: VersionSource;
  status: VersionStatus;
}

export interface VersionPage {
  branch: BranchSummary;
  items: DocumentVersionSummary[];
  nextCursor: string | null;
}

export interface StagedUploadRecord {
  baseVersionId: string | null;
  branchId: string;
  clientMediaType: string | null;
  createdAt: Date;
  createdByUserId: string;
  documentId: string;
  expectedByteSize: number;
  expectedSha256: string;
  expiresAt: Date;
  extension: string;
  finalizedVersionId: string | null;
  id: string;
  mode: UploadMode;
  multipartUploadId: string | null;
  originalFilename: string;
  partSize: number | null;
  stagingObjectKey: string;
  status: 'pending' | 'finalized' | 'cancelled' | 'expired' | 'failed';
}

export interface UploadIntent {
  branch: BranchSummary;
  expiresAt: Date;
  grant: SignedBlobGrant | null;
  id: string;
  mode: UploadMode;
  multipart: { partCount: number; partSize: number } | null;
}

export interface FinalizeVersionResult {
  currentHeadVersionId: string | null;
  outcome: 'created' | 'conflict';
  replayed: boolean;
  version: DocumentVersionSummary;
}

export interface DocumentAccess {
  branch: BranchSummary;
  documentKind: DocumentKind;
}

export interface ExpiredUpload {
  id: string;
  mode: UploadMode;
  multipartUploadId: string | null;
  stagingObjectKey: string;
}
