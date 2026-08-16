import { describe, expect, it, vi } from 'vitest';

import { captureExactOfficePackage } from '@mergecom/office-core';

import { detectOfficeRuntime, getOfficeSliceSize } from './office-runtime';

const packageBytes = Uint8Array.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
]);

function createOfficeMock(overrides: Record<string, unknown> = {}) {
  const closeAsync = vi.fn((callback: (result: object) => void) => {
    callback({ status: 'succeeded', value: undefined });
  });
  const getSliceAsync = vi.fn(
    (index: number, callback: (result: object) => void) => {
      callback({
        status: 'succeeded',
        value: { data: Array.from(packageBytes), index },
      });
    },
  );
  const getFileAsync = vi.fn(
    (
      _fileType: string,
      _options: object,
      callback: (result: object) => void,
    ) => {
      callback({
        status: 'succeeded',
        value: {
          closeAsync,
          getSliceAsync,
          size: packageBytes.byteLength,
          sliceCount: 1,
        },
      });
    },
  );

  return {
    api: {
      AsyncResultStatus: { Succeeded: 'succeeded' },
      FileType: { Compressed: 'compressed' },
      HostType: {
        Excel: 'Excel',
        PowerPoint: 'PowerPoint',
        Word: 'Word',
      },
      PlatformType: {
        Android: 'Android',
        Mac: 'Mac',
        OfficeOnline: 'OfficeOnline',
        PC: 'PC',
        Universal: 'Universal',
        iOS: 'iOS',
      },
      context: {
        document: {
          getFileAsync,
          url: 'https://contoso.example/files/Forecast%20Q3.xlsx',
        },
        requirements: { isSetSupported: vi.fn().mockReturnValue(true) },
      },
      onReady: vi.fn().mockResolvedValue({ host: 'Excel', platform: 'PC' }),
      ...overrides,
    },
    closeAsync,
    getFileAsync,
    getSliceAsync,
  };
}

describe('detectOfficeRuntime', () => {
  it('maps the host and captures through the callback Office APIs', async () => {
    const office = createOfficeMock();
    const runtime = await detectOfficeRuntime(office.api);

    expect(runtime).toMatchObject({
      compressedFileAvailable: true,
      fileName: 'Forecast Q3.xlsx',
      host: 'excel',
      platform: 'pc',
    });
    if (runtime === null || runtime.fileName === null) {
      throw new Error('Expected an Excel Office runtime.');
    }

    const capture = await captureExactOfficePackage(runtime.provider, {
      fileName: runtime.fileName,
      host: runtime.host,
    });
    expect(capture.bytes).toEqual(packageBytes);
    expect(office.getFileAsync).toHaveBeenCalledWith(
      'compressed',
      { sliceSize: 4 * 1024 * 1024 },
      expect.any(Function),
    );
    expect(office.getSliceAsync).toHaveBeenCalledOnce();
    expect(office.closeAsync).toHaveBeenCalledOnce();
  });

  it('returns null when Office.js is unavailable', async () => {
    expect(await detectOfficeRuntime()).toBeNull();
  });

  it('returns null for an unsupported Office host', async () => {
    const office = createOfficeMock({
      onReady: vi
        .fn()
        .mockResolvedValue({ host: 'Outlook', platform: 'OfficeOnline' }),
    });
    expect(await detectOfficeRuntime(office.api)).toBeNull();
  });

  it('does not invent a filename for an unsaved document', async () => {
    const office = createOfficeMock();
    office.api.context.document.url = '';
    expect(await detectOfficeRuntime(office.api)).toMatchObject({
      fileName: null,
    });
  });

  it('propagates a useful Office open failure', async () => {
    const office = createOfficeMock();
    office.api.context.document.getFileAsync = vi.fn(
      (
        _fileType: string,
        _options: object,
        callback: (result: object) => void,
      ) => {
        callback({ error: { message: 'Document is busy.' }, status: 'failed' });
      },
    );
    const runtime = await detectOfficeRuntime(office.api);
    if (runtime === null) throw new Error('Expected an Office runtime.');

    await expect(runtime.provider.openCompressedFile(1024)).rejects.toThrow(
      'Document is busy.',
    );
  });
});

describe('getOfficeSliceSize', () => {
  it('uses the iPad limit and the standard Office limit', () => {
    expect(getOfficeSliceSize('ios')).toBe(64 * 1024);
    expect(getOfficeSliceSize('pc')).toBe(4 * 1024 * 1024);
  });
});
