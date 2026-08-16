export interface WorkerConfig {
  concurrency: number;
  databaseUrl: string;
  dispatchIntervalMilliseconds: number;
  documentEngineToken: string;
  documentEngineUrl: string;
  heartbeatMilliseconds: number;
  host: string;
  leaseMilliseconds: number;
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
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' && !process.env.SMTP_URL) {
    throw new Error(
      'SMTP_URL is required for production notification delivery.',
    );
  }
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  if (nodeEnv === 'production' && !webOrigin.startsWith('https://')) {
    throw new Error('WEB_ORIGIN must use HTTPS in production.');
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
  const documentEngineToken =
    process.env.DOCUMENT_ENGINE_INTERNAL_TOKEN ??
    'mergecom-local-document-engine-token';
  if (documentEngineToken.length < 32) {
    throw new Error(
      'DOCUMENT_ENGINE_INTERNAL_TOKEN must be at least 32 characters.',
    );
  }
  return {
    concurrency: positiveInteger('PROCESSING_CONCURRENCY', 2),
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom',
    dispatchIntervalMilliseconds: positiveInteger(
      'PROCESSING_DISPATCH_INTERVAL_MILLISECONDS',
      2_000,
    ),
    documentEngineToken,
    documentEngineUrl:
      process.env.DOCUMENT_ENGINE_URL ?? 'http://127.0.0.1:3003',
    heartbeatMilliseconds,
    host: process.env.WORKER_HOST ?? '0.0.0.0',
    leaseMilliseconds,
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
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    smtpUrl: process.env.SMTP_URL ?? 'smtp://localhost:1025',
    s3: {
      accessKey: process.env.S3_ACCESS_KEY ?? 'mergecom-local',
      bucket: process.env.S3_BUCKET ?? 'mergecom-artifacts',
      endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      region: process.env.S3_REGION ?? 'us-east-1',
      secretKey: process.env.S3_SECRET_KEY ?? 'mergecom-local-only',
    },
    webOrigin,
  };
}
