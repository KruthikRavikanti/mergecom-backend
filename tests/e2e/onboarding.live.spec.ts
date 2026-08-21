import { expect, test, type Page } from '@playwright/test';

const livePhase29 = process.env.LIVE_PHASE29_E2E === 'true';

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, identity: string) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption(identity);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

test.skip(
  !livePhase29,
  'Requires the local stack and provisioned Phase 29 synthetic samples.',
);

test('owner can resume onboarding, explore a sample, and use the guide', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const identityByProfile: Record<string, string> = {
    'desktop-chromium': 'alpha-owner',
    'mobile-chromium': 'alpha-admin',
    'tablet-chromium': 'alpha-project-lead',
  };
  await signIn(page, identityByProfile[testInfo.project.name] ?? 'alpha-owner');

  const coreWorkflow = page.getByRole('heading', { name: 'Core workflow' });
  const reopen = page.getByRole('button', { name: 'Reopen getting started' });
  const dismiss = page.getByRole('button', { name: 'Dismiss getting started' });
  await expect(coreWorkflow.or(reopen).first()).toBeVisible();
  if (await reopen.isVisible()) await reopen.click();
  await expect(coreWorkflow).toBeVisible();
  await dismiss.click();
  await expect(reopen).toBeVisible();
  await reopen.click();
  await expect(coreWorkflow).toBeVisible();

  await page.goto('/app/getting-started');
  await expect(
    page.getByRole('heading', { name: 'Learn the core workflow' }),
  ).toBeVisible();
  await expect(page.getByText('SYNTHETIC', { exact: true })).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Open comparison' })).toHaveCount(
    3,
  );
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`getting-started-${testInfo.project.name}.png`),
  });
  await page.getByRole('link', { name: 'Open comparison' }).first().click();

  await expect(page.getByText('GUIDE 1 OF 5')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('GUIDE 2 OF 5')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('GUIDE 2 OF 5')).not.toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`guided-comparison-${testInfo.project.name}.png`),
  });
});

test('viewer sees role-appropriate onboarding and content-free feedback copy', async ({
  page,
}, testInfo) => {
  await signIn(page, 'alpha-viewer');
  await page.goto('/app/getting-started');

  await expect(page.getByText('Explore a sample comparison')).toBeVisible();
  await expect(page.getByText('Add or link a document')).toHaveCount(0);
  await expect(page.getByText('Save the first version')).toHaveCount(0);

  await page.getByRole('button', { name: 'Product feedback' }).click();
  await expect(
    page.getByText(/Not sent: document names or content/u),
  ).toBeVisible();
  await page.getByRole('radio', { name: '4' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Feedback submitted')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/app/setup');
  await expect(
    page.getByRole('heading', { name: 'Setup and readiness' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Word' }).click();
  await page.getByRole('tab', { name: 'Mac' }).click();
  await expect(page.getByRole('link', { name: 'Manifest' })).toHaveAttribute(
    'href',
    /manifest\.word\.xml$/u,
  );
  await expect(page.getByText('Authenticated')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`office-setup-${testInfo.project.name}.png`),
  });
});
