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
          const { SecurityPage } = await import('../pages/SecurityPage');
          return { Component: SecurityPage };
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
          const { SupportPage } = await import('../pages/SupportPage');
          return { Component: SupportPage };
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
