export interface ApiConfig {
  apiPublicOrigin: string;
  authMode: 'development' | 'entra';
  blobStorage?: BlobStorageConfig;
  cookieSecure: boolean;
  databaseUrl: string;
  exposeInvitationLinks: boolean;
  invitationMail: {
    from: string;
    smtpUrl: string;
  } | null;
  nodeEnv: 'development' | 'production' | 'test';
  officeAddinOrigin: string;
  oidc: {
    clientId: string;
    clientSecret?: string | undefined;
    issuer: string;
  } | null;
  sessionAbsoluteMilliseconds: number;
  sessionIdleMilliseconds: number;
  webOrigin: string;
}

export interface BlobStorageConfig {
  accessKey: string;
  bucket: string;
  cleanupIntervalMilliseconds: number;
  endpoint: string;
  forcePathStyle: boolean;
  maxUploadBytes: number;
  multipartPartBytes: number;
  multipartThresholdBytes: number;
  organizationQuotaBytes: number;
  region: string;
  secretKey: string;
  signedUrlSeconds: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for this configuration.`);
  return value;
}

function parsePositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function loadBlobStorageConfig(
  nodeEnv: ApiConfig['nodeEnv'],
): BlobStorageConfig {
  const endpoint =
    process.env.S3_ENDPOINT ??
    (nodeEnv === 'production'
      ? required('S3_ENDPOINT')
      : 'http://localhost:9000');
  const multipartPartBytes = parsePositiveInteger(
    'UPLOAD_MULTIPART_PART_BYTES',
    8 * 1024 * 1024,
  );
  const multipartThresholdBytes = parsePositiveInteger(
    'UPLOAD_MULTIPART_THRESHOLD_BYTES',
    16 * 1024 * 1024,
  );
  if (multipartPartBytes < 5 * 1024 * 1024) {
    throw new Error('UPLOAD_MULTIPART_PART_BYTES must be at least 5242880.');
  }
  if (multipartThresholdBytes < multipartPartBytes) {
    throw new Error(
      'UPLOAD_MULTIPART_THRESHOLD_BYTES must be at least UPLOAD_MULTIPART_PART_BYTES.',
    );
  }

  return {
    accessKey:
      process.env.S3_ACCESS_KEY ??
      (nodeEnv === 'production' ? required('S3_ACCESS_KEY') : 'mergecom-local'),
    bucket: process.env.S3_BUCKET ?? 'mergecom-artifacts',
    cleanupIntervalMilliseconds:
      parsePositiveInteger('UPLOAD_CLEANUP_MINUTES', 15) * 60 * 1000,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    maxUploadBytes: parsePositiveInteger('UPLOAD_MAX_BYTES', 100 * 1024 * 1024),
    multipartPartBytes,
    multipartThresholdBytes,
    organizationQuotaBytes: parsePositiveInteger(
      'ORGANIZATION_STORAGE_QUOTA_BYTES',
      5 * 1024 * 1024 * 1024,
    ),
    region: process.env.S3_REGION ?? 'us-east-1',
    secretKey:
      process.env.S3_SECRET_KEY ??
      (nodeEnv === 'production'
        ? required('S3_SECRET_KEY')
        : 'mergecom-local-only'),
    signedUrlSeconds: parsePositiveInteger('SIGNED_URL_SECONDS', 300),
  };
}

export function loadConfig(): ApiConfig {
  const nodeEnv = (process.env.NODE_ENV ??
    'development') as ApiConfig['nodeEnv'];
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production, or test.');
  }
  const authMode = (process.env.AUTH_MODE ??
    (nodeEnv === 'production'
      ? 'entra'
      : 'development')) as ApiConfig['authMode'];
  if (!['development', 'entra'].includes(authMode)) {
    throw new Error('AUTH_MODE must be development or entra.');
  }
  if (nodeEnv === 'production' && authMode !== 'entra') {
    throw new Error('Development identity cannot run in production.');
  }

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const officeAddinOrigin =
    process.env.OFFICE_ADDIN_ORIGIN ?? 'https://localhost:5176';
  const apiPublicOrigin =
    process.env.API_PUBLIC_ORIGIN ?? 'http://localhost:3001';
  if (
    nodeEnv === 'production' &&
    (!webOrigin.startsWith('https://') ||
      !officeAddinOrigin.startsWith('https://') ||
      !apiPublicOrigin.startsWith('https://'))
  ) {
    throw new Error(
      'Production web, Office add-in, and API origins must use HTTPS.',
    );
  }

  const exposeInvitationLinks = process.env.EXPOSE_INVITATION_LINKS
    ? process.env.EXPOSE_INVITATION_LINKS === 'true'
    : nodeEnv !== 'production';
  if (nodeEnv === 'production' && exposeInvitationLinks) {
    throw new Error(
      'Invitation tokens cannot be exposed in production responses.',
    );
  }
  if (nodeEnv === 'production' && !process.env.SMTP_URL) {
    throw new Error('SMTP_URL is required for production invitation delivery.');
  }
  if (
    nodeEnv === 'production' &&
    authMode === 'entra' &&
    !process.env.OIDC_CLIENT_SECRET
  ) {
    throw new Error('OIDC_CLIENT_SECRET is required in production.');
  }

  return {
    apiPublicOrigin,
    authMode,
    blobStorage: loadBlobStorageConfig(nodeEnv),
    cookieSecure:
      process.env.COOKIE_SECURE === 'true' || nodeEnv === 'production',
    databaseUrl:
      process.env.DATABASE_URL ??
      (nodeEnv === 'production'
        ? required('DATABASE_URL')
        : 'postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom'),
    exposeInvitationLinks,
    invitationMail: process.env.SMTP_URL
      ? {
          from:
            process.env.INVITATION_FROM ?? 'MergeCom <no-reply@mergecom.local>',
          smtpUrl: process.env.SMTP_URL,
        }
      : null,
    nodeEnv,
    officeAddinOrigin,
    oidc:
      authMode === 'entra'
        ? {
            clientId: required('OIDC_CLIENT_ID'),
            clientSecret: process.env.OIDC_CLIENT_SECRET,
            issuer: required('OIDC_ISSUER'),
          }
        : null,
    sessionAbsoluteMilliseconds:
      parsePositiveInteger('SESSION_ABSOLUTE_HOURS', 168) * 60 * 60 * 1000,
    sessionIdleMilliseconds:
      parsePositiveInteger('SESSION_IDLE_MINUTES', 480) * 60 * 1000,
    webOrigin,
  };
}

export function safeReturnTo(
  value: string | undefined,
  officeAddinOrigin?: string,
): string {
  if (!value) return '/app';
  if (officeAddinOrigin) {
    try {
      const candidate = new URL(value);
      if (
        candidate.origin === officeAddinOrigin &&
        candidate.pathname === '/office-auth.html' &&
        candidate.searchParams.size === 1 &&
        candidate.searchParams.get('callback') === '1' &&
        candidate.hash === ''
      ) {
        return candidate.href;
      }
    } catch {
      // Local application paths are validated below.
    }
  }
  if (!value.startsWith('/app') && !value.startsWith('/invite/')) return '/app';
  if (value.startsWith('//') || value.includes('\\')) return '/app';
  return value;
}
