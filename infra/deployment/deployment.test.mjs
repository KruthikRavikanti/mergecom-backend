import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  renderOfficeManifests,
  validateOfficeOrigin,
} from './render-office-manifests.mjs';
import {
  parseEnvironment,
  validateConfiguration,
  validateConfigurationFile,
} from './validate-config.mjs';

const deploymentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(deploymentDirectory, '../..');
const validationEnvironment = resolve(
  deploymentDirectory,
  '.env.validation.example',
);

test('synthetic deployment configuration passes only the CI override', async () => {
  await assert.rejects(
    validateConfigurationFile(validationEnvironment),
    /cannot be deployed/u,
  );
  await validateConfigurationFile(validationEnvironment, {
    allowSynthetic: true,
  });
});

test('configuration rejects mutable images and unsafe pilot enablement', async () => {
  const environment = parseEnvironment(
    await readFile(validationEnvironment, 'utf8'),
  );
  assert.throws(
    () =>
      validateConfiguration(
        { ...environment, MERGECOM_API_IMAGE: 'ghcr.io/mergecom/api:latest' },
        { allowSynthetic: true },
      ),
    /immutable sha256/u,
  );
  assert.throws(
    () =>
      validateConfiguration(
        {
          ...environment,
          POWERPOINT_AUTOMATIC_MERGE_ENABLED: 'true',
          POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS: '',
        },
        { allowSynthetic: true },
      ),
    /requires a non-empty/u,
  );
  assert.throws(
    () =>
      validateConfiguration(
        { ...environment, REDIS_URL: 'redis://localhost:6379' },
        { allowSynthetic: true },
      ),
    /REDIS_URL/u,
  );
  assert.throws(
    () =>
      validateConfiguration(
        { ...environment, WEB_BIND_ADDRESS: '0.0.0.0' },
        { allowSynthetic: true },
      ),
    /WEB_BIND_ADDRESS/u,
  );
});

test('hosted Office manifests contain only the selected origin', async () => {
  const output = await mkdtemp(resolve(tmpdir(), 'mergecom-manifests-'));
  try {
    await renderOfficeManifests('https://office.mergecom.example', output);
    const manifest = await readFile(
      resolve(output, 'manifest.powerpoint.xml'),
      'utf8',
    );
    assert.equal(manifest.includes('https://localhost:5176'), false);
    assert.equal(
      manifest.split('https://office.mergecom.example').length - 1,
      4,
    );
    assert.throws(
      () => validateOfficeOrigin('http://office.mergecom.example'),
      /HTTPS origin/u,
    );
  } finally {
    await rm(output, { recursive: true });
  }
});

test('pilot topology keeps stateful dependencies external and hardens images', async () => {
  const compose = await readFile(
    resolve(deploymentDirectory, 'compose.pilot.yaml'),
    'utf8',
  );
  assert.match(compose, /condition: service_completed_successfully/u);
  assert.doesNotMatch(compose, /^\s{2}(postgres|redis|minio|mailpit):/mu);
  assert.doesNotMatch(compose, /^\s+build:/mu);
  assert.equal((compose.match(/read_only: true/gu) || []).length, 1);
  assert.match(compose, /no-new-privileges:true/u);
  assert.match(compose, /rendition:\n\s+driver: bridge\n\s+internal: true/u);

  const nginx = await readFile(
    resolve(repositoryRoot, 'infra/deployment/nginx.web.conf'),
    'utf8',
  );
  assert.match(nginx, /connect-src 'self' __MERGECOM_CONNECT_ORIGIN__;/u);
  assert.doesNotMatch(nginx, /connect-src[^;]*(?:\*|https:;)/u);
  assert.match(nginx, /frame-ancestors 'none'/u);
  assert.match(nginx, /Permissions-Policy/u);
  assert.match(nginx, /Referrer-Policy/u);
  assert.match(
    nginx,
    /try_files \$uri\/index\.html \$uri \$uri\/ \/app-shell\.html/u,
  );

  const expectedUsers = new Map([
    ['Dockerfile.api', 'node'],
    ['Dockerfile.worker', 'node'],
    ['Dockerfile.document-engine', 'app'],
    ['Dockerfile.rendition-engine', 'node'],
    ['Dockerfile.web', 'nginx'],
    ['Dockerfile.office-addin', 'nginx'],
  ]);
  for (const [name, user] of expectedUsers) {
    const dockerfile = await readFile(
      resolve(repositoryRoot, 'infra/deployment', name),
      'utf8',
    );
    assert.match(dockerfile, new RegExp(`USER ${user}\\n`, 'u'));
    assert.match(dockerfile, /HEALTHCHECK/u);
  }
});
