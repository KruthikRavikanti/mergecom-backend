import type { PublicPageMetadata } from './metadata';

const configuredOrigin = import.meta.env.VITE_WEB_APP_BASE_URL?.trim() ?? '';

function normalizeOrigin(value: string) {
  if (!value) return '';
  const url = new URL(value);
  if (url.origin !== value) {
    throw new Error('VITE_WEB_APP_BASE_URL must be an origin without a path.');
  }
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  ) {
    throw new Error('VITE_WEB_APP_BASE_URL must use HTTPS when hosted.');
  }
  return url.origin;
}

export const publicSiteOrigin = normalizeOrigin(configuredOrigin);

export function resolvePublicUrl(path: string, fallbackOrigin = '') {
  const origin = publicSiteOrigin || fallbackOrigin;
  return origin ? new URL(path, origin).href : path;
}

export function createPublicStructuredData(fallbackOrigin = '') {
  const origin = publicSiteOrigin || fallbackOrigin;
  const organization: Record<string, unknown> = {
    '@type': 'Organization',
    name: 'MergeCom',
  };
  const application: Record<string, unknown> = {
    '@type': 'WebApplication',
    applicationCategory: 'BusinessApplication',
    description: publicPageDescription,
    featureList: [
      'Immutable Microsoft Office document versions',
      'Word, Excel, and PowerPoint comparison',
      'Review and approval workflows',
      'Non-destructive version restore',
    ],
    name: 'MergeCom',
    operatingSystem: 'Web',
  };

  if (origin) {
    organization.url = origin;
    organization.logo = new URL('/favicon.svg', origin).href;
    application.url = origin;
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [organization, application],
  };
}

const publicPageDescription =
  'Version control and review workflows for Microsoft Word, Excel, and PowerPoint documents.';

function escapeAttribute(value: string) {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

function meta(attribute: 'name' | 'property', key: string, value: string) {
  return `<meta ${attribute}="${escapeAttribute(key)}" content="${escapeAttribute(value)}" />`;
}

export function renderPublicHead(metadata: PublicPageMetadata) {
  const canonical = resolvePublicUrl(metadata.path);
  const image = metadata.image ? resolvePublicUrl(metadata.image) : undefined;
  const tags = [
    `<title>${escapeAttribute(metadata.title)}</title>`,
    meta('name', 'description', metadata.description),
    meta(
      'name',
      'robots',
      metadata.noIndex ? 'noindex, nofollow' : 'index, follow',
    ),
    meta('name', 'theme-color', metadata.themeColor ?? '#172033'),
    `<link rel="canonical" href="${escapeAttribute(canonical)}" />`,
    meta('property', 'og:title', metadata.title),
    meta('property', 'og:description', metadata.description),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:url', canonical),
    meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary'),
    meta('name', 'twitter:title', metadata.title),
    meta('name', 'twitter:description', metadata.description),
  ];

  if (image) {
    tags.push(meta('property', 'og:image', image));
    tags.push(
      meta('property', 'og:image:alt', 'MergeCom comparison workspace'),
    );
    tags.push(meta('name', 'twitter:image', image));
  }
  if (metadata.structuredData) {
    const json = JSON.stringify(createPublicStructuredData()).replace(
      /</gu,
      '\\u003c',
    );
    tags.push(
      `<script data-marketing-structured-data="true" type="application/ld+json">${json}</script>`,
    );
  }
  return tags.join('\n    ');
}
