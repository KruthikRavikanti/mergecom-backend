import type { QueryClient } from '@tanstack/react-query';
import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { ProtectedRoute } from '../auth/ProtectedRoute';
import { protectedRouteLoader } from '../auth/session';
import { AppLayout } from '../components/layout/AppLayout';
import { PublicLayout } from '../components/layout/PublicLayout';
import { AdminPage } from '../features/admin/AdminPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { MyWorkPage } from '../features/dashboard/MyWorkPage';
import { DocumentHistoryPage } from '../features/history/DocumentHistoryPage';
import { DocumentComparePage } from '../features/history/DocumentComparePage';
import { DocumentMergePage } from '../features/history/DocumentMergePage';
import { InviteAcceptancePage } from '../features/invitations/InviteAcceptancePage';
import { NotificationInboxPage } from '../features/notifications/NotificationInboxPage';
import { ProjectPage } from '../features/projects/ProjectPage';
import { DocumentReviewPage } from '../features/reviews/DocumentReviewPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TeamPage } from '../features/team/TeamPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { LoadingPage } from '../pages/LoadingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';
import { SecurityPage } from '../pages/SecurityPage';
import { SupportPage } from '../pages/SupportPage';

export const createAppRoutes = (queryClient: QueryClient): RouteObject[] => [
  {
    children: [
      { element: <HomePage />, index: true },
      { element: <SecurityPage />, path: 'security' },
      { element: <SupportPage />, path: 'support' },
      { element: <LoginPage />, path: 'login' },
      { element: <LoginPage signup />, path: 'signup' },
    ],
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    path: '/',
  },
  {
    HydrateFallback: LoadingPage,
    children: [
      { element: <InviteAcceptancePage />, path: 'invite/:token' },
      {
        children: [
          { element: <MyWorkPage />, index: true },
          { element: <DashboardPage />, path: 'projects' },
          { element: <ProjectPage />, path: 'projects/:projectId' },
          {
            element: <ProjectPage />,
            path: 'projects/:projectId/folders/:folderId',
          },
          {
            element: <DocumentHistoryPage />,
            path: 'projects/:projectId/documents/:documentId/history',
          },
          {
            element: <DocumentComparePage />,
            path: 'projects/:projectId/documents/:documentId/history/comparisons/:comparisonId',
          },
          {
            element: <DocumentMergePage />,
            path: 'projects/:projectId/documents/:documentId/history/merges/:mergeId',
          },
          {
            element: <DocumentReviewPage />,
            path: 'projects/:projectId/documents/:documentId/history/reviews/:reviewRequestId',
          },
          { element: <TeamPage />, path: 'team' },
          { element: <NotificationInboxPage />, path: 'notifications' },
          { element: <SettingsPage />, path: 'settings' },
          { element: <AdminPage />, path: 'admin' },
        ],
        element: <AppLayout />,
        path: 'app',
      },
    ],
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
    loader: protectedRouteLoader(queryClient),
  },
  { element: <NotFoundPage />, path: '*' },
];

export const createAppRouter = (queryClient: QueryClient) =>
  createBrowserRouter(createAppRoutes(queryClient));
