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

export interface DispatchableJob {
  id: string;
  maxAttempts: number;
  versionId: string;
}

export interface DispatchableComparison {
  id: string;
  maxAttempts: number;
}

export class PermanentProcessingError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
