import { describe, expect, it, vi } from 'vitest';

import { captureExactOfficePackage } from '@mergecom/office-core';

import { detectOfficeRuntime, getOfficeSliceSize } from './office-runtime';

const packageBytes = Uint8Array.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00,
]);

function createOfficeMock(overrides: Record<string, unknown> = {}) {
  const savedSettings = new Map<string, unknown>();
  const dialogHandlers = new Map<
    string,
    (event: { error?: number; message?: string }) => void
  >();
  const closeDialog = vi.fn();
  const displayDialogAsync = vi.fn(
    (_url: string, _options: object, callback: (result: object) => void) => {
      callback({
        status: 'succeeded',
        value: {
          addEventHandler: (
            eventType: string,
            handler: (event: { error?: number; message?: string }) => void,
          ) => dialogHandlers.set(eventType, handler),
          close: closeDialog,
        },
      });
    },
  );
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
  const getFilePropertiesAsync = vi.fn((callback: (result: object) => void) => {
    callback({
      status: 'succeeded',
      value: {
        url: 'https://contoso.example/files/Forecast%20Q3.xlsx',
      },
    });
  });

  return {
    api: {
      AsyncResultStatus: { Succeeded: 'succeeded' },
      EventType: {
        DialogEventReceived: 'dialog-event',
        DialogMessageReceived: 'dialog-message',
      },
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
          getFilePropertiesAsync,
          settings: {
            get: vi.fn((name: string) => savedSettings.get(name) ?? null),
            remove: vi.fn((name: string) => savedSettings.delete(name)),
            saveAsync: vi.fn((callback: (result: object) => void) => {
              callback({ status: 'succeeded', value: undefined });
            }),
            set: vi.fn((name: string, value: unknown) => {
              savedSettings.set(name, value);
            }),
          },
          url: 'https://contoso.example/files/Forecast%20Q3.xlsx',
        },
        requirements: { isSetSupported: vi.fn().mockReturnValue(true) },
        ui: { displayDialogAsync, openBrowserWindow: vi.fn() },
      },
      onReady: vi.fn().mockResolvedValue({ host: 'Excel', platform: 'PC' }),
      ...overrides,
    },
    closeAsync,
    closeDialog,
    dialogHandlers,
    displayDialogAsync,
    getFileAsync,
    getFilePropertiesAsync,
    getSliceAsync,
    savedSettings,
  };
}

describe('detectOfficeRuntime', () => {
  it('maps the host and captures through the callback Office APIs', async () => {
    const office = createOfficeMock();
    const createWorkbook = vi.fn().mockResolvedValue(undefined);
    const runtime = await detectOfficeRuntime(office.api, {
      Excel: { createWorkbook },
    });

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
    expect(runtime.exactOpenSupport('Forecast Q3.xlsx', 10)).toEqual({
      supported: true,
    });
    await runtime.openExactPackage(packageBytes);
    expect(createWorkbook).toHaveBeenCalledOnce();
  });

  it('reports when the host cannot open a package copy', async () => {
    const office = createOfficeMock();
    const runtime = await detectOfficeRuntime(office.api, {});
    if (runtime === null) throw new Error('Expected an Office runtime.');

    expect(runtime.exactOpenSupport('Forecast Q3.xlsx', 10)).toMatchObject({
      reason: expect.stringContaining('cannot open'),
      supported: false,
    });
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
    office.api.context.document.getFilePropertiesAsync = vi.fn(
      (callback: (result: object) => void) => {
        callback({ status: 'succeeded', value: { url: '' } });
      },
    );
    expect(await detectOfficeRuntime(office.api)).toMatchObject({
      fileName: null,
    });
  });

  it('uses file properties when Mac PowerPoint omits document.url', async () => {
    const office = createOfficeMock({
      onReady: vi
        .fn()
        .mockResolvedValue({ host: 'PowerPoint', platform: 'Mac' }),
    });
    office.api.context.document.url = '';
    office.api.context.document.getFilePropertiesAsync = vi.fn(
      (callback: (result: object) => void) => {
        callback({
          status: 'succeeded',
          value: {
            url: '/Users/person/Downloads/Quarterly%20Review.pptx',
          },
        });
      },
    );

    await expect(detectOfficeRuntime(office.api)).resolves.toMatchObject({
      documentUrl: '/Users/person/Downloads/Quarterly%20Review.pptx',
      fileName: 'Quarterly Review.pptx',
      host: 'powerpoint',
      platform: 'mac',
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

  it('persists and clears non-secret document binding identifiers', async () => {
    const office = createOfficeMock();
    const runtime = await detectOfficeRuntime(office.api);
    if (runtime === null) throw new Error('Expected an Office runtime.');
    const binding = {
      documentId: '60000000-0000-4000-8000-000000000002',
      documentKind: 'spreadsheet' as const,
      organizationId: '10000000-0000-4000-8000-000000000001',
      projectId: '40000000-0000-4000-8000-000000000001',
      schemaVersion: 1 as const,
    };

    await runtime.bindingStore.save(binding);
    expect(runtime.bindingStore.load()).toEqual(binding);
    await runtime.bindingStore.clear();
    expect(runtime.bindingStore.load()).toBeNull();
  });

  it('accepts a valid one-use session code from the Office dialog', async () => {
    const office = createOfficeMock();
    const runtime = await detectOfficeRuntime(office.api);
    if (runtime === null) throw new Error('Expected an Office runtime.');

    const authentication = runtime.requestAuthentication(
      'https://localhost:5176/office-auth.html',
    );
    expect(office.displayDialogAsync).toHaveBeenCalledWith(
      'https://localhost:5176/office-auth.html',
      { height: 60, promptBeforeOpen: false, width: 40 },
      expect.any(Function),
    );
    office.dialogHandlers.get('dialog-message')?.({
      message: JSON.stringify({
        code: `office_handoff_${'a'.repeat(43)}`,
        type: 'mergecom-office-session',
      }),
    });

    await expect(authentication).resolves.toBe(
      `office_handoff_${'a'.repeat(43)}`,
    );
    expect(office.closeDialog).toHaveBeenCalledOnce();
  });

  it('rejects an invalid Office dialog message', async () => {
    const office = createOfficeMock();
    const runtime = await detectOfficeRuntime(office.api);
    if (runtime === null) throw new Error('Expected an Office runtime.');

    const authentication = runtime.requestAuthentication(
      'https://localhost:5176/office-auth.html',
    );
    office.dialogHandlers.get('dialog-message')?.({
      message: JSON.stringify({ code: 'stolen-session', type: 'other' }),
    });

    await expect(authentication).rejects.toThrow('invalid response');
    expect(office.closeDialog).toHaveBeenCalledOnce();
  });
});

describe('getOfficeSliceSize', () => {
  it('uses the iPad limit and the standard Office limit', () => {
    expect(getOfficeSliceSize('ios')).toBe(64 * 1024);
    expect(getOfficeSliceSize('pc')).toBe(4 * 1024 * 1024);
  });
});
