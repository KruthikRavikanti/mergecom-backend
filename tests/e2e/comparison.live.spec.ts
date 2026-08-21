import { deflateRawSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

const livePhase6 = process.env.LIVE_PHASE6_E2E === 'true';
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
    name: 'Phase 6 comparison.docx',
  });
  await upload.getByLabel('Version note').fill(note);
  await upload.getByRole('button', { name: 'Upload version' }).click();
}

test.skip(
  !livePhase6,
  'Requires seeded PostgreSQL, Redis, MinIO, API, worker, engine, and web services.',
);

test('compares two normalized versions and displays typed content changes', async ({
  page,
}, testInfo) => {
  const documentName = `Phase 6 comparison ${testInfo.project.name} ${Date.now()}.docx`;
  await signIn(page);
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('word_document');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();

  await uploadVersion(
    page,
    wordPackage('Quarterly operating review'),
    'Quarterly draft',
  );
  const versionOne = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 1', exact: true }),
  });
  await expect(versionOne.getByText('Ready', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await uploadVersion(
    page,
    wordPackage('Annual operating review'),
    'Annual update',
  );
  const versionTwo = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 2', exact: true }),
  });
  await expect(versionTwo.getByText('Ready', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await page
    .getByRole('checkbox', { name: 'Select version 1 for comparison' })
    .check();
  await page
    .getByRole('checkbox', { name: 'Select version 2 for comparison' })
    .check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase6-history-${testInfo.project.name}.png`),
  });
  await page.getByRole('button', { name: 'Compare versions' }).click();
  await expect(page).toHaveURL(/\/history\/comparisons\/[0-9a-f-]+/u);
  await expect(page.getByText('Changes detected', { exact: true })).toBeVisible(
    {
      timeout: 20_000,
    },
  );
  await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible();
  await expect(page.getByText('DETERMINISTIC SUMMARY')).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Comparison scope' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Substantive/u }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('scope'))
    .toBe('substantive');
  await page.getByRole('button', { name: /^All /u }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('scope'))
    .toBe('all');
  const report = page.getByRole('link', { name: 'Export report' });
  await expect(report).toHaveAttribute('href', /includeValues=false/u);
  await page.getByLabel('Include before/after values').check();
  await expect(report).toHaveAttribute('href', /includeValues=true/u);
  const renderedPages = page.getByLabel('Rendered page 1');
  await expect(renderedPages).toHaveCount(2, { timeout: 30_000 });
  await expect(
    page.locator('canvas[aria-label="Rendered page 1"]:visible').first(),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase6-visual-${testInfo.project.name}.png`),
  });
  await page.getByRole('button', { name: 'Structured' }).click();
  if (testInfo.project.name === 'mobile-chromium') {
    await page.getByRole('button', { name: 'Before', exact: true }).click();
    await expect(page.getByRole('article')).toContainText(
      'Quarterly operating review',
    );
    await page.getByRole('button', { name: 'After', exact: true }).click();
    await expect(page.getByRole('article')).toContainText(
      'Annual operating review',
    );
  } else {
    await expect(page.getByRole('article').nth(0)).toContainText(
      'Quarterly operating review',
    );
    await expect(page.getByRole('article').nth(1)).toContainText(
      'Annual operating review',
    );
  }
  await page.getByRole('option').first().click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('mode'))
    .toBe('structured');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('change'))
    .toMatch(/^[0-9a-f]{64}$/u);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase6-comparison-${testInfo.project.name}.png`),
  });
});

function wordPackage(heading: string): Buffer {
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
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1" /></w:pPr>
      <w:r><w:t>${heading}</w:t></w:r>
    </w:p>
    <w:p><w:r><w:t>Deterministic comparison fixture</w:t></w:r></w:p>
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
    local.writeUInt16LE(0, 6);
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
    central.writeUInt16LE(0, 8);
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
