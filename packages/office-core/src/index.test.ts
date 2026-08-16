import { describe, expect, it, vi } from 'vitest';

import {
  assertOfficeArtifact,
  captureExactOfficePackage,
  getExactCaptureSupport,
  type OfficeCompressedFile,
} from './index';

const packageBytes = Uint8Array.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00,
]);

function createOfficeFile(
  overrides: Partial<OfficeCompressedFile> = {},
): OfficeCompressedFile {
  const slices = [packageBytes.slice(0, 4), packageBytes.slice(4)];
  return {
    close: vi.fn().mockResolvedValue(undefined),
    getSlice: vi.fn((index: number) =>
      Promise.resolve({
        data: slices[index] ?? new Uint8Array(),
        index,
      }),
    ),
    size: packageBytes.byteLength,
    sliceCount: slices.length,
    ...overrides,
  };
}

describe('getExactCaptureSupport', () => {
  it.each([
    ['excel', 'pc'],
    ['excel', 'mac'],
    ['powerpoint', 'office-online'],
    ['powerpoint', 'ios'],
    ['word', 'pc'],
    ['word', 'ios'],
  ] as const)('supports %s on %s', (host, platform) => {
    expect(getExactCaptureSupport(host, platform, true)).toEqual({
      supported: true,
    });
  });

  it.each([
    ['excel', 'office-online'],
    ['excel', 'ios'],
    ['word', 'office-online'],
    ['powerpoint', 'android'],
    ['word', 'unknown'],
  ] as const)('rejects %s on %s', (host, platform) => {
    expect(getExactCaptureSupport(host, platform, true)).toMatchObject({
      code: 'platform-unsupported',
      supported: false,
    });
  });

  it('rejects runtimes without the compressed file requirement set', () => {
    expect(getExactCaptureSupport('powerpoint', 'pc', false)).toMatchObject({
      code: 'compressed-file-unavailable',
      supported: false,
    });
  });

  it('rejects macro-enabled Excel capture on Mac', () => {
    expect(
      getExactCaptureSupport('excel', 'mac', true, 'Signed forecast.xlsm'),
    ).toMatchObject({
      code: 'package-integrity-unsupported',
      supported: false,
    });
    expect(
      getExactCaptureSupport('excel', 'mac', true, 'Forecast.xlsx'),
    ).toEqual({ supported: true });
  });
});

describe('assertOfficeArtifact', () => {
  const descriptor = {
    contentLength: 10,
    fileName: 'Proposal.docx',
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sha256: 'a'.repeat(64),
    sourceHost: 'word' as const,
  };

  it('accepts a valid artifact', () => {
    expect(() => assertOfficeArtifact(descriptor)).not.toThrow();
  });

  it('rejects empty artifacts', () => {
    expect(() =>
      assertOfficeArtifact({ ...descriptor, contentLength: 0 }),
    ).toThrow('cannot be empty');
  });

  it('rejects an extension that does not belong to the source host', () => {
    expect(() =>
      assertOfficeArtifact({ ...descriptor, fileName: 'Proposal.xlsx' }),
    ).toThrow('not valid for the word host');
  });

  it('rejects a media type that does not match the extension', () => {
    expect(() =>
      assertOfficeArtifact({
        ...descriptor,
        mediaType: 'application/octet-stream',
      }),
    ).toThrow('does not match');
  });
});

