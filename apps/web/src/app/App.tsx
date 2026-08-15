import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';

import { AuthProvider } from '../auth/AuthContext';
import { LoadingPage } from '../pages/LoadingPage';
import { AppErrorBoundary } from './AppErrorBoundary';
import { createAppRouter } from './router';

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
      }),
  );
  const [router] = useState(createAppRouter);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider fallbackElement={<LoadingPage />} router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
