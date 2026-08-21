import { expect, test, type Page } from '@playwright/test';

const livePhase27 = process.env.LIVE_PHASE27_E2E === 'true';

async function signIn(page: Page, identity: string) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption(identity);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
}

test.skip(
  !livePhase27,
  'Requires the local stack and seeded Phase 27 workspace activity.',
);

test('My Work sections and metadata search reach current resources', async ({
  page,
}, testInfo) => {
  await signIn(page, 'alpha-owner');
  await expect(
    page.getByRole('heading', { name: 'My Work', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Needs attention' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Continue working' }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('my-work.png'),
  });

  const search = page.getByRole('combobox', { name: 'Search workspace' });
  await search.fill('Confidential Information');
  const result = page.getByRole('option').filter({
    hasText: 'Confidential Information Memorandum.pptx',
  });
  await expect(result).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+\/history$/u);
});

test('My Work filters persist in the URL without horizontal overflow', async ({
  page,
}) => {
  await signIn(page, 'alpha-reviewer');
  await page.getByRole('tab', { name: 'Needs attention', exact: true }).click();
  await expect(page).toHaveURL(/\/app\?section=attention$/u);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
