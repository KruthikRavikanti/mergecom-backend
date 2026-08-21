import type { RouteObject } from 'react-router-dom';

import { publicPageMetadata } from '../features/marketing/content/metadata';

export const createPublicRoutes = (): RouteObject[] => [
  {
    children: [
      {
        handle: { marketingMeta: publicPageMetadata.home },
        index: true,
        lazy: async () => {
          const { HomePage } = await import('../pages/HomePage');
          return { Component: HomePage };
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
        handle: { marketingMeta: publicPageMetadata.support },
        path: 'support',
        lazy: async () => {
          const { SupportPage } = await import('../pages/SupportPage');
          return { Component: SupportPage };
        },
      },
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
    lazy: async () => {
      const { PublicLayout } =
        await import('../components/layout/PublicLayout');
      const { RouteErrorPage } = await import('../pages/RouteErrorPage');
      return { Component: PublicLayout, ErrorBoundary: RouteErrorPage };
    },
    path: '/',
  },
];
