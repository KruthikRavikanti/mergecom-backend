import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';

const livePhase4 = process.env.LIVE_PHASE4_E2E === 'true';
const appOrigin = 'http://127.0.0.1:5173';
const projectId = '40000000-0000-4000-8000-000000000001';

async function signIn(page: Page) {
  await page.goto(`${appOrigin}/login`);
  await page.getByLabel('Local identity').selectOption('alpha-owner');
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(`${appOrigin}/app`);
}

async function uploadVersion(page: Page, bytes: Buffer, note: string) {
  await page.getByRole('button', { name: 'Upload version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload version' });
  await dialog.getByLabel('Office file').setInputFiles({
    buffer: bytes,
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    name: 'Live Board Review.pptx',
  });
  await dialog.getByLabel('Version note').fill(note);
  await dialog.getByRole('button', { name: 'Upload version' }).click();
}

test.skip(
  !livePhase4,
  'Requires seeded PostgreSQL, MinIO, API, and web services.',
);

test('uploads, downloads, and restores exact artifacts through the live UI', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const documentName = `Live Artifact ${Date.now()}.pptx`;
  const v1 = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('live-version-one'),
  ]);
  const v2 = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('live-version-two'),
  ]);

  await signIn(page);
  await page.goto(`${appOrigin}/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('presentation');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();

  await uploadVersion(page, v1, 'Live initial version');
  await expect(page.getByRole('heading', { name: 'Version 1' })).toBeVisible();
  await uploadVersion(page, v2, 'Live second version');
  await expect(page.getByRole('heading', { name: 'Version 2' })).toBeVisible();

  const versionOne = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 1', exact: true }),
  });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    versionOne.getByRole('button', { name: 'Download version 1' }).click(),
  ]);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  expect(await readFile(downloadedPath!)).toEqual(v1);

  await versionOne.getByRole('button', { name: 'Restore version 1' }).click();
  await page
    .getByRole('dialog', { name: 'Restore as new version' })
    .getByRole('button', { name: 'Restore version' })
    .click();
  await expect(page.getByRole('heading', { name: 'Version 3' })).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('live-version-history.png'),
  });
});
