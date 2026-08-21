export interface RenditionEngineConfig {
  fontPackVersion: string;
  host: string;
  internalToken: string;
  logLevel: 'debug' | 'error' | 'fatal' | 'info' | 'silent' | 'trace' | 'warn';
  maxInputBytes: number;
  maxOutputBytes: number;
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  qpdfPath: string;
  rendererProfile: string;
  rendererVersion: string;
  sofficePath: string;
  tempRoot: string;
  timeoutMilliseconds: number;
}

const LOG_LEVELS = new Set<RenditionEngineConfig['logLevel']>([
  'debug',
  'error',
  'fatal',
  'info',
  'silent',
  'trace',
  'warn',
]);

function configured(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function loadRenditionEngineConfig(): RenditionEngineConfig {
  const nodeEnv = (process.env.NODE_ENV ??
    'development') as RenditionEngineConfig['nodeEnv'];
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    throw new Error('NODE_ENV must be development, production, or test.');
  }
  const internalToken = configured(
    'RENDITION_ENGINE_INTERNAL_TOKEN',
    'mergecom-local-rendition-engine-token',
  );
  if (internalToken.length < 32) {
    throw new Error(
      'RENDITION_ENGINE_INTERNAL_TOKEN must be at least 32 characters.',
    );
  }
  if (
    nodeEnv === 'production' &&
    internalToken === 'mergecom-local-rendition-engine-token'
  ) {
    throw new Error('The local rendition token cannot be used in production.');
  }
  const rendererVersion = configured(
    'RENDITION_RENDERER_VERSION',
    'libreoffice-local',
  );
  if (nodeEnv === 'production' && rendererVersion.endsWith('-local')) {
    throw new Error('RENDITION_RENDERER_VERSION must be pinned in production.');
  }
  const logLevel = (process.env.LOG_LEVEL ??
    'info') as RenditionEngineConfig['logLevel'];
  if (!LOG_LEVELS.has(logLevel)) throw new Error('LOG_LEVEL is invalid.');

  return {
    fontPackVersion: configured(
      'RENDITION_FONT_PACK_VERSION',
      'mergecom-liberation-noto-v1',
    ),
    host: configured('RENDITION_ENGINE_HOST', '0.0.0.0'),
    internalToken,
    logLevel,
    maxInputBytes: positiveInteger(
      'RENDITION_MAX_INPUT_BYTES',
      100 * 1024 * 1024,
    ),
    maxOutputBytes: positiveInteger(
      'RENDITION_MAX_OUTPUT_BYTES',
      200 * 1024 * 1024,
    ),
    nodeEnv,
    port: positiveInteger('RENDITION_ENGINE_PORT', 3004),
    qpdfPath: configured('RENDITION_QPDF_PATH', 'qpdf'),
    rendererProfile: configured('RENDITION_RENDERER_PROFILE', 'office-pdf-v1'),
    rendererVersion,
    sofficePath: configured(
      'RENDITION_SOFFICE_PATH',
      process.platform === 'darwin'
        ? '/Applications/LibreOffice.app/Contents/MacOS/soffice'
        : 'soffice',
    ),
    tempRoot: configured('RENDITION_TEMP_ROOT', '/tmp/mergecom-renditions'),
    timeoutMilliseconds: positiveInteger(
      'RENDITION_TIMEOUT_MILLISECONDS',
      120_000,
    ),
  };
}
