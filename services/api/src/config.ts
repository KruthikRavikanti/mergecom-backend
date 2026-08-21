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
  logLevel: LogLevel;
  nodeEnv: 'development' | 'production' | 'test';
  officeAddinOrigin: string;
  oidc: {
    clientId: string;
    clientSecret?: string | undefined;
    issuer: string;
  } | null;
  sessionAbsoluteMilliseconds: number;
  sessionIdleMilliseconds: number;
  trustedProxyHops: number;
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

function parseNonNegativeInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

function parseLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL ?? 'info';
  if (!LOG_LEVELS.has(value as LogLevel)) {
    throw new Error('LOG_LEVEL is invalid.');
  }
  return value as LogLevel;
}

function assertProductionUrl(
  name: string,
  value: string,
  options: {
    allowCredentials?: boolean;
    allowPath?: boolean;
    allowSearch?: boolean;
    protocols: readonly string[];
  },
): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (
    !options.protocols.includes(parsed.protocol) ||
    (!options.allowCredentials &&
      (parsed.username !== '' || parsed.password !== '')) ||
    (!options.allowSearch && parsed.search !== '') ||
    parsed.hash !== '' ||
    (!options.allowPath && parsed.pathname !== '/') ||
    value.endsWith('/') ||
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1'
  ) {
    throw new Error(`${name} is invalid for production.`);
  }
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
  if (nodeEnv === 'production') {
    assertProductionUrl('WEB_ORIGIN', webOrigin, { protocols: ['https:'] });
    assertProductionUrl('OFFICE_ADDIN_ORIGIN', officeAddinOrigin, {
      protocols: ['https:'],
    });
    assertProductionUrl('API_PUBLIC_ORIGIN', apiPublicOrigin, {
      allowPath: true,
      protocols: ['https:'],
    });
    if (webOrigin === officeAddinOrigin) {
      throw new Error('WEB_ORIGIN and OFFICE_ADDIN_ORIGIN must be distinct.');
    }
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
  if (nodeEnv === 'production') {
    const databaseUrl = required('DATABASE_URL');
    assertProductionUrl('DATABASE_URL', databaseUrl, {
      allowCredentials: true,
      allowPath: true,
      allowSearch: true,
      protocols: ['postgres:', 'postgresql:'],
    });
    const sslMode = new URL(databaseUrl).searchParams.get('sslmode');
    if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
      throw new Error('DATABASE_URL must require TLS with sslmode.');
    }
    assertProductionUrl('OIDC_ISSUER', required('OIDC_ISSUER'), {
      allowPath: true,
      protocols: ['https:'],
    });
    assertProductionUrl('S3_ENDPOINT', required('S3_ENDPOINT'), {
      allowPath: true,
      protocols: ['https:'],
    });
    assertProductionUrl('SMTP_URL', required('SMTP_URL'), {
      allowCredentials: true,
      allowPath: true,
      protocols: ['smtps:'],
    });
    required('INVITATION_FROM');
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
    logLevel: parseLogLevel(),
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
    trustedProxyHops: parseNonNegativeInteger(
      'TRUSTED_PROXY_HOPS',
      nodeEnv === 'production' ? 1 : 0,
    ),
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
