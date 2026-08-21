import type { QueryClient } from '@tanstack/react-query';
import type { RouteObject } from 'react-router-dom';

import { AuthProvider } from '../auth/AuthContext';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { protectedRouteLoader } from '../auth/session';
import { LoadingPage } from '../pages/LoadingPage';

export const createProtectedRoute = (
  queryClient: QueryClient,
): RouteObject => ({
  HydrateFallback: LoadingPage,
  children: [
    {
      path: 'invite/:token',
      lazy: async () => {
        const { InviteAcceptancePage } =
          await import('../features/invitations/InviteAcceptancePage');
        return { Component: InviteAcceptancePage };
      },
    },
    {
      children: [
        {
          index: true,
          lazy: async () => {
            const { MyWorkPage } =
              await import('../features/dashboard/MyWorkPage');
            return { Component: MyWorkPage };
          },
        },
        {
          path: 'getting-started',
          lazy: async () => {
            const { GettingStartedPage } =
              await import('../features/onboarding/GettingStartedPage');
            return { Component: GettingStartedPage };
          },
        },
        {
          path: 'setup',
          lazy: async () => {
            const { SetupPage } =
              await import('../features/onboarding/SetupPage');
            return { Component: SetupPage };
          },
        },
        {
          path: 'projects',
          lazy: async () => {
            const { DashboardPage } =
              await import('../features/dashboard/DashboardPage');
            return { Component: DashboardPage };
          },
        },
        {
          path: 'projects/:projectId',
          lazy: async () => {
            const { ProjectPage } =
              await import('../features/projects/ProjectPage');
            return { Component: ProjectPage };
          },
        },
        {
          path: 'projects/:projectId/folders/:folderId',
          lazy: async () => {
            const { ProjectPage } =
              await import('../features/projects/ProjectPage');
            return { Component: ProjectPage };
          },
        },
        {
          path: 'projects/:projectId/documents/:documentId/history',
          lazy: async () => {
            const { DocumentHistoryPage } =
              await import('../features/history/DocumentHistoryPage');
            return { Component: DocumentHistoryPage };
          },
        },
        {
          path: 'projects/:projectId/documents/:documentId/history/comparisons/:comparisonId',
          lazy: async () => {
            const { DocumentComparePage } =
              await import('../features/history/DocumentComparePage');
            return { Component: DocumentComparePage };
          },
        },
        {
          path: 'projects/:projectId/documents/:documentId/history/merges/:mergeId',
          lazy: async () => {
            const { DocumentMergePage } =
              await import('../features/history/DocumentMergePage');
            return { Component: DocumentMergePage };
          },
        },
        {
          path: 'projects/:projectId/documents/:documentId/history/reviews/:reviewRequestId',
          lazy: async () => {
            const { DocumentReviewPage } =
              await import('../features/reviews/DocumentReviewPage');
            return { Component: DocumentReviewPage };
          },
        },
        {
          path: 'team',
          lazy: async () => {
            const { TeamPage } = await import('../features/team/TeamPage');
            return { Component: TeamPage };
          },
        },
        {
          path: 'notifications',
          lazy: async () => {
            const { NotificationInboxPage } =
              await import('../features/notifications/NotificationInboxPage');
            return { Component: NotificationInboxPage };
          },
        },
        {
          path: 'settings',
          lazy: async () => {
            const { SettingsPage } =
              await import('../features/settings/SettingsPage');
            return { Component: SettingsPage };
          },
        },
        {
          path: 'admin',
          lazy: async () => {
            const { AdminPage } = await import('../features/admin/AdminPage');
            return { Component: AdminPage };
          },
        },
      ],
      path: 'app',
      lazy: async () => {
        const { AppLayout } = await import('../components/layout/AppLayout');
        return { Component: AppLayout };
      },
    },
  ],
  element: (
    <AuthProvider>
      <ProtectedRoute />
    </AuthProvider>
  ),
  lazy: async () => {
    const { RouteErrorPage } = await import('../pages/RouteErrorPage');
    return { ErrorBoundary: RouteErrorPage };
  },
  loader: protectedRouteLoader(queryClient),
});
