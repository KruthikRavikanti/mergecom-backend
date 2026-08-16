import type {
  ClaimedComparisonJob,
  ComparisonResult,
  DocumentFileType,
  InspectionResult,
  InspectionWarning,
  SnapshotEnvelope,
} from './types';
import { PermanentProcessingError } from './types';

export class DocumentEngineClient {
  public constructor(
    private readonly endpoint: string,
    private readonly internalToken: string,
  ) {}

  public async probe(): Promise<boolean> {
    try {
      const response = await fetch(new URL('/health/ready', this.endpoint), {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async inspect(
    job: InspectionInput,
    artifact: Uint8Array,
  ): Promise<InspectionResult> {
    const requestBody = new Uint8Array(artifact.byteLength);
    requestBody.set(artifact);
    const response = await fetch(
      new URL('/internal/v1/inspections', this.endpoint),
      {
        body: requestBody.buffer,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-MergeCom-Extension': job.extension,
          'X-MergeCom-File-Type': job.fileType,
          'X-MergeCom-Internal-Token': this.internalToken,
          'X-MergeCom-Source-Sha256': job.artifactSha256,
          'X-MergeCom-Trace-Id': job.traceId,
        },
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!response.ok) {
      const error = await readEngineError(response);
      if (response.status >= 500) {
        throw new Error(`Document engine unavailable: ${error.code}.`);
      }
      throw new PermanentProcessingError(error.code, error.message);
    }
    return parseInspectionResult(await response.json(), job);
  }

  public async compare(
    job: ClaimedComparisonJob,
    baseArtifact: Uint8Array,
    targetArtifact: Uint8Array,
  ): Promise<ComparisonResult> {
    const [baseResult, targetResult] = await Promise.all([
      this.inspect(
        {
          artifactSha256: job.baseArtifact.sha256,
          extension: job.baseArtifact.extension,
          fileType: job.fileType,
          traceId: job.traceId,
        },
        baseArtifact,
      ),
      this.inspect(
        {
          artifactSha256: job.targetArtifact.sha256,
          extension: job.targetArtifact.extension,
          fileType: job.fileType,
          traceId: job.traceId,
        },
        targetArtifact,
      ),
    ]);
    for (const result of [baseResult, targetResult]) {
      if (result.outcome !== 'completed') {
        throw new PermanentProcessingError(
          result.failure_code ?? 'comparison_source_rejected',
          'A source artifact could not be normalized for comparison.',
        );
      }
    }

    const response = await fetch(
      new URL('/internal/v1/comparisons', this.endpoint),
      {
        body: JSON.stringify({
          base_snapshot: baseResult.snapshot,
          target_snapshot: targetResult.snapshot,
        }),
        headers: {
          'Content-Type': 'application/json',
          'X-MergeCom-Internal-Token': this.internalToken,
          'X-MergeCom-Trace-Id': job.traceId,
        },
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!response.ok) {
      const error = await readEngineError(response);
      if (response.status >= 500) {
        throw new Error(`Document engine unavailable: ${error.code}.`);
      }
      throw new PermanentProcessingError(error.code, error.message);
    }
    return parseComparisonResult(await response.json(), job);
  }
}

interface InspectionInput {
  artifactSha256: string;
  extension: string;
  fileType: DocumentFileType;
  traceId: string;
}

function parseInspectionResult(
  value: unknown,
  job: InspectionInput,
): InspectionResult {
  if (!isObject(value)) return invalidContract();
  const outcome = value.outcome;
  if (
    outcome !== 'completed' &&
    outcome !== 'permanently_failed' &&
    outcome !== 'quarantined'
  ) {
    return invalidContract();
  }
  if (value.failure_code !== null && typeof value.failure_code !== 'string') {
    return invalidContract();
  }
  const snapshot = parseSnapshot(value.snapshot, job);
  return {
    failure_code: value.failure_code,
    outcome,
    snapshot,
  };
}

function parseSnapshot(value: unknown, job: InspectionInput): SnapshotEnvelope {
  if (!isObject(value)) return invalidContract();
  if (
    value.file_type !== job.fileType ||
    value.source_sha256 !== job.artifactSha256 ||
    typeof value.schema_version !== 'string' ||
    typeof value.parser_version !== 'string' ||
    typeof value.stable_hash !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.stable_hash) ||
    !isObject(value.package) ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.unsupported_features) ||
    !Array.isArray(value.validation_errors)
  ) {
    return invalidContract();
  }
  const packageSummary: Record<string, boolean | number> = {};
  for (const [key, item] of Object.entries(value.package)) {
    if (typeof item !== 'boolean' && typeof item !== 'number') {
      return invalidContract();
    }
    packageSummary[key] = item;
  }
  const warnings = value.warnings.map(parseWarning);
  const unsupported = value.unsupported_features.map((item) => {
    if (typeof item !== 'string') return invalidContract();
    return item;
  });
  const validationErrors = value.validation_errors.map((item) => {
    if (
      !isObject(item) ||
      typeof item.code !== 'string' ||
      typeof item.description !== 'string' ||
      !nullableString(item.part) ||
      !nullableString(item.path)
    ) {
      return invalidContract();
    }
    return {
      code: item.code,
      description: item.description,
      part: item.part,
      path: item.path,
    };
  });
  return {
    file_type: job.fileType,
    format_payload: value.format_payload,
    package: packageSummary,
    parser_version: value.parser_version,
    schema_version: value.schema_version,
    source_sha256: job.artifactSha256,
    stable_hash: value.stable_hash,
    unsupported_features: unsupported,
    validation_errors: validationErrors,
    warnings,
  };
}

function parseComparisonResult(
  value: unknown,
  job: ClaimedComparisonJob,
): ComparisonResult {
  if (
    !isObject(value) ||
    value.comparison_schema_version !== job.comparisonSchemaVersion ||
    value.parser_version !== job.parserVersion ||
    value.engine_version !== job.engineVersion ||
    value.file_type !== job.fileType ||
    value.base_source_sha256 !== job.baseArtifact.sha256 ||
    value.target_source_sha256 !== job.targetArtifact.sha256 ||
    typeof value.byte_equal !== 'boolean' ||
    (value.semantic_equal !== null &&
      typeof value.semantic_equal !== 'boolean') ||
    (value.completeness !== 'complete' && value.completeness !== 'partial') ||
    !isSha256(value.stable_hash) ||
    !isObject(value.summary) ||
    !Array.isArray(value.warnings) ||
    !Array.isArray(value.changes)
  ) {
    return invalidContract();
  }
  const summary: Record<string, number> = {};
  for (const [key, count] of Object.entries(value.summary)) {
    if (!Number.isInteger(count) || (count as number) < 0) {
      return invalidContract();
    }
    summary[key] = count as number;
  }
  const warnings = value.warnings.map((warning) => {
    if (typeof warning !== 'string') return invalidContract();
    return warning;
  });
  const changes = value.changes.map((change) => {
    if (
      !isObject(change) ||
      !isSha256(change.id) ||
      !isChangeType(change.change_type) ||
      !isCategory(change.category) ||
      !isImpact(change.impact) ||
      typeof change.entity_type !== 'string' ||
      typeof change.label !== 'string' ||
      typeof change.path !== 'string' ||
      !nullableString(change.before) ||
      !nullableString(change.after)
    ) {
      return invalidContract();
    }
    return {
      after: change.after,
      before: change.before,
      category: change.category,
      change_type: change.change_type,
      entity_type: change.entity_type,
      id: change.id,
      impact: change.impact,
      label: change.label,
      path: change.path,
    };
  });
  return {
    base_source_sha256: job.baseArtifact.sha256,
    byte_equal: value.byte_equal,
    changes,
    comparison_schema_version: job.comparisonSchemaVersion,
    completeness: value.completeness,
    engine_version: job.engineVersion,
    file_type: job.fileType,
    parser_version: job.parserVersion,
    semantic_equal: value.semantic_equal,
    stable_hash: value.stable_hash,
    summary,
    target_source_sha256: job.targetArtifact.sha256,
    warnings,
  };
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function isChangeType(
  value: unknown,
): value is ComparisonResult['changes'][number]['change_type'] {
  return ['added', 'modified', 'moved', 'removed'].includes(String(value));
}

function isCategory(
  value: unknown,
): value is ComparisonResult['changes'][number]['category'] {
  return ['content', 'feature', 'structure', 'validation'].includes(
    String(value),
  );
}

function isImpact(
  value: unknown,
): value is ComparisonResult['changes'][number]['impact'] {
  return ['high', 'low', 'medium'].includes(String(value));
}

function parseWarning(value: unknown): InspectionWarning {
  if (
    !isObject(value) ||
    typeof value.code !== 'string' ||
    typeof value.message !== 'string' ||
    !nullableString(value.part) ||
    (value.severity !== 'info' && value.severity !== 'warning')
  ) {
    return invalidContract();
  }
  return {
    code: value.code,
    message: value.message,
    part: value.part,
    severity: value.severity,
  };
}

function invalidContract(): never {
  throw new PermanentProcessingError(
    'engine_contract_invalid',
    'The document engine returned an invalid inspection contract.',
  );
}

async function readEngineError(
  response: Response,
): Promise<{ code: string; message: string }> {
  try {
    const value: unknown = await response.json();
    if (
      isObject(value) &&
      typeof value.code === 'string' &&
      typeof value.message === 'string'
    ) {
      return { code: value.code, message: value.message };
    }
  } catch {
    // The status still determines whether the worker retries.
  }
  return {
    code: `engine_http_${response.status}`,
    message: 'The document engine rejected the inspection request.',
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
