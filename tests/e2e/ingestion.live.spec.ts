import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const livePhase5 = process.env.LIVE_PHASE5_E2E === 'true';
const liveRestart = process.env.LIVE_PHASE5_RESTART_E2E === 'true';
const projectId = '40000000-0000-4000-8000-000000000001';
const fixturePath = path.resolve(
  'packages/test-fixtures/office/valid-word.docx',
);

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption('alpha-owner');
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

test.skip(
  !livePhase5,
  'Requires seeded PostgreSQL, Redis, MinIO, API, worker, engine, and web services.',
);

test('processes a valid OOXML package into a visible versioned snapshot', async ({
  page,
}, testInfo) => {
  const documentName = `Phase 5 inspection ${testInfo.project.name} ${Date.now()}.docx`;
  await signIn(page);
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('word_document');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();

  await page.getByRole('button', { name: 'Upload version' }).click();
  const upload = page.getByRole('dialog', { name: 'Upload version' });
  await upload.getByLabel('Office file').setInputFiles({
    buffer: await readFile(fixturePath),
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: 'Synthetic Phase 5 fixture.docx',
  });
  await upload
    .getByLabel('Version note')
    .fill('Secure OOXML ingestion fixture');
  await upload.getByRole('button', { name: 'Upload version' }).click();

  const version = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 1', exact: true }),
  });
  await expect(version.getByText('Ready', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(version).toContainText('Parser 1.1.0 / schema 1.1.0');
  await expect(version).toContainText('Snapshot');
  await expect(version).toContainText('Support');
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase5-history-${testInfo.project.name}.png`),
  });
});

test('persists queued ingestion while the worker is offline', async ({
  page,
}, testInfo) => {
  test.skip(!liveRestart || testInfo.project.name !== 'desktop-chromium');
  const documentName = `Phase 5 restart ${Date.now()}.docx`;
  await signIn(page);
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('word_document');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();

  await page.getByRole('button', { name: 'Upload version' }).click();
  const upload = page.getByRole('dialog', { name: 'Upload version' });
  await upload.getByLabel('Office file').setInputFiles({
    buffer: await readFile(fixturePath),
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: 'Synthetic restart fixture.docx',
  });
  await upload.getByLabel('Version note').fill('Durable restart verification');
  await upload.getByRole('button', { name: 'Upload version' }).click();

  const version = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 1', exact: true }),
  });
  await expect(version.getByText('Queued', { exact: true })).toBeVisible();
  await expect(version).toContainText('Support');
});
