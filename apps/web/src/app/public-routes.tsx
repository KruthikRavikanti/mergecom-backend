import type { RouteObject } from 'react-router-dom';

import { AuthProviderRoute } from '../auth/AuthProviderRoute';
import { PublicLayout } from '../components/layout/PublicLayout';
import { publicPageMetadata } from '../features/marketing/content/metadata';
import { MarketingHomePage } from '../features/marketing/pages/MarketingHomePage';
import { MarketingSecurityPage } from '../features/marketing/pages/MarketingSecurityPage';
import { MarketingSupportPage } from '../features/marketing/pages/MarketingSupportPage';
import { ProductPage } from '../features/marketing/pages/ProductPage';
import { RequestAccessPage } from '../features/marketing/pages/RequestAccessPage';
import { LoadingPage } from '../pages/LoadingPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';

export const createPublicRoutes = (): RouteObject[] => [
  {
    children: [
      {
        Component: MarketingHomePage,
        handle: { marketingMeta: publicPageMetadata.home },
        index: true,
      },
      {
        Component: MarketingSecurityPage,
        handle: { marketingMeta: publicPageMetadata.security },
        path: 'security',
      },
      {
        Component: ProductPage,
        handle: { marketingMeta: publicPageMetadata.product },
        path: 'product',
      },
      {
        Component: MarketingSupportPage,
        handle: { marketingMeta: publicPageMetadata.support },
        path: 'support',
      },
      {
        Component: RequestAccessPage,
        handle: { marketingMeta: publicPageMetadata.requestAccess },
        path: 'request-access',
      },
      {
        children: [
          {
            handle: { marketingMeta: publicPageMetadata.login },
            path: 'login',
            lazy: async () => {
              const { LoginPage } = await import('../pages/LoginPage');
              return { Component: LoginPage };
            },
          },
          {
            handle: { marketingMeta: publicPageMetadata.signup },
            path: 'signup',
            lazy: async () => {
              const { LoginPage } = await import('../pages/LoginPage');
              return { Component: () => <LoginPage signup /> };
            },
          },
        ],
        element: <AuthProviderRoute />,
      },
    ],
    Component: PublicLayout,
    ErrorBoundary: RouteErrorPage,
    HydrateFallback: LoadingPage,
    path: '/',
  },
];
