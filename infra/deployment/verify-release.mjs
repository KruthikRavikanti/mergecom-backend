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
  const objectStorageOrigin = new URL(environment.S3_ENDPOINT).origin;
  await assertJsonHealth(`${webOrigin}/health/live`, 'web');
  await assertJsonHealth(`${webOrigin}/api/health/live`, 'api');
  await assertJsonHealth(`${webOrigin}/api/health/ready`, 'api');
  await assertJsonHealth(`${officeOrigin}/health/live`, 'office-addin');
  await assertJsonHealth(`${officeOrigin}/api/health/ready`, 'api');

  const publicRoutes = new Map([
    ['/', 'MergeCom | Version control for Microsoft Office documents'],
    ['/product', 'Product | MergeCom'],
    ['/security', 'Security | MergeCom'],
    ['/support', 'Support | MergeCom'],
    ['/request-access', 'Request access | MergeCom'],
  ]);
  for (const [route, title] of publicRoutes) {
    const response = await fetchWithRetry(`${webOrigin}${route}`);
    const html = await response.text();
    const canonical = `${webOrigin}${route === '/' ? '/' : route}`;
    if (
      !html.includes(`<title>${title}</title>`) ||
      !html.includes(`<link rel="canonical" href="${canonical}"`) ||
      !html.includes('<h1')
    ) {
      throw new Error(`${route} did not serve complete public metadata.`);
    }
    if (
      response.headers.get('x-content-type-options') !== 'nosniff' ||
      !response.headers.get('permissions-policy') ||
      !response.headers
        .get('content-security-policy')
        ?.includes(`connect-src 'self' ${objectStorageOrigin}`)
    ) {
      throw new Error(`${route} is missing required security headers.`);
    }
  }

  for (const asset of [
    '/fonts/inter-latin-variable.woff2',
    '/fonts/newsreader-latin-variable.woff2',
    '/marketing/comparison-workspace.webp',
  ]) {
    await fetchWithRetry(`${webOrigin}${asset}`);
  }

  const robots = await (await fetchWithRetry(`${webOrigin}/robots.txt`)).text();
  const sitemap = await (
    await fetchWithRetry(`${webOrigin}/sitemap.xml`)
  ).text();
  if (
    !robots.includes('Disallow: /app') ||
    !robots.includes(`Sitemap: ${webOrigin}/sitemap.xml`) ||
    sitemap.includes('/app') ||
    !sitemap.includes(`${webOrigin}/request-access`)
  ) {
    throw new Error('Public discovery files do not match the route allowlist.');
  }

  const appShell = await (await fetchWithRetry(`${webOrigin}/app`)).text();
  if (
    !appShell.includes('<div id="root"></div>') ||
    !appShell.includes('noindex, nofollow') ||
    appShell.includes('marketing-hero')
  ) {
    throw new Error('Protected routes do not receive the isolated SPA shell.');
  }

  const requestAccessHtml = await (
    await fetchWithRetry(`${webOrigin}/request-access`)
  ).text();
  if (
    !requestAccessHtml.includes('mailto:') &&
    !requestAccessHtml.includes(
      'No information has been collected or submitted.',
    )
  ) {
    throw new Error(
      'Request access has neither a destination nor truthful fallback.',
    );
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
