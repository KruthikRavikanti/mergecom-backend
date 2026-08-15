import { expect, test, type Page } from '@playwright/test';

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

async function startDemoSession(page: Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Enter development demo' }).click();
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
    await startDemoSession(page);
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, exact: true }),
    ).toBeVisible();
  });
}

test('protected deep link returns after demo sign in', async ({ page }) => {
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/login\?returnTo=/u);
  await page.getByRole('button', { name: 'Enter development demo' }).click();
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
