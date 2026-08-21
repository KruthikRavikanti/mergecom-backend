import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const imageNames = [
  'MERGECOM_API_IMAGE',
  'MERGECOM_WORKER_IMAGE',
  'MERGECOM_DOCUMENT_ENGINE_IMAGE',
  'MERGECOM_WEB_IMAGE',
  'MERGECOM_OFFICE_ADDIN_IMAGE',
];

const requiredNames = [
  ...imageNames,
  'API_PUBLIC_ORIGIN',
  'DATABASE_URL',
  'DOCUMENT_ENGINE_INTERNAL_TOKEN',
  'INVITATION_FROM',
  'NOTIFICATION_FROM',
  'OFFICE_ADDIN_ORIGIN',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_ISSUER',
  'REDIS_URL',
  'S3_ACCESS_KEY',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_SECRET_KEY',
  'SMTP_URL',
  'WEB_ORIGIN',
];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseEnvironment(source) {
  const environment = {};
  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new Error(`Line ${index + 1} is not a NAME=value assignment.`);
    }
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name)) {
      throw new Error(`Line ${index + 1} has an invalid variable name.`);
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (Object.hasOwn(environment, name)) {
      throw new Error(`${name} is assigned more than once.`);
    }
    environment[name] = value;
  }
  return environment;
}

function required(environment, name) {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  if (value.includes('REPLACE_ME')) {
    throw new Error(`${name} still contains a placeholder.`);
  }
  return value;
}

function url(environment, name, protocols) {
  const value = required(environment, name);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL.`);
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new Error(`${name} must use ${protocols.join(' or ')}.`);
  }
  if (
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1'
  ) {
    throw new Error(`${name} cannot use a loopback host.`);
  }
  return parsed;
}

function origin(environment, name) {
  const parsed = url(environment, name, ['https:']);
  if (parsed.origin !== environment[name]) {
    throw new Error(`${name} must contain only an HTTPS origin.`);
  }
  return parsed.origin;
}

function boolean(environment, name, fallback) {
  const value = environment[name] || fallback;
  if (value !== 'true' && value !== 'false') {
    throw new Error(`${name} must be true or false.`);
  }
  return value === 'true';
}

function positivePort(environment, name, fallback) {
  const value = Number(environment[name] || fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${name} must be an integer from 1 through 65535.`);
  }
}

function validatePilotAllowlist(environment, feature, allowlist) {
  const enabled = boolean(environment, feature, 'false');
  const values = (environment[allowlist] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.some((value) => !uuidPattern.test(value))) {
    throw new Error(`${allowlist} must contain comma-separated UUIDs.`);
  }
  if (enabled && values.length === 0) {
    throw new Error(`${feature} requires a non-empty ${allowlist}.`);
  }
}

export function validateConfiguration(environment, options = {}) {
  for (const name of requiredNames) required(environment, name);
  boolean(environment, 'MERGECOM_SYNTHETIC_CONFIG', 'false');
  if (
    environment.MERGECOM_SYNTHETIC_CONFIG === 'true' &&
    !options.allowSynthetic
  ) {
    throw new Error('Synthetic validation configuration cannot be deployed.');
  }

  for (const name of imageNames) {
    if (!/^.+@sha256:[0-9a-f]{64}$/u.test(environment[name])) {
      throw new Error(`${name} must be an immutable sha256 image reference.`);
    }
  }

  const webOrigin = origin(environment, 'WEB_ORIGIN');
  const officeOrigin = origin(environment, 'OFFICE_ADDIN_ORIGIN');
  if (webOrigin === officeOrigin) {
    throw new Error('WEB_ORIGIN and OFFICE_ADDIN_ORIGIN must be distinct.');
  }
  const publicApi = url(environment, 'API_PUBLIC_ORIGIN', ['https:']);
  if (publicApi.href !== `${webOrigin}/api`) {
    throw new Error('API_PUBLIC_ORIGIN must be WEB_ORIGIN followed by /api.');
  }

  const database = url(environment, 'DATABASE_URL', [
    'postgres:',
    'postgresql:',
  ]);
  if (
    !['require', 'verify-ca', 'verify-full'].includes(
      database.searchParams.get('sslmode'),
    )
  ) {
    throw new Error('DATABASE_URL must require TLS with sslmode.');
  }
  url(environment, 'REDIS_URL', ['rediss:']);
  url(environment, 'S3_ENDPOINT', ['https:']);
  url(environment, 'SMTP_URL', ['smtps:']);
  url(environment, 'OIDC_ISSUER', ['https:']);

  if (environment.DOCUMENT_ENGINE_INTERNAL_TOKEN.length < 32) {
    throw new Error(
      'DOCUMENT_ENGINE_INTERNAL_TOKEN must be at least 32 characters.',
    );
  }
  if (
    !['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'].includes(
      environment.LOG_LEVEL || 'info',
    )
  ) {
    throw new Error('LOG_LEVEL is invalid.');
  }
  const proxyHops = Number(environment.TRUSTED_PROXY_HOPS || '2');
  if (!Number.isSafeInteger(proxyHops) || proxyHops < 1 || proxyHops > 4) {
    throw new Error('TRUSTED_PROXY_HOPS must be an integer from 1 through 4.');
  }

  const webPort = Number(environment.WEB_PORT || '8080');
  const officePort = Number(environment.OFFICE_PORT || '8081');
  positivePort(environment, 'WEB_PORT', '8080');
  positivePort(environment, 'OFFICE_PORT', '8081');
  if (webPort === officePort) {
    throw new Error('WEB_PORT and OFFICE_PORT must be distinct.');
  }
  for (const name of ['WEB_BIND_ADDRESS', 'OFFICE_BIND_ADDRESS']) {
    if ((environment[name] || '127.0.0.1') !== '127.0.0.1') {
      throw new Error(`${name} must bind to 127.0.0.1.`);
    }
  }
  boolean(environment, 'S3_FORCE_PATH_STYLE', 'false');
  validatePilotAllowlist(
    environment,
    'POWERPOINT_AUTOMATIC_MERGE_ENABLED',
    'POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS',
  );
  validatePilotAllowlist(
    environment,
    'EXCEL_AUTOMATIC_MERGE_ENABLED',
    'EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS',
  );
}

export async function validateConfigurationFile(path, options = {}) {
  const environment = parseEnvironment(await readFile(path, 'utf8'));
  validateConfiguration(environment, options);
  return environment;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const path = process.argv[2];
  if (!path) {
    throw new Error(
      'Usage: node validate-config.mjs <environment-file> [--allow-synthetic]',
    );
  }
  await validateConfigurationFile(resolve(path), {
    allowSynthetic: process.argv.includes('--allow-synthetic'),
  });
  console.info('Pilot deployment configuration is valid.');
}
