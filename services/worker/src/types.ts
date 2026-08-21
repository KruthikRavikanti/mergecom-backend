export type DocumentFileType = 'presentation' | 'spreadsheet' | 'word_document';

export type ProcessingOutcome =
  'completed' | 'permanently_failed' | 'quarantined';

export interface InspectionWarning {
  code: string;
  message: string;
  part: string | null;
  severity: 'info' | 'warning';
}

export interface SnapshotEnvelope {
  file_type: DocumentFileType;
  format_payload: unknown;
  package: Record<string, boolean | number>;
  parser_version: string;
  schema_version: string;
  source_sha256: string;
  stable_hash: string;
  unsupported_features: string[];
  validation_errors: Array<{
    code: string;
    description: string;
    part: string | null;
    path: string | null;
  }>;
  warnings: InspectionWarning[];
}

export interface InspectionResult {
  failure_code: string | null;
  outcome: ProcessingOutcome;
  snapshot: SnapshotEnvelope;
}

export interface ClaimedProcessingJob {
  artifactByteSize: number;
  artifactObjectKey: string;
  artifactSha256: string;
  attempts: number;
  extension: string;
  fileType: DocumentFileType;
  id: string;
  maxAttempts: number;
  organizationId: string;
  traceId: string;
  versionId: string;
}

export interface ComparisonArtifact {
  byteSize: number;
  extension: string;
  objectKey: string;
  sha256: string;
  versionId: string;
}

export interface ClaimedComparisonJob {
  attempts: number;
  baseArtifact: ComparisonArtifact;
  comparisonSchemaVersion: string;
  engineVersion: string;
  fileType: DocumentFileType;
  id: string;
  maxAttempts: number;
  organizationId: string;
  parserVersion: string;
  targetArtifact: ComparisonArtifact;
  traceId: string;
}

export interface ClaimedRenditionJob {
  artifactByteSize: number;
  artifactObjectKey: string;
  artifactSha256: string;
  attempts: number;
  extension: string;
  fileType: DocumentFileType;
  fontPackVersion: string;
  id: string;
  maxAttempts: number;
  organizationId: string;
  rendererProfile: string;
  rendererVersion: string;
  renditionId: string;
  traceId: string;
  versionId: string;
}

export interface ClaimedMergeJob {
  attempts: number;
  baseArtifact: ComparisonArtifact;
  branchId: string;
  documentId: string;
  engineVersion: string;
  fileType: DocumentFileType;
  id: string;
  maxAttempts: number;
  mergeSchemaVersion: string;
  note: string;
  organizationId: string;
  oursArtifact: ComparisonArtifact & {
    detectedMediaType: string;
    originalFilename: string;
  };
  parserVersion: string;
  requestedByUserId: string;
  theirsArtifact: ComparisonArtifact;
  traceId: string;
}

export type ComparisonChangeType = 'added' | 'modified' | 'moved' | 'removed';
export type ComparisonCategory =
  'content' | 'feature' | 'structure' | 'validation';
export type ComparisonImpact = 'high' | 'low' | 'medium';

export interface ComparisonChange {
  after: string | null;
  before: string | null;
  category: ComparisonCategory;
  change_type: ComparisonChangeType;
  entity_type: string;
  id: string;
  impact: ComparisonImpact;
  label: string;
  path: string;
}

export interface ComparisonResult {
  base_source_sha256: string;
  byte_equal: boolean;
  changes: ComparisonChange[];
  comparison_schema_version: string;
  completeness: 'complete' | 'partial';
  engine_version: string;
  file_type: DocumentFileType;
  parser_version: string;
  semantic_equal: boolean | null;
  stable_hash: string;
  summary: Record<string, number>;
  target_source_sha256: string;
  warnings: string[];
}

export interface ComparisonEngineOutput {
  baseSnapshot: SnapshotEnvelope;
  result: ComparisonResult;
  targetSnapshot: SnapshotEnvelope;
}

export interface RenditionResult {
  byteCount: number;
  dimensions: Array<{ height: number; width: number }>;
  fontPackVersion: string;
  outputSha256: string;
  pageCount: number;
  pdf: Uint8Array;
  rendererProfile: string;
  rendererVersion: string;
  warnings: string[];
}

export type VisualLocatorConfidence = 'approximate' | 'exact' | 'unavailable';

export interface VisualLocator {
  boundingBox?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  cell?: string;
  confidence: VisualLocatorConfidence;
  kind: 'page' | 'paragraph' | 'sheet_cell' | 'slide' | 'table_cell';
  page?: number;
  semanticPath?: string;
  sheetId?: string;
  side: 'base' | 'target';
  slideId?: string;
}

export interface VisualChangeMapping {
  changeId: string;
  confidence: VisualLocatorConfidence;
  locators: VisualLocator[];
  reason: string | null;
}

export interface ComparisonVisualizationArtifact {
  comparisonId: string;
  coverage: {
    approximate: number;
    exact: number;
    mapped: number;
    total: number;
    unavailable: number;
  };
  engineVersion: string;
  mappings: VisualChangeMapping[];
  rendererProfile: string;
  schemaVersion: string;
}

export interface MergeResult {
  analysis: MergeAnalysis;
  applied_paths: string[];
  base_source_sha256: string;
  candidate_byte_size: number | null;
  candidate_bytes: Uint8Array | null;
  candidate_sha256: string | null;
  engine_version: string;
  failure_code: string | null;
  file_type: DocumentFileType;
  merge_schema_version: string;
  outcome: 'completed' | 'manual_resolution_required';
  ours_source_sha256: string;
  parser_version: string;
  stable_hash: string;
  strategy: string | null;
  theirs_source_sha256: string;
  warnings: string[];
}

export type MergeAnalysisClassification =
  | 'ambiguous'
  | 'compatible_overlap'
  | 'non_overlapping'
  | 'true_conflict'
  | 'unsupported';

export interface MergeAnalysisItem {
  automatically_resolved: boolean;
  category: string;
  classification: MergeAnalysisClassification;
  confidence: 'high' | 'low' | 'medium';
  explanation: string;
  id: string;
  label: string;
  ours_change: string | null;
  path: string;
  theirs_change: string | null;
}

export interface MergeAnalysisBlocker {
  category: string;
  code: string;
  explanation: string;
  path: string | null;
}

export interface MergeAnalysis {
  automatic_merge_eligible: boolean;
  automatic_merge_enabled: boolean;
  blockers: MergeAnalysisBlocker[];
  items: MergeAnalysisItem[];
  schema_version: string;
  summary: Record<MergeAnalysisClassification, number>;
}

export interface DispatchableJob {
  id: string;
  maxAttempts: number;
  versionId: string;
}

export interface DispatchableComparison {
  id: string;
  maxAttempts: number;
}

export interface DispatchableMerge {
  id: string;
  maxAttempts: number;
}

export interface DispatchableRendition {
  id: string;
  maxAttempts: number;
  queueAgeSeconds: number;
  renditionId: string;
}

export class PermanentProcessingError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
