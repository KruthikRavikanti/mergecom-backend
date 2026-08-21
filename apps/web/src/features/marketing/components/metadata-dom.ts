import type { PublicPageMetadata } from '../content/metadata';
import {
  createPublicStructuredData,
  resolvePublicUrl,
} from '../content/metadata-head';

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.dataset.marketingMeta = 'true';
    document.head.append(element);
  }
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
}

function upsertCanonical(path: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.dataset.marketingMeta = 'true';
    document.head.append(canonical);
  }
  canonical.href = resolvePublicUrl(path, window.location.origin);
}

function removeMeta(selector: string) {
  document.head.querySelector(selector)?.remove();
}

function updateStructuredData(enabled: boolean) {
  const selector = 'script[data-marketing-structured-data="true"]';
  if (!enabled) {
    document.head.querySelector(selector)?.remove();
    return;
  }
  let script = document.head.querySelector<HTMLScriptElement>(selector);
  if (!script) {
    script = document.createElement('script');
    script.dataset.marketingStructuredData = 'true';
    script.type = 'application/ld+json';
    document.head.append(script);
  }
  script.textContent = JSON.stringify(
    createPublicStructuredData(window.location.origin),
  );
}

export function applyPublicPageMetadata(metadata: PublicPageMetadata) {
  document.title = metadata.title;
  upsertMeta('meta[name="description"]', {
    content: metadata.description,
    name: 'description',
  });
  upsertMeta('meta[name="robots"]', {
    content: metadata.noIndex ? 'noindex, nofollow' : 'index, follow',
    name: 'robots',
  });
  upsertMeta('meta[property="og:title"]', {
    content: metadata.title,
    property: 'og:title',
  });
  upsertMeta('meta[property="og:description"]', {
    content: metadata.description,
    property: 'og:description',
  });
  upsertMeta('meta[property="og:type"]', {
    content: 'website',
    property: 'og:type',
  });
  upsertMeta('meta[property="og:url"]', {
    content: resolvePublicUrl(metadata.path, window.location.origin),
    property: 'og:url',
  });
  if (metadata.image) {
    upsertMeta('meta[property="og:image"]', {
      content: resolvePublicUrl(metadata.image, window.location.origin),
      property: 'og:image',
    });
    upsertMeta('meta[property="og:image:alt"]', {
      content: 'MergeCom comparison workspace',
      property: 'og:image:alt',
    });
    upsertMeta('meta[name="twitter:image"]', {
      content: resolvePublicUrl(metadata.image, window.location.origin),
      name: 'twitter:image',
    });
  } else {
    removeMeta('meta[property="og:image"]');
    removeMeta('meta[property="og:image:alt"]');
    removeMeta('meta[name="twitter:image"]');
  }
  upsertMeta('meta[name="twitter:card"]', {
    content: metadata.image ? 'summary_large_image' : 'summary',
    name: 'twitter:card',
  });
  upsertMeta('meta[name="twitter:title"]', {
    content: metadata.title,
    name: 'twitter:title',
  });
  upsertMeta('meta[name="twitter:description"]', {
    content: metadata.description,
    name: 'twitter:description',
  });
  upsertMeta('meta[name="theme-color"]', {
    content: metadata.themeColor ?? '#172033',
    name: 'theme-color',
  });
  updateStructuredData(Boolean(metadata.structuredData));
  upsertCanonical(metadata.path);
}
