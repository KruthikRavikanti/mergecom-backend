import { expect, test, type Page } from '@playwright/test';

const livePhase3 = process.env.LIVE_PHASE3_E2E === 'true';
const appOrigin = 'http://127.0.0.1:5173';

async function signIn(page: Page, identity: string) {
  await page.goto(`${appOrigin}/login`);
  await page.getByLabel('Local identity').selectOption(identity);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(`${appOrigin}/app`);
}

test.skip(!livePhase3, 'Requires a seeded live Phase 3 API and web server.');

test('two browser contexts share project state and another tenant is denied', async ({
  browser,
}, testInfo) => {
  const ownerContext = await browser.newContext();
  const adminContext = await browser.newContext();
  const betaContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const adminPage = await adminContext.newPage();
  const betaPage = await betaContext.newPage();
  const projectName = `Browser shared ${testInfo.project.name} ${Date.now()}`;

  try {
    await signIn(ownerPage, 'alpha-owner');
    await signIn(adminPage, 'alpha-admin');

    await ownerPage.getByRole('button', { name: 'New project' }).click();
    await ownerPage.getByLabel('Project name').fill(projectName);
    await ownerPage.getByLabel('Client').fill('Live verification');
    await ownerPage.getByRole('button', { name: 'Create project' }).click();

    const ownerProjectLink = ownerPage.getByRole('link', {
      name: `Open ${projectName}`,
    });
    await expect(ownerProjectLink).toBeVisible();
    const projectPath = await ownerProjectLink.getAttribute('href');
    if (!projectPath) throw new Error('Created project link has no path.');
    expect(projectPath).toMatch(/^\/app\/projects\/[0-9a-f-]+$/u);

    await adminPage.reload();
    await expect(
      adminPage.getByRole('heading', { name: projectName, exact: true }),
    ).toBeVisible();
    await adminPage.screenshot({
      fullPage: true,
      path: testInfo.outputPath('shared-project.png'),
    });

    await signIn(betaPage, 'beta-owner');
    await betaPage.goto(`${appOrigin}${projectPath}`);
    await expect(
      betaPage.getByText('The project could not be loaded.'),
    ).toBeVisible();

    const projectCard = ownerPage
      .getByRole('article')
      .filter({ hasText: projectName });
    await projectCard.getByRole('button', { name: 'Delete project' }).click();
    await ownerPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete project' })
      .click();
    await expect(ownerProjectLink).toHaveCount(0);
  } finally {
    try {
      await ownerPage.goto(`${appOrigin}/app`);
      const cleanupCard = ownerPage
        .getByRole('article')
        .filter({ hasText: projectName });
      if (await cleanupCard.count()) {
        await cleanupCard
          .getByRole('button', { name: 'Delete project' })
          .click();
        await ownerPage
          .getByRole('dialog')
          .getByRole('button', { name: 'Delete project' })
          .click();
      }
    } catch {
      // Cleanup is best-effort so it cannot replace the original assertion error.
    }
    await ownerContext.close();
    await adminContext.close();
    await betaContext.close();
  }
});
