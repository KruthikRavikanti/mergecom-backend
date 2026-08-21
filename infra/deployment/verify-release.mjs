import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateConfigurationFile } from './validate-config.mjs';

const delay = (milliseconds) =>
  new Promise((complete) => setTimeout(complete, milliseconds));

async function fetchWithRetry(url, attempts = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        throw new Error(`${url} returned HTTP ${response.status}.`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(3_000);
    }
  }
  throw lastError;
}

async function assertJsonHealth(url, expectedService) {
  const response = await fetchWithRetry(url);
  const payload = await response.json();
  if (payload.status !== 'alive' && payload.status !== 'ready') {
    throw new Error(`${url} did not return a healthy status.`);
  }
  if (expectedService && payload.service !== expectedService) {
    throw new Error(`${url} returned an unexpected service identity.`);
  }
}

export async function verifyRelease(environment) {
  const webOrigin = environment.WEB_ORIGIN;
  const officeOrigin = environment.OFFICE_ADDIN_ORIGIN;
  await assertJsonHealth(`${webOrigin}/health/live`, 'web');
  await assertJsonHealth(`${webOrigin}/api/health/live`, 'api');
  await assertJsonHealth(`${webOrigin}/api/health/ready`, 'api');
  await assertJsonHealth(`${officeOrigin}/health/live`, 'office-addin');
  await assertJsonHealth(`${officeOrigin}/api/health/ready`, 'api');

  const webResponse = await fetchWithRetry(`${webOrigin}/`);
  const webHtml = await webResponse.text();
  if (!webHtml.includes('<title>MergeCom</title>')) {
    throw new Error('The web origin did not serve the MergeCom application.');
  }
  if (webResponse.headers.get('x-content-type-options') !== 'nosniff') {
    throw new Error('The web origin is missing required security headers.');
  }

  const officeResponse = await fetchWithRetry(`${officeOrigin}/`);
  const officeHtml = await officeResponse.text();
  if (!officeHtml.includes('appsforoffice.microsoft.com')) {
    throw new Error('The Office origin did not serve the Office task pane.');
  }

  for (const host of ['word', 'excel', 'powerpoint']) {
    const response = await fetchWithRetry(
      `${officeOrigin}/manifests/manifest.${host}.xml`,
    );
    const manifest = await response.text();
    if (
      manifest.includes('https://localhost:5176') ||
      !manifest.includes(`${officeOrigin}/`)
    ) {
      throw new Error(`The ${host} manifest has an invalid hosted origin.`);
    }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const path = process.argv[2];
  if (!path) {
    throw new Error('Usage: node verify-release.mjs <pilot-environment-file>');
  }
  const environment = await validateConfigurationFile(resolve(path));
  await verifyRelease(environment);
  console.info('Pilot release health verification passed.');
}
