import { createHash } from 'node:crypto';

import type { ClaimedRenditionJob, RenditionResult } from './types';
import { PermanentProcessingError } from './types';

interface RenditionManifest {
  byteCount: number;
  dimensions: Array<{ height: number; width: number }>;
  fontPackVersion: string;
  outputSha256: string;
  pageCount: number;
  rendererProfile: string;
  rendererVersion: string;
  warnings: string[];
}

export class RenditionEngineClient {
  public constructor(
    private readonly endpoint: string,
    private readonly internalToken: string,
  ) {}

  public async probe(): Promise<boolean> {
    try {
      const response = await fetch(new URL('/health/ready', this.endpoint), {
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  public async render(
    job: ClaimedRenditionJob,
    artifact: Uint8Array,
  ): Promise<RenditionResult> {
    const body = new Uint8Array(artifact.byteLength);
    body.set(artifact);
    const response = await fetch(
      new URL('/internal/v1/renditions', this.endpoint),
      {
        body: body.buffer,
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-MergeCom-Extension': job.extension,
          'X-MergeCom-Internal-Token': this.internalToken,
          'X-MergeCom-Source-Sha256': job.artifactSha256,
          'X-MergeCom-Trace-Id': job.traceId,
        },
        method: 'POST',
        signal: AbortSignal.timeout(150_000),
      },
    );
    if (!response.ok) {
      const error = await readError(response);
      if (response.status >= 500) {
        throw new Error(`Rendition engine unavailable: ${error.code}.`);
      }
      throw new PermanentProcessingError(error.code, error.message);
    }
    const encoded = response.headers.get('x-mergecom-rendition-manifest');
    if (!encoded) return invalidContract();
    let manifest: RenditionManifest;
    try {
      manifest = parseManifest(
        JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
      );
    } catch {
      return invalidContract();
    }
    const pdf = new Uint8Array(await response.arrayBuffer());
    const actualSha256 = createHash('sha256').update(pdf).digest('hex');
    if (
      manifest.byteCount !== pdf.byteLength ||
      manifest.outputSha256 !== actualSha256 ||
      manifest.rendererProfile !== job.rendererProfile ||
      manifest.rendererVersion !== job.rendererVersion ||
      manifest.fontPackVersion !== job.fontPackVersion
    ) {
      return invalidContract();
    }
    return { ...manifest, pdf };
  }
}

function parseManifest(value: unknown): RenditionManifest {
  if (!isObject(value)) return invalidContract();
  if (
    !Number.isSafeInteger(value.byteCount) ||
    Number(value.byteCount) <= 0 ||
    !Number.isSafeInteger(value.pageCount) ||
    Number(value.pageCount) <= 0 ||
    typeof value.fontPackVersion !== 'string' ||
    typeof value.outputSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.outputSha256) ||
    typeof value.rendererProfile !== 'string' ||
    typeof value.rendererVersion !== 'string' ||
    !Array.isArray(value.dimensions) ||
    !Array.isArray(value.warnings)
  ) {
    return invalidContract();
  }
  const dimensions = value.dimensions.map((item) => {
    if (
      !isObject(item) ||
      typeof item.height !== 'number' ||
      typeof item.width !== 'number' ||
      !Number.isFinite(item.height) ||
      !Number.isFinite(item.width) ||
      item.height <= 0 ||
      item.width <= 0
    ) {
      return invalidContract();
    }
    return { height: item.height, width: item.width };
  });
  const warnings = value.warnings.map((item) => {
    if (typeof item !== 'string') return invalidContract();
    return item;
  });
  if (dimensions.length !== value.pageCount) return invalidContract();
  return {
    byteCount: Number(value.byteCount),
    dimensions,
    fontPackVersion: value.fontPackVersion,
    outputSha256: value.outputSha256,
    pageCount: Number(value.pageCount),
    rendererProfile: value.rendererProfile,
    rendererVersion: value.rendererVersion,
    warnings,
  };
}

async function readError(response: Response) {
  try {
    const value: unknown = await response.json();
    if (
      isObject(value) &&
      typeof value.code === 'string' &&
      typeof value.message === 'string'
    ) {
      return { code: value.code, message: value.message };
    }
  } catch {
    // Invalid dependency errors are collapsed below.
  }
  return {
    code: 'invalid_rendition_engine_response',
    message: 'The rendition engine returned an invalid error contract.',
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidContract(): never {
  throw new PermanentProcessingError(
    'invalid_rendition_engine_response',
    'The rendition engine returned an invalid success contract.',
  );
}
