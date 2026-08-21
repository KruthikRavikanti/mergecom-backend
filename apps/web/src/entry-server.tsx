import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';

import { MarketingAnalyticsObserver } from './features/marketing/analytics/MarketingAnalyticsObserver';
import { MarketingFooter } from './features/marketing/components/MarketingFooter';
import { MarketingHeader } from './features/marketing/components/MarketingHeader';
import {
  publicPageMetadata,
  type PublicPageMetadata,
  type PublicRoutePath,
} from './features/marketing/content/metadata';
import {
  publicSiteOrigin,
  renderPublicHead,
} from './features/marketing/content/metadata-head';
import { MarketingHomePage } from './features/marketing/pages/MarketingHomePage';
import { MarketingSecurityPage } from './features/marketing/pages/MarketingSecurityPage';
import { MarketingSupportPage } from './features/marketing/pages/MarketingSupportPage';
import { ProductPage } from './features/marketing/pages/ProductPage';
import { RequestAccessPage } from './features/marketing/pages/RequestAccessPage';
import './features/marketing/styles/marketing.css';

const publicRoutes = new Map<
  PublicRoutePath,
  { Component: () => JSX.Element; metadata: PublicPageMetadata }
>([
  ['/', { Component: MarketingHomePage, metadata: publicPageMetadata.home }],
  [
    '/product',
    { Component: ProductPage, metadata: publicPageMetadata.product },
  ],
  [
    '/security',
    {
      Component: MarketingSecurityPage,
      metadata: publicPageMetadata.security,
    },
  ],
  [
    '/support',
    {
      Component: MarketingSupportPage,
      metadata: publicPageMetadata.support,
    },
  ],
  [
    '/request-access',
    {
      Component: RequestAccessPage,
      metadata: publicPageMetadata.requestAccess,
    },
  ],
]);

export const prerenderedPublicRoutes = [...publicRoutes.keys()];

export function renderPublicRoute(path: PublicRoutePath) {
  const route = publicRoutes.get(path);
  if (!route)
    throw new Error(`Public prerender route is not approved: ${path}`);
  const { Component, metadata } = route;

  const html = renderToString(
    <StaticRouter location={path}>
      <div className="marketing-site min-h-screen bg-white">
        <MarketingAnalyticsObserver />
        <a className="marketing-skip-link" href="#main-content">
          Skip to main content
        </a>
        <MarketingHeader />
        <div id="main-content">
          <Component />
        </div>
        <MarketingFooter />
      </div>
    </StaticRouter>,
  );

  if (!html.includes('<h1')) {
    throw new Error(`Public prerender route has no H1: ${path}`);
  }
  return {
    head: renderPublicHead(metadata),
    html,
    metadata,
    siteOrigin: publicSiteOrigin,
  };
}
