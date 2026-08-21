import type { PublicPageMetadata } from '../content/metadata';

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
  canonical.href = new URL(path, window.location.origin).href;
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
  if (metadata.image) {
    upsertMeta('meta[property="og:image"]', {
      content: new URL(metadata.image, window.location.origin).href,
      property: 'og:image',
    });
  }
  upsertMeta('meta[name="twitter:card"]', {
    content: 'summary_large_image',
    name: 'twitter:card',
  });
  upsertCanonical(metadata.path);
}
