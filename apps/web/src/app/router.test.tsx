import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppRoutes } from './router';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            code: 'unauthenticated',
            message: 'Authentication is required.',
          }),
          {
            headers: { 'content-type': 'application/json' },
            status: 401,
          },
        ),
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRoute(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(createAppRoutes(queryClient), {
    initialEntries: [path],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('public routes', () => {
  it.each([
    ['/', 'Version control for the documents that run your firm.'],
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
