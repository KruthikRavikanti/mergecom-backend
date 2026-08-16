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

export interface DispatchableJob {
  id: string;
  maxAttempts: number;
  versionId: string;
}

export class PermanentProcessingError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
