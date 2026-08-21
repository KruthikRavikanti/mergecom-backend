import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureMarketingAnalytics,
  trackMarketingEvent,
  type MarketingAnalyticsEvent,
} from '../analytics/MarketingAnalytics';

afterEach(() => {
  configureMarketingAnalytics(null);
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'doNotTrack', {
    configurable: true,
    value: null,
  });
});

describe('marketing analytics boundary', () => {
  it('emits only allowlisted content-free fields', () => {
    const events: MarketingAnalyticsEvent[] = [];
    configureMarketingAnalytics({ track: (event) => events.push(event) });

    trackMarketingEvent({
      name: 'public_page_viewed',
      path: '/product',
      email: 'private@example.com',
      documentId: 'document-123',
    } as MarketingAnalyticsEvent);

    expect(events).toEqual([{ name: 'public_page_viewed', path: '/product' }]);
  });

  it('respects Do Not Track', () => {
    const track = vi.fn();
    configureMarketingAnalytics({ track });
    Object.defineProperty(navigator, 'doNotTrack', {
      configurable: true,
      value: '1',
    });

    trackMarketingEvent({ name: 'security_page_opened' });

    expect(track).not.toHaveBeenCalled();
  });

  it('does not break the site when a provider fails', () => {
    configureMarketingAnalytics({
      track: () => {
        throw new Error('blocked provider');
      },
    });

    expect(() =>
      trackMarketingEvent({ name: 'request_access_form_started' }),
    ).not.toThrow();
  });
});
