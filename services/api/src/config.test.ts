import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig, safeReturnTo } from './config';

const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

function configureProductionEnvironment(): void {
  process.env = {
    ...originalEnvironment,
    API_PUBLIC_ORIGIN: 'https://app.mergecom.test/api',
    AUTH_MODE: 'entra',
    DATABASE_URL:
      'postgresql://mergecom:secret@db.mergecom.test/mergecom?sslmode=require',
    EXPOSE_INVITATION_LINKS: 'false',
    INVITATION_FROM: 'MergeCom <no-reply@mergecom.test>',
    NODE_ENV: 'production',
    OFFICE_ADDIN_ORIGIN: 'https://office.mergecom.test',
    OIDC_CLIENT_ID: 'mergecom-client',
    OIDC_CLIENT_SECRET: 'oidc-secret',
    OIDC_ISSUER: 'https://login.microsoftonline.com/tenant/v2.0',
    S3_ACCESS_KEY: 'storage-access',
    S3_ENDPOINT: 'https://storage.mergecom.test',
    S3_SECRET_KEY: 'storage-secret',
    SMTP_URL: 'smtps://mailer:secret@smtp.mergecom.test:465',
    WEB_ORIGIN: 'https://app.mergecom.test',
  };
}

describe('identity configuration', () => {
  it('refuses development identity in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = 'development';
    expect(loadConfig).toThrow('Development identity');
  });

  it('accepts only local application return paths', () => {
    expect(safeReturnTo('/app/team?filter=active')).toBe(
      '/app/team?filter=active',
    );
    expect(safeReturnTo('https://attacker.invalid')).toBe('/app');
    expect(safeReturnTo('//attacker.invalid')).toBe('/app');
  });

  it('accepts only the exact Office authentication callback URL', () => {
    const origin = 'https://office.mergecom.test';
    expect(
      safeReturnTo(
        'https://office.mergecom.test/office-auth.html?callback=1',
        origin,
      ),
    ).toBe('https://office.mergecom.test/office-auth.html?callback=1');
    expect(
      safeReturnTo(
        'https://office.mergecom.test/office-auth.html?callback=1&next=evil',
        origin,
      ),
    ).toBe('/app');
    expect(
      safeReturnTo(
        'https://office.mergecom.test.evil/office-auth.html?callback=1',
        origin,
      ),
    ).toBe('/app');
  });
});

describe('production configuration', () => {
  it('accepts an explicit production dependency contract', () => {
    configureProductionEnvironment();

    const config = loadConfig();

    expect(config.nodeEnv).toBe('production');
    expect(config.logLevel).toBe('info');
    expect(config.trustedProxyHops).toBe(1);
    expect(config.invitationMail?.smtpUrl).toBe(process.env.SMTP_URL);
  });

  it.each(['DATABASE_URL', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])(
    'refuses a missing %s',
    (name) => {
      configureProductionEnvironment();
      delete process.env[name];

      expect(loadConfig).toThrow(`${name} is required`);
    },
  );

  it('validates production origins and operational settings', () => {
    configureProductionEnvironment();
    process.env.WEB_ORIGIN = 'http://app.mergecom.test';
    expect(loadConfig).toThrow('WEB_ORIGIN is invalid for production.');

    configureProductionEnvironment();
    process.env.TRUSTED_PROXY_HOPS = '-1';
    expect(loadConfig).toThrow('TRUSTED_PROXY_HOPS');

    configureProductionEnvironment();
    process.env.LOG_LEVEL = 'verbose';
    expect(loadConfig).toThrow('LOG_LEVEL is invalid.');
  });

  it('requires encrypted production data and mail transports', () => {
    configureProductionEnvironment();
    process.env.DATABASE_URL =
      'postgresql://mergecom:secret@db.mergecom.test/mergecom';
    expect(loadConfig).toThrow('DATABASE_URL must require TLS with sslmode.');

    configureProductionEnvironment();
    process.env.SMTP_URL = 'smtp://smtp.mergecom.test:25';
    expect(loadConfig).toThrow('SMTP_URL is invalid for production.');
  });
});
