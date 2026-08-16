import { afterEach, describe, expect, it } from 'vitest';

import { loadWorkerConfig } from './config';

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

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
