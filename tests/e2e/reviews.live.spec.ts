import { deflateRawSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

const livePhase7 = process.env.LIVE_PHASE7_E2E === 'true';
const projectId = '40000000-0000-4000-8000-000000000001';

async function signIn(page: Page, identity: string) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption(identity);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/u);
}

async function uploadVersion(page: Page, bytes: Buffer, note: string) {
  await page.getByRole('button', { name: 'Upload version' }).click();
  const upload = page.getByRole('dialog', { name: 'Upload version' });
  await upload.getByLabel('Office file').setInputFiles({
    buffer: bytes,
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    name: 'Phase 7 review.docx',
  });
  await upload.getByLabel('Version note').fill(note);
  await upload.getByRole('button', { name: 'Upload version' }).click();
}

test.skip(
  !livePhase7,
  'Requires seeded PostgreSQL, Redis, MinIO, API, worker, engine, and web services.',
);

test('requests, discusses, and approves an immutable version', async ({
  page,
}, testInfo) => {
  const documentName = `Phase 7 review ${testInfo.project.name} ${Date.now()}.docx`;
  await signIn(page, 'alpha-owner');
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('word_document');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();

  await uploadVersion(
    page,
    wordPackage('Preliminary diligence conclusion'),
    'Preliminary review draft',
  );
  const versionOne = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 1', exact: true }),
  });
  await expect(versionOne.getByText('Ready', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  await uploadVersion(
    page,
    wordPackage('Final diligence conclusion'),
    'Final review draft',
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
  await page.getByRole('button', { name: 'Compare versions' }).click();
  await expect(page).toHaveURL(/\/history\/comparisons\/[0-9a-f-]+$/u);
  await expect(page.getByText('Changes detected', { exact: true })).toBeVisible(
    { timeout: 20_000 },
  );

  await page.getByRole('button', { name: 'Request review' }).click();
  const request = page.getByRole('dialog', { name: 'Request review' });
  await request
    .getByRole('checkbox', { name: /alpha-reviewer@mergecom\.test/u })
    .check();
  await request
    .getByLabel('Review message')
    .fill('Validate the final conclusion and release language.');
  await request.getByRole('button', { name: 'Request review' }).click();
  await expect(page).toHaveURL(/\/history\/reviews\/[0-9a-f-]+$/u);
  const reviewPath = new URL(page.url()).pathname;
  await expect(
    page.getByRole('heading', { name: 'Version 2', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      `phase7-owner-review-${testInfo.project.name}.png`,
    ),
  });

  await signOut(page);
  await signIn(page, 'alpha-reviewer');
  await page.goto(reviewPath);
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page
    .getByRole('button', { name: /^Discuss /u })
    .first()
    .click();
  const discussion = page.getByRole('dialog', { name: /^Discuss /u });
  await discussion
    .getByLabel('Comment')
    .fill('The conclusion changed; confirm the support is reflected.');
  await discussion.getByRole('button', { name: 'Start discussion' }).click();

  const thread = page.getByRole('article').first();
  await expect(thread).toContainText('The conclusion changed');
  await thread
    .getByRole('textbox', { name: 'Reply', exact: true })
    .fill('Support confirmed against the final source package.');
  await thread.getByRole('button', { name: 'Send reply' }).click();
  await expect(thread).toContainText('Support confirmed');

  await page.getByRole('button', { name: 'Approve' }).click();
  const approval = page.getByRole('dialog', { name: 'Approve version' });
  await approval
    .getByLabel('Decision note')
    .fill('Approved after validating the final source and discussion.');
  await approval.getByRole('button', { name: 'Record decision' }).click();
  await expect(
    page.getByText('Approved', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resolve' })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      `phase7-approved-review-${testInfo.project.name}.png`,
    ),
  });

  await signOut(page);
  await signIn(page, 'alpha-owner');
  await page.goto(reviewPath.replace(/\/reviews\/[0-9a-f-]+$/u, ''));
  const approvedVersion = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Version 2', exact: true }),
  });
  await expect(
    approvedVersion.getByText('Approved', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      `phase7-approved-history-${testInfo.project.name}.png`,
    ),
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
    <w:p><w:r><w:t>Deterministic review fixture</w:t></w:r></w:p>
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
