import type { QueryClient } from '@tanstack/react-query';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { NotFoundPage } from '../pages/NotFoundPage';
import { publicPageMetadata } from '../features/marketing/content/metadata';
import { createProtectedRoute } from './protected-routes';
import { createPublicRoutes } from './public-routes';

export const createAppRoutes = (queryClient: QueryClient): RouteObject[] => [
  ...createPublicRoutes(),
  createProtectedRoute(queryClient),
  {
    element: <NotFoundPage />,
    handle: { marketingMeta: publicPageMetadata.notFound },
    path: '*',
  },
];

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter(createAppRoutes(queryClient));
