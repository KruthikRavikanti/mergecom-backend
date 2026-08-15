export interface ApiConfig {
  apiPublicOrigin: string;
  authMode: 'development' | 'entra';
  cookieSecure: boolean;
  databaseUrl: string;
  exposeInvitationLinks: boolean;
  invitationMail: {
    from: string;
    smtpUrl: string;
  } | null;
  nodeEnv: 'development' | 'production' | 'test';
  oidc: {
    clientId: string;
    clientSecret?: string | undefined;
    issuer: string;
  } | null;
  sessionAbsoluteMilliseconds: number;
  sessionIdleMilliseconds: number;
  webOrigin: string;
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
  const apiPublicOrigin =
    process.env.API_PUBLIC_ORIGIN ?? 'http://localhost:3001';
  if (
    nodeEnv === 'production' &&
    (!webOrigin.startsWith('https://') ||
      !apiPublicOrigin.startsWith('https://'))
  ) {
    throw new Error('Production web and API origins must use HTTPS.');
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

export function safeReturnTo(value: string | undefined): string {
  if (!value) return '/app';
  if (!value.startsWith('/app') && !value.startsWith('/invite/')) return '/app';
  if (value.startsWith('//') || value.includes('\\')) return '/app';
  return value;
}
