import type { PublicRoutePath } from '../content/metadata';

export type MarketingAnalyticsEvent =
  | { name: 'hero_cta_selected'; target: 'product' | 'request_access' }
  | { name: 'product_section_reached'; section: 'comparison' }
  | { name: 'public_page_viewed'; path: PublicRoutePath }
  | { name: 'request_access_form_failed'; reason: 'provider' | 'validation' }
  | { name: 'request_access_form_started' }
  | { name: 'request_access_form_succeeded' }
  | { name: 'security_page_opened' };

export interface MarketingAnalytics {
  track(event: MarketingAnalyticsEvent): void;
}

const publicRoutePaths = new Set<PublicRoutePath>([
  '/',
  '/product',
  '/security',
  '/support',
  '/request-access',
]);

let provider: MarketingAnalytics | null = null;

export function configureMarketingAnalytics(
  nextProvider: MarketingAnalytics | null,
) {
  provider = nextProvider;
}

function privacySignalBlocksAnalytics() {
  if (typeof navigator === 'undefined') return true;
  const privacyNavigator = navigator as Navigator & {
    globalPrivacyControl?: boolean;
  };
  return (
    navigator.doNotTrack === '1' ||
    privacyNavigator.globalPrivacyControl === true
  );
}

function sanitizeEvent(
  event: MarketingAnalyticsEvent,
): MarketingAnalyticsEvent | null {
  switch (event.name) {
    case 'public_page_viewed':
      return publicRoutePaths.has(event.path)
        ? { name: event.name, path: event.path }
        : null;
    case 'hero_cta_selected':
      return ['product', 'request_access'].includes(event.target)
        ? { name: event.name, target: event.target }
        : null;
    case 'product_section_reached':
      return event.section === 'comparison'
        ? { name: event.name, section: event.section }
        : null;
    case 'request_access_form_failed':
      return ['provider', 'validation'].includes(event.reason)
        ? { name: event.name, reason: event.reason }
        : null;
    case 'request_access_form_started':
    case 'request_access_form_succeeded':
    case 'security_page_opened':
      return { name: event.name };
  }
}

export function trackMarketingEvent(event: MarketingAnalyticsEvent) {
  if (!provider || privacySignalBlocksAnalytics()) return;
  const sanitized = sanitizeEvent(event);
  if (!sanitized) return;
  try {
    provider.track(sanitized);
  } catch {
    // Analytics must never affect public navigation or conversion paths.
  }
}
