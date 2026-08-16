import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SignedBlobGrant } from './api';
import { downloadBlob } from './blob-download';

class FakeXmlHttpRequest {
  public static current: FakeXmlHttpRequest | undefined;

  public response: ArrayBuffer | null = null;
  public responseType = '';
  public status = 0;

  private readonly listeners = new Map<string, Array<(event: Event) => void>>();

  public constructor() {
    FakeXmlHttpRequest.current = this;
  }

  public abort(): void {
    this.emit('abort');
  }

  public addEventListener(
    name: string,
    listener: (event: Event) => void,
  ): void {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  public getResponseHeader(): string | null {
    return null;
  }

  public open = vi.fn();
  public send = vi.fn();
  public setRequestHeader = vi.fn();

  public respond(bytes: Uint8Array, status = 200): void {
    this.response = bytes.slice().buffer;
    this.status = status;
    this.emit('progress', {
      loaded: bytes.byteLength,
      total: bytes.byteLength,
    });
    this.emit('load');
  }

  private emit(name: string, values: Partial<ProgressEvent> = {}): void {
    const event = { type: name, ...values } as ProgressEvent;
    this.listeners.get(name)?.forEach((listener) => listener(event));
  }
}

const grant: SignedBlobGrant = {
  expiresAt: '2099-01-01T00:00:00.000Z',
  headers: { 'x-test': 'one' },
  method: 'GET',
  url: 'https://storage.example/exact.docx?signature=abc',
};

afterEach(() => {
  vi.unstubAllGlobals();
  FakeXmlHttpRequest.current = undefined;
});

describe('downloadBlob', () => {
  it('downloads exact binary bytes and reports progress', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    const onProgress = vi.fn();
    const promise = downloadBlob(grant, 4, onProgress);
    const request = FakeXmlHttpRequest.current;
    if (!request) throw new Error('Expected an XHR request.');

    expect(request.open).toHaveBeenCalledWith('GET', grant.url);
    expect(request.setRequestHeader).toHaveBeenCalledWith('x-test', 'one');
    expect(request.responseType).toBe('arraybuffer');
    request.respond(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]));

    await expect(promise).resolves.toEqual(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
    );
    expect(onProgress).toHaveBeenCalledWith({ loaded: 4, total: 4 });
  });

  it('rejects a response with a different byte count', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    const promise = downloadBlob(grant, 5, vi.fn());
    FakeXmlHttpRequest.current?.respond(
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
    );

    await expect(promise).rejects.toThrow('returned 4 bytes; expected 5 bytes');
  });

  it('aborts the object request through an AbortSignal', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    const controller = new AbortController();
    const promise = downloadBlob(grant, 4, vi.fn(), controller.signal);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects upload grants before creating a request', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    await expect(
      downloadBlob({ ...grant, method: 'PUT' }, 4, vi.fn()),
    ).rejects.toThrow('must use GET');
    expect(FakeXmlHttpRequest.current).toBeUndefined();
  });
});
