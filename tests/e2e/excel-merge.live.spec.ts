import { readFile } from 'node:fs/promises';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

const livePhase11 = process.env.LIVE_PHASE11_E2E === 'true';
const expectAutomaticMerge = process.env.LIVE_PHASE11_AUTOMERGE === 'true';
const projectId = '40000000-0000-4000-8000-000000000001';

test.skip(
  !livePhase11,
  'Requires seeded PostgreSQL, Redis, MinIO, API, worker, engine, and web services.',
);

test('persists eligible Excel analysis for two stale-base users', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const documentName = `Phase 11 Excel ${testInfo.project.name} ${Date.now()}.xlsx`;
  await signIn(page);
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('spreadsheet');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();
  const historyUrl = page.url();

  await upload(
    page,
    excelPackage('Base forecast', 'Base actual'),
    'Common workbook base',
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

  await upload(
    page,
    excelPackage('Ours forecast', 'Base actual'),
    'Latest forecast edit',
  );
  await expect(
    version(page, 2).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await upload(
    stalePage,
    excelPackage('Base forecast', 'Incoming actual'),
    'Incoming actual edit',
  );
  await expect(
    stalePage.getByText('Upload preserved with a conflict.', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await stalePage.getByRole('button', { name: 'Cancel', exact: true }).click();
  await stalePage.close();

  await page.reload();
  await expect(
    version(page, 3).getByText('Conflicting', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await version(page, 3)
    .getByRole('button', { name: 'Merge with latest' })
    .click();

  if (expectAutomaticMerge) {
    await expect(
      page.getByText('Merged version created', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/applied using disjoint Excel cell values/u),
    ).toBeVisible();
    await expect(
      page.getByText(/Stable cell targets and unchanged workbook structure/u),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText('Manual resolution required', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(
        /cell changes passed the safety allowlist, but Excel pilot access is disabled/u,
      ),
    ).toBeVisible();
    await expect(page.getByText(/resolved automatically/u)).toHaveCount(0);
  }

  await expect(
    page.getByRole('heading', { name: 'Non-overlapping changes' }),
  ).toBeVisible();
  await expect(page.getByText(/Incoming: modified/u)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('phase11-live-excel-analysis.png'),
  });

  if (expectAutomaticMerge) {
    await page.getByRole('link', { name: 'View merged version' }).click();
    await expect(
      version(page, 4).getByText('Ready', { exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(version(page, 4)).toContainText('Merged from version 3');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      version(page, 4)
        .getByRole('button', { name: 'Download version 4' })
        .click(),
    ]);
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const evidencePath = testInfo.outputPath('phase11-merged-workbook.xlsx');
    await download.saveAs(evidencePath);
    const worksheet = zipTextEntry(
      await readFile(evidencePath),
      'xl/worksheets/sheet1.xml',
    );
    expect(worksheet).toContain('Ours forecast');
    expect(worksheet).toContain('Incoming actual');
    expect(worksheet).toContain('width="24"');
  }
});

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Local identity').selectOption('alpha-owner');
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

async function upload(page: Page, bytes: Buffer, note: string) {
  await page.getByRole('button', { name: 'Upload version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload version' });
  await dialog.getByLabel('Office file').setInputFiles({
    buffer: bytes,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    name: 'Phase 11 merge.xlsx',
  });
  await dialog.getByLabel('Version note').fill(note);
  await dialog.getByRole('button', { name: 'Upload version' }).click();
}

function version(page: Page, number: number) {
  return page.getByRole('article').filter({
    has: page.getByRole('heading', { exact: true, name: `Version ${number}` }),
  });
}

function excelPackage(firstValue: string, secondValue: string): Buffer {
  return zip([
    ['[Content_Types].xml', contentTypes],
    [
      '_rels/.rels',
      relationships([
        [
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
          'xl/workbook.xml',
        ],
      ]),
    ],
    ['xl/workbook.xml', workbook],
    [
      'xl/_rels/workbook.xml.rels',
      relationships([
        [
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
          'worksheets/sheet1.xml',
        ],
      ]),
    ],
    ['xl/worksheets/sheet1.xml', worksheet(firstValue, secondValue)],
  ]);
}

const spreadsheetNamespace =
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationshipNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const workbook = `<?xml version="1.0" encoding="utf-8"?><workbook xmlns="${spreadsheetNamespace}" xmlns:r="${relationshipNamespace}"><sheets><sheet name="Forecast" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const contentTypes = `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

function worksheet(firstValue: string, secondValue: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><worksheet xmlns="${spreadsheetNamespace}"><dimension ref="A1:B1"/><cols><col min="1" max="2" width="24" customWidth="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${escapeXml(firstValue)}</t></is></c><c r="B1" t="inlineStr"><is><t>${escapeXml(secondValue)}</t></is></c></row></sheetData></worksheet>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function relationships(values: Array<[string, string, string]>): string {
  return `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${values.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
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
  const directory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, directory, end]);
}

function zipTextEntry(archive: Buffer, target: string): string {
  const endOffset = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(endOffset).toBeGreaterThanOrEqual(0);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  let centralOffset = archive.readUInt32LE(endOffset + 16);
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex += 1) {
    expect(archive.readUInt32LE(centralOffset)).toBe(0x02014b50);
    const compression = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive
      .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString();
    if (name === target) {
      expect(archive.readUInt32LE(localOffset)).toBe(0x04034b50);
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const bytes = archive.subarray(dataOffset, dataOffset + compressedSize);
      if (compression === 0) return bytes.toString();
      if (compression === 8) return inflateRawSync(bytes).toString();
      throw new Error(`Unsupported ZIP compression method ${compression}.`);
    }
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP entry ${target} was not found.`);
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
