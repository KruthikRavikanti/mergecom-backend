import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import type { RenditionEngineConfig } from './config.js';
import {
  OfficePackageValidationError,
  validateOfficePackage,
} from './office-validation.js';
import { PdfValidationError, validatePdf } from './pdf-validation.js';

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.pptx', '.xlsx']);

export class RenditionError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
  }
}

export interface RenditionManifest {
  byteCount: number;
  dimensions: Array<{ height: number; width: number }>;
  fontPackVersion: string;
  outputSha256: string;
  pageCount: number;
  rendererProfile: string;
  rendererVersion: string;
  warnings: string[];
}

export interface RenditionOutput {
  manifest: RenditionManifest;
  pdf: Uint8Array;
}

export interface RenditionInput {
  bytes: Uint8Array;
  extension: string;
  sourceSha256: string;
  traceId: string;
}

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

export class OfficeRenderer {
  public constructor(private readonly config: RenditionEngineConfig) {}

  public async probe(): Promise<boolean> {
    try {
      const [soffice, qpdf] = await Promise.all([
        runCommand(this.config.sofficePath, ['--version'], 5_000),
        runCommand(this.config.qpdfPath, ['--version'], 5_000),
      ]);
      return soffice.code === 0 && qpdf.code === 0;
    } catch {
      return false;
    }
  }

  public async render(input: RenditionInput): Promise<RenditionOutput> {
    const extension = input.extension.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new RenditionError('unsupported_office_format', false);
    }
    if (input.bytes.byteLength > this.config.maxInputBytes) {
      throw new RenditionError('rendition_input_too_large', false);
    }
    if (
      createHash('sha256').update(input.bytes).digest('hex') !==
      input.sourceSha256
    ) {
      throw new RenditionError('rendition_source_hash_mismatch', false);
    }
    try {
      await validateOfficePackage(
        input.bytes,
        extension,
        this.config.maxInputBytes * 10,
      );
    } catch (error) {
      if (error instanceof OfficePackageValidationError) {
        throw new RenditionError(error.code, false);
      }
      throw error;
    }

    await mkdir(this.config.tempRoot, { recursive: true, mode: 0o700 });
    const directory = await mkdtemp(join(this.config.tempRoot, 'job-'));
    const profile = join(directory, `profile-${randomUUID()}`);
    const source = join(directory, `source${extension}`);
    const converted = join(directory, 'source.pdf');
    const normalized = join(directory, 'validated.pdf');
    try {
      await mkdir(profile, { mode: 0o700 });
      await writeFile(source, input.bytes, { mode: 0o600 });
      const profileUrl = new URL(`file://${profile}/`).href;
      const conversion = await runCommand(
        this.config.sofficePath,
        [
          '--headless',
          '--nologo',
          '--nodefault',
          '--nofirststartwizard',
          '--nolockcheck',
          `-env:UserInstallation=${profileUrl}`,
          '--convert-to',
          'pdf',
          '--outdir',
          directory,
          source,
        ],
        this.config.timeoutMilliseconds,
        {
          HOME: profile,
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
          TMPDIR: directory,
        },
      );
      if (conversion.signal === 'SIGTERM') {
        throw new RenditionError('rendition_timeout', true);
      }
      if (conversion.code !== 0) {
        throw new RenditionError('rendition_conversion_failed', false);
      }
      const outputStat = await stat(converted).catch(() => null);
      if (!outputStat || outputStat.size <= 0) {
        throw new RenditionError('rendition_output_missing', false);
      }
      if (outputStat.size > this.config.maxOutputBytes) {
        throw new RenditionError('rendition_output_too_large', false);
      }
      const checked = await runCommand(
        this.config.qpdfPath,
        ['--check', converted],
        15_000,
      );
      if (checked.code !== 0) {
        throw new RenditionError('pdf_invalid', false);
      }
      const normalizedResult = await runCommand(
        this.config.qpdfPath,
        ['--qdf', '--object-streams=disable', converted, normalized],
        30_000,
      );
      if (normalizedResult.code !== 0) {
        throw new RenditionError('pdf_normalization_failed', false);
      }
      const normalizedBytes = await readFile(normalized);
      let facts;
      try {
        facts = validatePdf(normalizedBytes);
      } catch (error) {
        if (error instanceof PdfValidationError) {
          throw new RenditionError(error.code, false);
        }
        throw error;
      }
      const pdf = new Uint8Array(await readFile(converted));
      const outputSha256 = createHash('sha256').update(pdf).digest('hex');
      return {
        manifest: {
          byteCount: pdf.byteLength,
          dimensions: facts.dimensions,
          fontPackVersion: this.config.fontPackVersion,
          outputSha256,
          pageCount: facts.pageCount,
          rendererProfile: this.config.rendererProfile,
          rendererVersion: this.config.rendererVersion,
          warnings: ['preview_is_visually_representative'],
        },
        pdf,
      };
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  }
}

function runCommand(
  command: string,
  args: string[],
  timeoutMilliseconds: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const append = (current: string, chunk: Buffer) =>
      `${current}${chunk.toString('utf8')}`.slice(-8_192);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', reject);
    const timeout = setTimeout(
      () => child.kill('SIGTERM'),
      timeoutMilliseconds,
    );
    timeout.unref();
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stderr, stdout });
    });
  });
}
