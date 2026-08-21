export interface WorkerConfig {
  concurrency: number;
  databaseUrl: string;
  dispatchIntervalMilliseconds: number;
  documentEngineToken: string;
  documentEngineUrl: string;
  excelAutomaticMergeEnabled: boolean;
  excelAutomaticMergePilotOrganizationIds: string[];
  heartbeatMilliseconds: number;
  host: string;
  leaseMilliseconds: number;
  logLevel: LogLevel;
  maxArtifactBytes: number;
  notificationConcurrency: number;
  notificationFrom: string;
  organizationQuotaBytes: number;
  port: number;
  powerPointAutomaticMergeEnabled: boolean;
  powerPointAutomaticMergePilotOrganizationIds: string[];
  redisUrl: string;
  smtpUrl: string;
  s3: {
    accessKey: string;
    bucket: string;
    endpoint: string;
    forcePathStyle: boolean;
    region: string;
    secretKey: string;
  };
  webOrigin: string;
}

type LogLevel =
  'debug' | 'error' | 'fatal' | 'info' | 'silent' | 'trace' | 'warn';

const LOG_LEVELS = new Set<LogLevel>([
  'debug',
  'error',
  'fatal',
  'info',
  'silent',
  'trace',
  'warn',
]);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this configuration.`);
  return value;
}

function configured(
  name: string,
  nodeEnv: 'development' | 'production' | 'test',
  fallback: string,
): string {
  return (
    process.env[name] ?? (nodeEnv === 'production' ? required(name) : fallback)
  );
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function booleanFlag(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function logLevel(): LogLevel {
  const value = process.env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.has(value as LogLevel)) {
    throw new Error('LOG_LEVEL is invalid.');
  }
  return value as LogLevel;
}

function assertProductionUrl(
  name: string,
  value: string,
  options: { allowSearch?: boolean; protocols: readonly string[] },
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (
    !options.protocols.includes(parsed.protocol) ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    (!options.allowSearch && parsed.search !== '') ||
    parsed.hash !== ''
  ) {
    throw new Error(`${name} is invalid for production.`);
  }
}

function organizationAllowlist(name: string): string[] {
  const values = (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    values.some(
      (value) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          value,
        ),
    )
  ) {
    throw new Error(`${name} must contain comma-separated UUIDs.`);
  }
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

export function loadWorkerConfig(): WorkerConfig {
  const nodeEnv = (process.env.NODE_ENV ?? 'development') as
    'development' | 'production' | 'test';
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production, or test.');
  }
  if (nodeEnv === 'production' && !process.env.SMTP_URL) {
    throw new Error(
      'SMTP_URL is required for production notification delivery.',
    );
  }
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const databaseUrl = configured(
    'DATABASE_URL',
    nodeEnv,
    'postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom',
  );
  const redisUrl = configured('REDIS_URL', nodeEnv, 'redis://localhost:6379');
  const smtpUrl = configured('SMTP_URL', nodeEnv, 'smtp://localhost:1025');
  const documentEngineUrl = configured(
    'DOCUMENT_ENGINE_URL',
    nodeEnv,
    'http://127.0.0.1:3003',
  );
  const s3Endpoint = configured(
    'S3_ENDPOINT',
    nodeEnv,
    'http://localhost:9000',
  );
  if (nodeEnv === 'production') {
    assertProductionUrl('WEB_ORIGIN', webOrigin, { protocols: ['https:'] });
    assertProductionUrl('DATABASE_URL', databaseUrl, {
      allowSearch: true,
      protocols: ['postgres:', 'postgresql:'],
    });
    const sslMode = new URL(databaseUrl).searchParams.get('sslmode');
    if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
      throw new Error('DATABASE_URL must require TLS with sslmode.');
    }
    assertProductionUrl('REDIS_URL', redisUrl, {
      protocols: ['rediss:'],
    });
    assertProductionUrl('SMTP_URL', smtpUrl, {
      protocols: ['smtps:'],
    });
    assertProductionUrl('DOCUMENT_ENGINE_URL', documentEngineUrl, {
      protocols: ['http:', 'https:'],
    });
    assertProductionUrl('S3_ENDPOINT', s3Endpoint, {
      protocols: ['https:'],
    });
    required('NOTIFICATION_FROM');
  }
  const heartbeatMilliseconds = positiveInteger(
    'PROCESSING_HEARTBEAT_MILLISECONDS',
    5_000,
  );
  const leaseMilliseconds = positiveInteger(
    'PROCESSING_LEASE_MILLISECONDS',
    30_000,
  );
  if (heartbeatMilliseconds * 2 >= leaseMilliseconds) {
    throw new Error(
      'PROCESSING_LEASE_MILLISECONDS must exceed twice the heartbeat interval.',
    );
  }
  const documentEngineToken = configured(
    'DOCUMENT_ENGINE_INTERNAL_TOKEN',
    nodeEnv,
    'mergecom-local-document-engine-token',
  );
  if (documentEngineToken.length < 32) {
    throw new Error(
      'DOCUMENT_ENGINE_INTERNAL_TOKEN must be at least 32 characters.',
    );
  }
  return {
    concurrency: positiveInteger('PROCESSING_CONCURRENCY', 2),
    databaseUrl,
    dispatchIntervalMilliseconds: positiveInteger(
      'PROCESSING_DISPATCH_INTERVAL_MILLISECONDS',
      2_000,
    ),
    documentEngineToken,
    documentEngineUrl,
    excelAutomaticMergeEnabled: booleanFlag('EXCEL_AUTOMATIC_MERGE_ENABLED'),
    excelAutomaticMergePilotOrganizationIds: organizationAllowlist(
      'EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS',
    ),
    heartbeatMilliseconds,
    host: process.env.WORKER_HOST ?? '0.0.0.0',
    leaseMilliseconds,
    logLevel: logLevel(),
    maxArtifactBytes: positiveInteger(
      'PROCESSING_MAX_ARTIFACT_BYTES',
      100 * 1024 * 1024,
    ),
    notificationConcurrency: positiveInteger('NOTIFICATION_CONCURRENCY', 2),
    notificationFrom:
      process.env.NOTIFICATION_FROM ?? 'MergeCom <no-reply@mergecom.local>',
    organizationQuotaBytes: positiveInteger(
      'ORGANIZATION_STORAGE_QUOTA_BYTES',
      5 * 1024 * 1024 * 1024,
    ),
    port: positiveInteger('WORKER_PORT', 3002),
    powerPointAutomaticMergeEnabled: booleanFlag(
      'POWERPOINT_AUTOMATIC_MERGE_ENABLED',
    ),
    powerPointAutomaticMergePilotOrganizationIds: organizationAllowlist(
      'POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS',
    ),
    redisUrl,
    smtpUrl,
    s3: {
      accessKey: configured('S3_ACCESS_KEY', nodeEnv, 'mergecom-local'),
      bucket: process.env.S3_BUCKET ?? 'mergecom-artifacts',
      endpoint: s3Endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      region: process.env.S3_REGION ?? 'us-east-1',
      secretKey: configured('S3_SECRET_KEY', nodeEnv, 'mergecom-local-only'),
    },
    webOrigin,
  };
}
