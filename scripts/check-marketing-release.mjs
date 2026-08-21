import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('apps/web/dist');
const routes = new Map([
  [
    '/',
    {
      description:
        'Save, compare, review, approve, and restore Word, Excel, and PowerPoint versions in one controlled workspace.',
      title: 'MergeCom | Version control for Microsoft Office documents',
    },
  ],
  [
    '/product',
    {
      description:
        'See how MergeCom saves exact Office packages and connects comparison, review, approval, and restore workflows.',
      title: 'Product | MergeCom',
    },
  ],
  [
    '/security',
    {
      description:
        'Review the technical controls implemented in the current MergeCom controlled preview.',
      title: 'Security | MergeCom',
    },
  ],
  [
    '/support',
    {
      description:
        'Find current support options and operating guidance for MergeCom.',
      title: 'Support | MergeCom',
    },
  ],
  [
    '/request-access',
    {
      description:
        'Request controlled-preview access to the MergeCom document version workspace.',
      title: 'Request access | MergeCom',
    },
  ],
]);

function routeFile(route) {
  return route === '/'
    ? resolve(dist, 'index.html')
    : resolve(dist, route.slice(1), 'index.html');
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

for (const [route, metadata] of routes) {
  const html = readFileSync(routeFile(route), 'utf8');
  if (!html.includes(`<title>${metadata.title}</title>`)) {
    throw new Error(`${route} has incorrect title metadata.`);
  }
  if (
    !html.includes(
      `<meta name="description" content="${metadata.description}" />`,
    )
  ) {
    throw new Error(`${route} has incorrect description metadata.`);
  }
  if (!/<link rel="canonical" href="[^"]+" \/>/u.test(html)) {
    throw new Error(`${route} has no canonical URL.`);
  }
  if ((html.match(/<h1/gu) ?? []).length !== 1) {
    throw new Error(`${route} must contain exactly one prerendered H1.`);
  }
  if (!html.includes('property="og:image"')) {
    throw new Error(`${route} has no social image metadata.`);
  }
  if (/localhost|127\.0\.0\.1|alpha-owner|VITE_|\/api\/internal/u.test(html)) {
    throw new Error(`${route} exposes local or internal release data.`);
  }
}

const home = readFileSync(routeFile('/'), 'utf8');
const structuredMatch = home.match(
  /<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/u,
);
if (!structuredMatch) throw new Error('Homepage structured data is missing.');
const structuredData = JSON.parse(structuredMatch[1]);
const types = structuredData['@graph'].map((entry) => entry['@type']);
if (!types.includes('Organization') || !types.includes('WebApplication')) {
  throw new Error('Homepage structured data has unexpected entity types.');
}
if (/"(?:aggregateRating|review|offers|price)"\s*:/u.test(structuredMatch[1])) {
  throw new Error(
    'Homepage structured data contains unapproved proof or pricing.',
  );
}

const sitemap = readFileSync(resolve(dist, 'sitemap.xml'), 'utf8');
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
  (match) => new URL(match[1], 'https://relative.invalid').pathname,
);
if (JSON.stringify(sitemapLocations) !== JSON.stringify([...routes.keys()])) {
  throw new Error(
    'Sitemap does not match the approved public route allowlist.',
  );
}
const robots = readFileSync(resolve(dist, 'robots.txt'), 'utf8');
for (const path of ['/app', '/invite/', '/login', '/signup']) {
  if (!robots.includes(`Disallow: ${path}`)) {
    throw new Error(`robots.txt does not exclude ${path}.`);
  }
}

const applicationShell = readFileSync(resolve(dist, 'app-shell.html'), 'utf8');
if (
  !applicationShell.includes('<div id="root"></div>') ||
  !applicationShell.includes('noindex, nofollow') ||
  applicationShell.includes('comparison-workspace.webp') ||
  applicationShell.includes('marketing-hero')
) {
  throw new Error(
    'Protected-route SPA shell is not isolated from prerendered HTML.',
  );
}

for (const asset of [
  'apple-touch-icon.png',
  'favicon.svg',
  'fonts/inter-latin-variable.woff2',
  'fonts/newsreader-latin-variable.woff2',
  'marketing/comparison-workspace.webp',
  'marketing/mergecom-social-card.webp',
  'site.webmanifest',
]) {
  if (!existsSync(resolve(dist, asset))) {
    throw new Error(`Required marketing asset is missing: ${asset}.`);
  }
}

if (walk(dist).some((path) => path.endsWith('.map'))) {
  throw new Error('Production web output contains source maps.');
}

console.log(
  'Marketing prerender, discovery, metadata, and release checks passed.',
);
