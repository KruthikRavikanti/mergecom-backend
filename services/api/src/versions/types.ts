import type { DocumentKind, ProjectActor } from '../projects/types';
import type { SignedBlobGrant } from '../storage/blob-store';

export type VersionActor = ProjectActor;
export type UploadMode = 'single' | 'multipart';
export type VersionSource =
  'web_upload' | 'office_addin' | 'restore' | 'merge' | 'import';
export type VersionStatus =
  'pending_processing' | 'ready' | 'conflicted' | 'quarantined' | 'failed';
export type ProcessingJobStatus =
  | 'queued'
  | 'running'
  | 'retryable_failed'
  | 'permanently_failed'
  | 'quarantined'
  | 'completed';

export interface ProcessingWarning {
  code: string;
  message: string;
  part: string | null;
  severity: 'info' | 'warning';
}

export interface SnapshotSummary {
  package: Record<string, boolean | number>;
  parserVersion: string;
  schemaVersion: string;
  stableHash: string;
  unsupportedFeatures: string[];
  validationErrorCount: number;
  warnings: ProcessingWarning[];
}

export interface VersionProcessingSummary {
  attempts: number;
  failureCode: string | null;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  snapshot: SnapshotSummary | null;
  state: ProcessingJobStatus;
  supportTraceId: string;
  updatedAt: Date;
}

export type ComparisonChangeType = 'added' | 'modified' | 'moved' | 'removed';
export type ComparisonCategory =
  'content' | 'feature' | 'structure' | 'validation';
export type ComparisonImpact = 'high' | 'low' | 'medium';

export interface ComparisonChange {
  after: string | null;
  before: string | null;
  category: ComparisonCategory;
  changeType: ComparisonChangeType;
  entityType: string;
  id: string;
  impact: ComparisonImpact;
  label: string;
  path: string;
}

export interface ComparisonVersionReference {
  artifactSha256: string;
  authorName: string;
  createdAt: Date;
  displayNumber: number;
  id: string;
  note: string;
}

export interface VersionComparison {
  attempts: number;
  baseVersion: ComparisonVersionReference;
  byteEqual: boolean | null;
  changes: ComparisonChange[];
  comparisonSchemaVersion: string;
  completeness: 'complete' | 'partial' | null;
  createdAt: Date;
  engineVersion: string;
  failureCode: string | null;
  id: string;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  parserVersion: string;
  semanticEqual: boolean | null;
  stableHash: string | null;
  state: ProcessingJobStatus;
  summary: Record<string, number>;
  supportTraceId: string;
  targetVersion: ComparisonVersionReference;
  updatedAt: Date;
  warnings: string[];
}

export interface VersionRendition {
  attempts: number;
  byteCount: number | null;
  completedAt: Date | null;
  createdAt: Date;
  dimensions: Array<{ height: number; width: number }>;
  failureCode: string | null;
  fontPackVersion: string;
  id: string;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  pageCount: number | null;
  rendererProfile: string;
  rendererVersion: string;
  renditionSha256: string | null;
  sourceSha256: string;
  state: ProcessingJobStatus;
  supportTraceId: string;
  updatedAt: Date;
  versionId: string;
  warnings: string[];
}

export interface VisualLocator {
  boundingBox?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  cell?: string;
  confidence: 'approximate' | 'exact' | 'unavailable';
  kind: 'page' | 'paragraph' | 'sheet_cell' | 'slide' | 'table_cell';
  page?: number;
  semanticPath?: string;
  sheetId?: string;
  side: 'base' | 'target';
  slideId?: string;
}

export interface ComparisonVisualization {
  comparisonId: string;
  coverage: {
    approximate: number;
    exact: number;
    mapped: number;
    total: number;
    unavailable: number;
  };
  engineVersion: string;
  mappings: Array<{
    changeId: string;
    confidence: 'approximate' | 'exact' | 'unavailable';
    locators: VisualLocator[];
    reason: string | null;
  }>;
  rendererProfile: string;
  schemaVersion: string;
}

export interface VersionVisualData {
  fileType: DocumentKind;
  parserVersion: string;
  payload: unknown;
  schemaVersion: string;
  unsupportedFeatures: string[];
  versionId: string;
  warnings: ProcessingWarning[];
}

export type MergeOperationStatus =
  | 'queued'
  | 'running'
  | 'retryable_failed'
  | 'permanently_failed'
  | 'manual_resolution_required'
  | 'completed';

export interface MergeVersionReference extends ComparisonVersionReference {
  status: VersionStatus;
}

export type MergeAnalysisClassification =
  | 'ambiguous'
  | 'compatible_overlap'
  | 'non_overlapping'
  | 'true_conflict'
  | 'unsupported';

export interface MergeAnalysis {
  automaticMergeEligible: boolean;
  automaticMergeEnabled: boolean;
  blockers: Array<{
    category: string;
    code: string;
    explanation: string;
    path: string | null;
  }>;
  items: Array<{
    automaticallyResolved: boolean;
    category: string;
    classification: MergeAnalysisClassification;
    confidence: 'high' | 'low' | 'medium';
    explanation: string;
    id: string;
    label: string;
    oursChange: string | null;
    path: string;
    theirsChange: string | null;
  }>;
  schemaVersion: string;
  summary: Record<MergeAnalysisClassification, number>;
}

export interface DocumentMerge {
  analysis: MergeAnalysis | null;
  appliedPaths: string[];
  attempts: number;
  baseVersion: MergeVersionReference;
  branchId: string;
  candidate: { byteSize: number; sha256: string } | null;
  createdAt: Date;
  engineVersion: string;
  failureCode: string | null;
  id: string;
  maxAttempts: number;
  mergeSchemaVersion: string;
  nextAttemptAt: Date | null;
  note: string;
  oursVersion: MergeVersionReference;
  parserVersion: string;
  resultVersionId: string | null;
  stableHash: string | null;
  state: MergeOperationStatus;
  strategy: string | null;
  supportTraceId: string;
  theirsVersion: MergeVersionReference;
  updatedAt: Date;
  warnings: string[];
}

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
  processing: VersionProcessingSummary;
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