describe('captureExactOfficePackage', () => {
  it('assembles, hashes, reports, and closes an exact package', async () => {
    const file = createOfficeFile();
    const onProgress = vi.fn();

    const capture = await captureExactOfficePackage(
      { openCompressedFile: vi.fn().mockResolvedValue(file) },
      {
        fileName: 'Forecast.xlsx',
        host: 'excel',
        onProgress,
        sliceSize: 4,
      },
    );

    expect(capture.bytes).toEqual(packageBytes);
    expect(capture.descriptor).toEqual({
      contentLength: 10,
      fileName: 'Forecast.xlsx',
      mediaType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sha256:
        'ce4eee426281b10649e13e62ba5c641d2216fdc46b858a03f86b5dfb60543f7f',
      sourceHost: 'excel',
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      bytesCaptured: 10,
      sliceCount: 2,
      slicesCaptured: 2,
      totalBytes: 10,
    });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it('rejects the package before reading slices when it exceeds the cap', async () => {
    const file = createOfficeFile({ size: 11 });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Deck.pptx', host: 'powerpoint', maxBytes: 10 },
      ),
    ).rejects.toThrow('capture limit is 10 bytes');
    expect(file.getSlice).not.toHaveBeenCalled();
    expect(file.close).toHaveBeenCalledOnce();
  });

  it('rejects a returned slice with the wrong index', async () => {
    const file = createOfficeFile({
      getSlice: vi.fn().mockResolvedValue({ data: packageBytes, index: 1 }),
    });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Memo.docx', host: 'word' },
      ),
    ).rejects.toThrow('expected slice 0');
    expect(file.close).toHaveBeenCalledOnce();
  });

  it('rejects slices whose total is shorter than the declared file size', async () => {
    const file = createOfficeFile({ size: packageBytes.byteLength + 1 });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Memo.docm', host: 'word' },
      ),
    ).rejects.toThrow('expected 11 bytes');
  });

  it('rejects non-ZIP data', async () => {
    const file = createOfficeFile({
      getSlice: vi.fn((index: number) =>
        Promise.resolve({
          data:
            index === 0 ? Uint8Array.from([1, 2, 3, 4]) : packageBytes.slice(4),
          index,
        }),
      ),
    });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Memo.docx', host: 'word' },
      ),
    ).rejects.toThrow('not an OOXML ZIP package');
  });

  it('rejects array-like slice values outside the byte range', async () => {
    const file = createOfficeFile({
      getSlice: vi.fn().mockResolvedValue({
        data: [0x50, 0x4b, 0x03, 0x04, 256, 0, 0, 0, 0, 0],
        index: 0,
      }),
      sliceCount: 1,
    });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Memo.docx', host: 'word' },
      ),
    ).rejects.toThrow('invalid byte at index 4');
    expect(file.close).toHaveBeenCalledOnce();
  });

  it('aborts between slices and closes the file', async () => {
    const controller = new AbortController();
    const file = createOfficeFile({
      getSlice: vi.fn((index: number) => {
        controller.abort();
        return Promise.resolve({ data: packageBytes.slice(0, 4), index });
      }),
    });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        {
          fileName: 'Forecast.xlsm',
          host: 'excel',
          signal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(file.close).toHaveBeenCalledOnce();
  });

  it('propagates a close failure after a successful capture', async () => {
    const file = createOfficeFile({
      close: vi.fn().mockRejectedValue(new Error('close failed')),
    });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Deck.pptm', host: 'powerpoint' },
      ),
    ).rejects.toThrow('close failed');
  });

  it('preserves the capture failure when closing also fails', async () => {
    const file = createOfficeFile({
      close: vi.fn().mockRejectedValue(new Error('close failed')),
      getSlice: vi.fn().mockResolvedValue({ data: packageBytes, index: 7 }),
    });

    await expect(
      captureExactOfficePackage(
        { openCompressedFile: vi.fn().mockResolvedValue(file) },
        { fileName: 'Deck.pptx', host: 'powerpoint' },
      ),
    ).rejects.toThrow('expected slice 0');
  });

  it('rejects filenames that do not match the Office host before opening', async () => {
    const openCompressedFile = vi.fn();

    await expect(
      captureExactOfficePackage(
        { openCompressedFile },
        { fileName: 'Deck.pptx', host: 'excel' },
      ),
    ).rejects.toThrow('not valid for the excel host');
    expect(openCompressedFile).not.toHaveBeenCalled();
  });
});
