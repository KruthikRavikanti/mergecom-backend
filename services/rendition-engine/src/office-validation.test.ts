import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateOfficePackage } from './office-validation';

const fixtures = resolve(process.cwd(), '../../packages/test-fixtures/office');

describe('Office package validation', () => {
  it('accepts structurally valid standard OOXML packages', async () => {
    await expect(
      validateOfficePackage(
        await readFile(resolve(fixtures, 'visual-word.docx')),
        '.docx',
        10 * 1024 * 1024,
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects renamed text and macro-bearing packages before rendering', async () => {
    for (const [name, code] of [
      ['corrupt-office.docx', 'invalid_office_package'],
      ['macro-word.docm', 'macro_enabled_package'],
    ] as const) {
      await expect(
        validateOfficePackage(
          await readFile(resolve(fixtures, name)),
          '.docx',
          10 * 1024 * 1024,
        ),
      ).rejects.toEqual(expect.objectContaining({ code }));
    }
  });

  it('rejects external package relationships before conversion', async () => {
    await expect(
      validateOfficePackage(
        await readFile(resolve(fixtures, 'external-link-excel.xlsx')),
        '.xlsx',
        10 * 1024 * 1024,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'external_relationships_not_allowed' }),
    );
  });

  it('rejects encrypted entries and bounded expansion before conversion', async () => {
    const source = await readFile(resolve(fixtures, 'visual-word.docx'));
    const encrypted = Buffer.from(source);
    for (let offset = 0; offset <= encrypted.byteLength - 10; offset += 1) {
      const signature = encrypted.readUInt32LE(offset);
      if (signature === 0x04034b50) {
        encrypted.writeUInt16LE(
          encrypted.readUInt16LE(offset + 6) | 1,
          offset + 6,
        );
      }
      if (signature === 0x02014b50) {
        encrypted.writeUInt16LE(
          encrypted.readUInt16LE(offset + 8) | 1,
          offset + 8,
        );
      }
    }
    await expect(
      validateOfficePackage(encrypted, '.docx', 10 * 1024 * 1024),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'encrypted_office_package' }),
    );
    await expect(validateOfficePackage(source, '.docx', 1)).rejects.toEqual(
      expect.objectContaining({ code: 'office_package_limit_exceeded' }),
    );
  });
});
