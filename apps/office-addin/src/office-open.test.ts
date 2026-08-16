import { describe, expect, it, vi } from 'vitest';

import {
  MAX_OFFICE_OPEN_BYTES,
  getExactOpenSupport,
  openExactOfficePackage,
} from './office-open';

const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0xff]);
const expectedBase64 = 'UEsDBP8=';

describe('getExactOpenSupport', () => {
  it.each([
    ['excel', 'Forecast.xlsx'],
    ['powerpoint', 'Deck.PPTX'],
    ['word', 'Memo.docx'],
  ] as const)('supports a plain %s package', (host, fileName) => {
    expect(getExactOpenSupport(host, fileName, 10, true, true)).toEqual({
      supported: true,
    });
  });

  it('requires macro-enabled packages to be downloaded', () => {
    expect(
      getExactOpenSupport('powerpoint', 'Deck.pptm', 10, true, true),
    ).toMatchObject({
      supported: false,
      reason: expect.stringContaining('Macro'),
    });
  });

  it('requires packages above the in-memory cap to be downloaded', () => {
    expect(
      getExactOpenSupport(
        'excel',
        'Forecast.xlsx',
        MAX_OFFICE_OPEN_BYTES + 1,
        true,
        true,
      ),
    ).toMatchObject({
      supported: false,
      reason: expect.stringContaining('50 MB'),
    });
  });

  it('rejects a missing host API requirement set', () => {
    expect(
      getExactOpenSupport('word', 'Memo.docx', 10, false, true),
    ).toMatchObject({
      supported: false,
      reason: expect.stringContaining('runtime'),
    });
  });
});

describe('openExactOfficePackage', () => {
  it('opens a separate Excel workbook from exact base64 bytes', async () => {
    const createWorkbook = vi.fn().mockResolvedValue(undefined);
    await openExactOfficePackage('excel', bytes, { Excel: { createWorkbook } });
    expect(createWorkbook).toHaveBeenCalledWith(expectedBase64);
  });

  it('opens a separate PowerPoint presentation from exact base64 bytes', async () => {
    const createPresentation = vi.fn().mockResolvedValue(undefined);
    await openExactOfficePackage('powerpoint', bytes, {
      PowerPoint: { createPresentation },
    });
    expect(createPresentation).toHaveBeenCalledWith(expectedBase64);
  });

  it('creates, loads, and opens a separate Word document', async () => {
    const open = vi.fn();
    const sync = vi.fn().mockResolvedValue(undefined);
    const createDocument = vi.fn().mockReturnValue({ open });
    const run = vi.fn(async (batch: (context: never) => Promise<void>) =>
      batch({ application: { createDocument }, sync } as never),
    );

    await openExactOfficePackage('word', bytes, { Word: { run } });

    expect(createDocument).toHaveBeenCalledWith(expectedBase64);
    expect(sync).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledOnce();
  });
});
