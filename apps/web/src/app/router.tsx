import { createBrowserRouter, type RouteObject } from 'react-router-dom';

import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppLayout } from '../components/layout/AppLayout';
import { PublicLayout } from '../components/layout/PublicLayout';
import { AdminPage } from '../features/admin/AdminPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { DocumentHistoryPage } from '../features/history/DocumentHistoryPage';
import { ProjectPage } from '../features/projects/ProjectPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TeamPage } from '../features/team/TeamPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { RouteErrorPage } from '../pages/RouteErrorPage';
import { SecurityPage } from '../pages/SecurityPage';
import { SupportPage } from '../pages/SupportPage';

export const appRoutes: RouteObject[] = [
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
    children: [
      {
        children: [
          { element: <DashboardPage />, index: true },
          { element: <ProjectPage />, path: 'projects/:projectId' },
          {
            element: <DocumentHistoryPage />,
            path: 'projects/:projectId/documents/:documentId/history',
          },
          { element: <TeamPage />, path: 'team' },
          { element: <SettingsPage />, path: 'settings' },
          { element: <AdminPage />, path: 'admin' },
        ],
        element: <AppLayout />,
        path: 'app',
      },
    ],
    element: <ProtectedRoute />,
    errorElement: <RouteErrorPage />,
  },
  { element: <NotFoundPage />, path: '*' },
];

export const createAppRouter = () => createBrowserRouter(appRoutes);
