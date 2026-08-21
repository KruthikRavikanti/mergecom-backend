import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import type { PublicRoutePath } from '../content/metadata';
import { trackMarketingEvent } from './MarketingAnalytics';

const publicPaths = new Set<PublicRoutePath>([
  '/',
  '/product',
  '/security',
  '/support',
  '/request-access',
]);

export function MarketingAnalyticsObserver() {
  const location = useLocation();
  const comparisonTracked = useRef(false);

  useEffect(() => {
    if (!publicPaths.has(location.pathname as PublicRoutePath)) return;
    const path = location.pathname as PublicRoutePath;
    trackMarketingEvent({ name: 'public_page_viewed', path });
    if (path === '/security') {
      trackMarketingEvent({ name: 'security_page_opened' });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (location.pathname !== '/' || comparisonTracked.current) return;
    const section = document.getElementById('product-showcase');
    if (!section || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        comparisonTracked.current = true;
        trackMarketingEvent({
          name: 'product_section_reached',
          section: 'comparison',
        });
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
}
