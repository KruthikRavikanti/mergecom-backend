import { expect, test, type Page } from '@playwright/test';

const currentUser = {
  activeOrganization: {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Alpha Advisory',
    role: 'owner',
    status: 'active',
  },
  organizations: [
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Alpha Advisory',
      role: 'owner',
    },
  ],
  session: {
    csrfToken: 'browser-test-csrf-token',
    expiresAt: '2026-08-16T12:00:00.000Z',
  },
  user: {
    displayName: 'Avery Chen',
    email: 'avery@mergecom.test',
    emailVerified: true,
    id: '20000000-0000-4000-8000-000000000001',
  },
};

test.beforeEach(async ({ page }) => {
  let authenticated = false;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const path = url.pathname.replace(/^\/api/u, '');
    if (path === '/auth/development/session') {
      authenticated = true;
      await route.fulfill({ json: { authenticated: true }, status: 200 });
      return;
    }
    if (path === '/v1/me') {
      await route.fulfill(
        authenticated
          ? { json: currentUser, status: 200 }
          : {
              json: {
                code: 'unauthenticated',
                message: 'Authentication is required.',
              },
              status: 401,
            },
      );
      return;
    }
    if (path.endsWith('/memberships')) {
      await route.fulfill({
        json: {
          memberships: [
            {
              email: 'avery@mergecom.test',
              id: '30000000-0000-4000-8000-000000000001',
              joinedAt: '2026-08-01T12:00:00.000Z',
              name: 'Avery Chen',
              role: 'owner',
              status: 'active',
              userId: '20000000-0000-4000-8000-000000000001',
            },
          ],
        },
        status: 200,
      });
      return;
    }
    if (path === '/health/ready') {
      await route.fulfill({
        json: {
          dependencies: { database: 'ready' },
          service: 'api',
          status: 'ready',
        },
        status: 200,
      });
      return;
    }
    await route.fulfill({
      json: { code: 'not_found', message: 'Resource not found.' },
      status: 404,
    });
  });
});

const publicRoutes = [
  { heading: 'MergeCom', path: '/' },
  { heading: 'Sign in to MergeCom', path: '/login' },
  { heading: 'Join MergeCom', path: '/signup' },
  { heading: 'Current security posture', path: '/security' },
  { heading: 'Support', path: '/support' },
  { heading: 'Page not found', path: '/not-a-route' },
];

for (const route of publicRoutes) {
  test(`public route ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, exact: true }),
    ).toBeVisible();
  });
}

async function startIdentitySession(page: Page) {
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

const authenticatedRoutes = [
  { heading: 'Projects', path: '/app' },
  { heading: 'Project Meridian', path: '/app/projects/proj-meridian' },
  {
    heading: 'Confidential Information Memorandum.pptx',
    path: '/app/projects/proj-meridian/documents/doc-cim/history',
  },
  { heading: 'Team', path: '/app/team' },
  { heading: 'Settings', path: '/app/settings' },
  { heading: 'Workspace controls', path: '/app/admin' },
];

for (const route of authenticatedRoutes) {
  test(`authenticated route ${route.path}`, async ({ page }) => {
    await startIdentitySession(page);
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, exact: true }),
    ).toBeVisible();
  });
}

test('protected deep link returns after identity sign in', async ({ page }) => {
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/login\?returnTo=/u);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app\/settings$/u);
});

test('support reports delivery failure', async ({ page }) => {
  await page.goto('/support');
  await page.getByLabel('Name').fill('Casey Reviewer');
  await page.getByLabel('Work email').fill('casey@example.test');
  await page.getByLabel('How can we help?').fill('Test request');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByRole('alert')).toContainText('not submitted');
});
