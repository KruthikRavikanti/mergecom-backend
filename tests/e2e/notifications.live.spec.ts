import { expect, test, type Page } from '@playwright/test';

const livePhase9 = process.env.LIVE_PHASE9_E2E === 'true';

async function signIn(page: Page, identity: string) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption(identity);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

test.skip(
  !livePhase9,
  'Requires the seeded API, worker, PostgreSQL, Redis, and web services.',
);

test('opens a durable reviewer notification from the live inbox', async ({
  page,
}, testInfo) => {
  await signIn(page, 'alpha-reviewer');
  await page.goto('/app/notifications');
  await expect(
    page.getByRole('heading', { name: 'Notifications', exact: true }),
  ).toBeVisible();
  const reviewNotification = page
    .getByRole('button', { name: /Review requested/u })
    .first();
  await expect(reviewNotification).toBeVisible({ timeout: 20_000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase9-live-inbox-${testInfo.project.name}.png`),
  });

  await reviewNotification.click();
  await expect(page).toHaveURL(/\/history\/reviews\/[0-9a-f-]+$/u);
  await expect(
    page.getByRole('heading', { name: /^Version \d+$/u }),
  ).toBeVisible();
});
