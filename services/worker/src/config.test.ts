import { afterEach, describe, expect, it } from 'vitest';

import { loadWorkerConfig } from './config';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

function configureProductionEnvironment(): void {
  process.env = {
    ...originalEnvironment,
    DATABASE_URL:
      'postgresql://mergecom:secret@db.mergecom.test/mergecom?sslmode=require',
    DOCUMENT_ENGINE_INTERNAL_TOKEN:
      'production-document-engine-token-at-least-32-chars',
    DOCUMENT_ENGINE_URL: 'http://document-engine:3003',
    NODE_ENV: 'production',
    NOTIFICATION_FROM: 'MergeCom <no-reply@mergecom.test>',
    REDIS_URL: 'rediss://cache.mergecom.test:6379',
    S3_ACCESS_KEY: 'storage-access',
    S3_ENDPOINT: 'https://storage.mergecom.test',
    S3_SECRET_KEY: 'storage-secret',
    SMTP_URL: 'smtps://mailer:secret@smtp.mergecom.test:465',
    WEB_ORIGIN: 'https://app.mergecom.test',
  };
}

describe('PowerPoint automatic merge configuration', () => {
  it('defaults to disabled with an empty pilot allowlist', () => {
    delete process.env.POWERPOINT_AUTOMATIC_MERGE_ENABLED;
    delete process.env.POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS;
    delete process.env.EXCEL_AUTOMATIC_MERGE_ENABLED;
    delete process.env.EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS;

    const config = loadWorkerConfig();

    expect(config.powerPointAutomaticMergeEnabled).toBe(false);
    expect(config.powerPointAutomaticMergePilotOrganizationIds).toEqual([]);
    expect(config.excelAutomaticMergeEnabled).toBe(false);
    expect(config.excelAutomaticMergePilotOrganizationIds).toEqual([]);
  });

  it('validates flags and canonicalizes unique pilot organization IDs', () => {
    process.env.POWERPOINT_AUTOMATIC_MERGE_ENABLED = 'true';
    process.env.POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS =
      '10000000-0000-4000-8000-00000000000A,10000000-0000-4000-8000-00000000000a';

    const config = loadWorkerConfig();

    expect(config.powerPointAutomaticMergeEnabled).toBe(true);
    expect(config.powerPointAutomaticMergePilotOrganizationIds).toEqual([
      '10000000-0000-4000-8000-00000000000a',
    ]);

    process.env.POWERPOINT_AUTOMATIC_MERGE_ENABLED = 'yes';
    expect(loadWorkerConfig).toThrow(
      'POWERPOINT_AUTOMATIC_MERGE_ENABLED must be true or false.',
    );

    process.env.POWERPOINT_AUTOMATIC_MERGE_ENABLED = 'false';
    process.env.POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS = 'alpha';
    expect(loadWorkerConfig).toThrow(
      'POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS must contain comma-separated UUIDs.',
    );
  });
});

describe('Excel automatic merge configuration', () => {
  it('validates flags and canonicalizes unique pilot organization IDs', () => {
    process.env.EXCEL_AUTOMATIC_MERGE_ENABLED = 'true';
    process.env.EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS =
      '20000000-0000-4000-8000-00000000000B,20000000-0000-4000-8000-00000000000b';

    const config = loadWorkerConfig();

    expect(config.excelAutomaticMergeEnabled).toBe(true);
    expect(config.excelAutomaticMergePilotOrganizationIds).toEqual([
      '20000000-0000-4000-8000-00000000000b',
    ]);

    process.env.EXCEL_AUTOMATIC_MERGE_ENABLED = '1';
    expect(loadWorkerConfig).toThrow(
      'EXCEL_AUTOMATIC_MERGE_ENABLED must be true or false.',
    );

    process.env.EXCEL_AUTOMATIC_MERGE_ENABLED = 'false';
    process.env.EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS = 'beta';
    expect(loadWorkerConfig).toThrow(
      'EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS must contain comma-separated UUIDs.',
    );
  });
});

describe('production worker configuration', () => {
  it('accepts explicit production dependencies without local fallbacks', () => {
    configureProductionEnvironment();

    const config = loadWorkerConfig();

    expect(config.databaseUrl).toBe(process.env.DATABASE_URL);
    expect(config.redisUrl).toBe(process.env.REDIS_URL);
    expect(config.logLevel).toBe('info');
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'])(
    'refuses a missing %s',
    (name) => {
      configureProductionEnvironment();
      delete process.env[name];

      expect(loadWorkerConfig).toThrow(`${name} is required`);
    },
  );

  it('rejects local or insecure external production dependencies', () => {
    configureProductionEnvironment();
    process.env.REDIS_URL = 'redis://localhost:6379';
    expect(loadWorkerConfig).toThrow('REDIS_URL is invalid for production.');

    configureProductionEnvironment();
    process.env.S3_ENDPOINT = 'http://storage.mergecom.test';
    expect(loadWorkerConfig).toThrow('S3_ENDPOINT is invalid for production.');

    configureProductionEnvironment();
    process.env.DATABASE_URL =
      'postgresql://mergecom:secret@db.mergecom.test/mergecom';
    expect(loadWorkerConfig).toThrow(
      'DATABASE_URL must require TLS with sslmode.',
    );

    configureProductionEnvironment();
    process.env.SMTP_URL = 'smtp://smtp.mergecom.test:25';
    expect(loadWorkerConfig).toThrow('SMTP_URL is invalid for production.');
  });
});
