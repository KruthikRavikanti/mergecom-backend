import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { AuthProvider } from '../auth/AuthContext';
import { appRoutes } from './router';

afterEach(cleanup);

function renderRoute(path: string) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('public routes', () => {
  it.each([
    ['/', 'MergeCom'],
    ['/security', 'Current security posture'],
    ['/support', 'Support'],
    ['/login', 'Sign in to MergeCom'],
    ['/signup', 'Join MergeCom'],
    ['/missing', 'Page not found'],
  ])('renders %s', async (path, heading) => {
    renderRoute(path);
    expect(
      await screen.findByRole('heading', { name: heading }),
    ).toBeInTheDocument();
  });

  it('protects workspace deep links', async () => {
    renderRoute('/app/settings');
    expect(
      await screen.findByRole('heading', { name: 'Sign in to MergeCom' }),
    ).toBeInTheDocument();
  });
});
