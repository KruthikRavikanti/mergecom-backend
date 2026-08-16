import { deflateRawSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

const livePhase8 = process.env.LIVE_PHASE8_E2E === 'true';
const projectId = '40000000-0000-4000-8000-000000000001';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption('alpha-owner');
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

async function uploadVersion(page: Page, bytes: Buffer, note: string) {
  await page.getByRole('button', { name: 'Upload version' }).click();
  const upload = page.getByRole('dialog', { name: 'Upload version' });
  await upload.getByLabel('Office file').setInputFiles({
    buffer: bytes,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: 'Phase 8 merge.docx',
  });
  await upload.getByLabel('Version note').fill(note);
  await upload.getByRole('button', { name: 'Upload version' }).click();
}

function version(page: Page, number: number) {
  return page.getByRole('article').filter({
    has: page.getByRole('heading', {
      exact: true,
      name: `Version ${number}`,
    }),
  });
}

test.skip(
  !livePhase8,
  'Requires seeded PostgreSQL, Redis, MinIO, API, worker, engine, and web services.',
);

test('publishes disjoint changes and stops overlapping changes for manual resolution', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const documentName = `Phase 8 merge ${testInfo.project.name} ${Date.now()}.docx`;
  await signIn(page);
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('word_document');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();
  const historyUrl = page.url();

  await uploadVersion(
    page,
    wordPackage('Revenue draft', 'Risk draft'),
    'Common merge base',
  );
  await expect(
    version(page, 1).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });

  const stalePage = await context.newPage();
  await stalePage.goto(historyUrl);
  await expect(
    version(stalePage, 1).getByText('Ready', { exact: true }),
  ).toBeVisible();

  await uploadVersion(
    page,
    wordPackage('Revenue final', 'Risk draft'),
    'Latest revenue edit',
  );
  await expect(
    version(page, 2).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });

  await uploadVersion(
    stalePage,
    wordPackage('Revenue draft', 'Risk final'),
    'Retained risk edit',
  );
  await expect(
    stalePage.getByText('Upload preserved with a conflict.', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await stalePage.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.reload();
  await expect(
    version(page, 3).getByText('Conflicting', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await version(page, 3)
    .getByRole('button', { name: 'Merge with latest' })
    .click();
  await expect(page).toHaveURL(/\/history\/merges\/[0-9a-f-]+$/u);
  await expect(
    page.getByText('Merged version created', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText(/1 conflicting-side change applied/u),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase8-auto-merge-${testInfo.project.name}.png`),
  });
  await page.getByRole('link', { name: 'View merged version' }).click();
  await expect(
    version(page, 4).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(version(page, 4)).toContainText('Merged from version 3');

  await stalePage.reload();
  await expect(
    version(stalePage, 4).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await uploadVersion(
    page,
    wordPackage('Revenue approved', 'Risk final'),
    'Latest approval edit',
  );
  await expect(
    version(page, 5).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await uploadVersion(
    stalePage,
    wordPackage('Revenue revised', 'Risk final'),
    'Overlapping retained edit',
  );
  await expect(
    stalePage.getByText('Upload preserved with a conflict.', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await stalePage.getByRole('button', { name: 'Cancel', exact: true }).click();
  await stalePage.close();

  await page.reload();
  await expect(
    version(page, 6).getByText('Conflicting', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await version(page, 6)
    .getByRole('button', { name: 'Merge with latest' })
    .click();
  await expect(page).toHaveURL(/\/history\/merges\/[0-9a-f-]+$/u);
  await expect(
    page.getByText('Manual resolution required', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText('Both versions changed the same content.'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download latest' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download conflicting' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      `phase8-manual-merge-${testInfo.project.name}.png`,
    ),
  });
});

function wordPackage(first: string, second: string): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="xml" ContentType="application/xml" />
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" />
</Types>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml" />
</Relationships>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${first}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${second}</w:t></w:r></w:p>
    <w:sectPr />
  </w:body>
</w:document>`;
  return zip([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', relationships],
    ['word/document.xml', document],
  ]);
}

function zip(entries: Array<[string, string]>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name);
    const source = Buffer.from(text);
    const compressed = deflateRawSync(source);
    const checksum = crc32(source);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(source.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(source.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
