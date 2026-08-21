import type { RouteObject } from 'react-router-dom';

import { AuthProviderRoute } from '../auth/AuthProviderRoute';
import { publicPageMetadata } from '../features/marketing/content/metadata';

export const createPublicRoutes = (): RouteObject[] => [
  {
    children: [
      {
        handle: { marketingMeta: publicPageMetadata.home },
        index: true,
        lazy: async () => {
          const { MarketingHomePage } =
            await import('../features/marketing/pages/MarketingHomePage');
          return { Component: MarketingHomePage };
        },
      },
      {
        handle: { marketingMeta: publicPageMetadata.security },
        path: 'security',
        lazy: async () => {
          const { MarketingSecurityPage } =
            await import('../features/marketing/pages/MarketingSecurityPage');
          return { Component: MarketingSecurityPage };
        },
      },
      {
        handle: { marketingMeta: publicPageMetadata.product },
        path: 'product',
        lazy: async () => {
          const { ProductPage } =
            await import('../features/marketing/pages/ProductPage');
          return { Component: ProductPage };
        },
      },
      {
        handle: { marketingMeta: publicPageMetadata.support },
        path: 'support',
        lazy: async () => {
          const { MarketingSupportPage } =
            await import('../features/marketing/pages/MarketingSupportPage');
          return { Component: MarketingSupportPage };
        },
      },
      {
        handle: { marketingMeta: publicPageMetadata.requestAccess },
        path: 'request-access',
        lazy: async () => {
          const { RequestAccessPage } =
            await import('../features/marketing/pages/RequestAccessPage');
          return { Component: RequestAccessPage };
        },
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
    lazy: async () => {
      const { PublicLayout } =
        await import('../components/layout/PublicLayout');
      const { RouteErrorPage } = await import('../pages/RouteErrorPage');
      return { Component: PublicLayout, ErrorBoundary: RouteErrorPage };
    },
    path: '/',
  },
];
