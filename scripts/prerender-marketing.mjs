import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDirectory = resolve(repositoryRoot, 'apps/web/dist');
const serverDirectory = resolve(repositoryRoot, 'apps/web/dist-server');
const serverEntry = resolve(serverDirectory, 'entry-server.js');
const template = await readFile(resolve(clientDirectory, 'index.html'), 'utf8');

if (!template.includes('<!--app-head-->')) {
  throw new Error('Marketing prerender head marker is missing.');
}
if (!template.includes('<div id="root"></div>')) {
  throw new Error('Marketing prerender root marker is missing.');
}

const withoutHeroPreloads = (html) =>
  html.replace(/\s*<!--hero-preloads-->[\s\S]*?<!--\/hero-preloads-->/u, '');
const applicationShell = template.replace(
  '<!--app-head-->',
  '<meta name="robots" content="noindex, nofollow" />',
);
await writeFile(
  resolve(clientDirectory, 'app-shell.html'),
  withoutHeroPreloads(applicationShell),
);

const { prerenderedPublicRoutes, renderPublicRoute } = await import(
  pathToFileURL(serverEntry).href
);
const expectedRoutes = [
  '/',
  '/product',
  '/security',
  '/support',
  '/request-access',
];
if (
  JSON.stringify(prerenderedPublicRoutes) !== JSON.stringify(expectedRoutes)
) {
  throw new Error(
    'Prerender route allowlist does not match the release contract.',
  );
}

let siteOrigin = '';
for (const route of expectedRoutes) {
  const rendered = renderPublicRoute(route);
  siteOrigin ||= rendered.siteOrigin;
  const routeTemplate =
    route === '/' ? template : withoutHeroPreloads(template);
  const document = routeTemplate
    .replace(/\s*<meta name="theme-color"[^>]*>/u, '')
    .replace(/<title>[^<]*<\/title>\s*<!--app-head-->/u, rendered.head)
    .replace('<div id="root"></div>', `<div id="root">${rendered.html}</div>`);

  if (document.includes('<!--app-head-->') || !document.includes('<h1')) {
    throw new Error(`Prerender output is incomplete for ${route}.`);
  }
  const forbidden = [
    'alpha-owner',
    'localhost',
    '127.0.0.1',
    'VITE_',
    '/api/internal',
  ];
  for (const marker of forbidden) {
    if (document.includes(marker)) {
      throw new Error(`Prerender output for ${route} contains ${marker}.`);
    }
  }

  const output =
    route === '/'
      ? resolve(clientDirectory, 'index.html')
      : resolve(clientDirectory, route.slice(1), 'index.html');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, document);
}

const sitemapLocations = expectedRoutes.map((route) =>
  siteOrigin ? new URL(route, siteOrigin).href : route,
);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapLocations.map((location) => `  <url><loc>${location}</loc></url>`).join('\n')}
</urlset>
`;
const robots = `User-agent: *
Allow: /
Disallow: /app
Disallow: /invite/
Disallow: /login
Disallow: /signup
${siteOrigin ? `Sitemap: ${siteOrigin}/sitemap.xml\n` : ''}`;

await writeFile(resolve(clientDirectory, 'sitemap.xml'), sitemap);
await writeFile(resolve(clientDirectory, 'robots.txt'), robots);
await rm(serverDirectory, { recursive: true });

console.info(
  `Prerendered ${expectedRoutes.length} public routes${siteOrigin ? ` for ${siteOrigin}` : ' with relative local metadata'}.`,
);
