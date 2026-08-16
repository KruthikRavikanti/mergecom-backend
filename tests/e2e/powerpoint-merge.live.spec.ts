import { deflateRawSync } from 'node:zlib';

import { expect, test, type Page } from '@playwright/test';

const livePhase10 = process.env.LIVE_PHASE10_E2E === 'true';
const expectAutomaticMerge = process.env.LIVE_PHASE10_AUTOMERGE === 'true';
const projectId = '40000000-0000-4000-8000-000000000001';

test.skip(
  !livePhase10,
  'Requires seeded PostgreSQL, Redis, MinIO, API, worker, engine, and web services.',
);

test('persists eligible PowerPoint analysis for two stale-base users', async ({
  context,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const documentName = `Phase 10 PowerPoint ${testInfo.project.name} ${Date.now()}.pptx`;
  await signIn(page);
  await page.goto(`/app/projects/${projectId}`);
  await page.getByRole('button', { name: 'Document', exact: true }).click();
  const create = page.getByRole('dialog', { name: 'Create document' });
  await create.getByLabel('Name').fill(documentName);
  await create.getByLabel('Document type').selectOption('presentation');
  await create.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('link', { name: documentName }).click();
  const historyUrl = page.url();

  await upload(
    page,
    powerPointPackage(['Base A'], ['Base B']),
    'Common deck base',
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
    powerPointPackage(['Ours A'], ['Base B']),
    'Latest slide one edit',
  );
  await expect(
    version(page, 2).getByText('Ready', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await upload(
    stalePage,
    powerPointPackage(['Base A'], ['Theirs B']),
    'Incoming slide two edit',
  );
  await expect(
    stalePage.getByText('Upload preserved with a conflict.', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await stalePage.getByRole('button', { name: 'Cancel', exact: true }).click();
  await stalePage.close();

  await page.reload();
  await expect(
    version(page, 3).getByText('Conflicting', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await version(page, 3)
    .getByRole('button', { name: 'Merge with latest' })
    .click();
  if (expectAutomaticMerge) {
    await expect(
      page.getByText('Merged version created', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/applied using disjoint PowerPoint slide text/u),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Stable text targets and unchanged package relationships/u,
      ),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText('Manual resolution required', { exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(
        /passed the safety allowlist, but workspace pilot access is disabled/u,
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
    path: testInfo.outputPath('phase10-live-powerpoint-analysis.png'),
  });
  if (expectAutomaticMerge) {
    await page.getByRole('link', { name: 'View merged version' }).click();
    await expect(
      version(page, 4).getByText('Ready', { exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(version(page, 4)).toContainText('Merged from version 3');
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
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    name: 'Phase 10 merge.pptx',
  });
  await dialog.getByLabel('Version note').fill(note);
  await dialog.getByRole('button', { name: 'Upload version' }).click();
}

function version(page: Page, number: number) {
  return page.getByRole('article').filter({
    has: page.getByRole('heading', { exact: true, name: `Version ${number}` }),
  });
}

function powerPointPackage(...slides: string[][]): Buffer {
  const entries: Array<[string, string]> = [
    ['[Content_Types].xml', contentTypes(slides.length)],
    [
      '_rels/.rels',
      relationships([
        [
          'rId1',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
          '/ppt/presentation.xml',
        ],
      ]),
    ],
    ['ppt/presentation.xml', presentation(slides.length)],
    [
      'ppt/_rels/presentation.xml.rels',
      relationships([
        [
          'rIdMaster',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
          '/ppt/slideMasters/slideMaster1.xml',
        ],
        ...slides.map(
          (_, index) =>
            [
              `rId${index + 1}`,
              'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
              `/ppt/slides/slide${index + 1}.xml`,
            ] as [string, string, string],
        ),
      ]),
    ],
    ['ppt/slideMasters/slideMaster1.xml', slideMaster],
    [
      'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      relationships([
        [
          'rIdLayout',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
          '/ppt/slideLayouts/slideLayout1.xml',
        ],
      ]),
    ],
    ['ppt/slideLayouts/slideLayout1.xml', slideLayout],
  ];
  slides.forEach((texts, index) => {
    entries.push([`ppt/slides/slide${index + 1}.xml`, slide(texts)]);
    entries.push([
      `ppt/slides/_rels/slide${index + 1}.xml.rels`,
      relationships([
        [
          'rIdLayout',
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
          '/ppt/slideLayouts/slideLayout1.xml',
        ],
      ]),
    ]);
  });
  return zip(entries);
}

const namespaces =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const shapeTreeRoot =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';

function presentation(count: number): string {
  const ids = Array.from(
    { length: count },
    (_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="utf-8"?><p:presentation ${namespaces}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function slide(texts: string[]): string {
  const shapes = texts
    .map(
      (text, index) =>
        `<p:sp><p:nvSpPr><p:cNvPr id="${index + 2}" name="Text ${index + 1}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="utf-8"?><p:sld ${namespaces}><p:cSld><p:spTree>${shapeTreeRoot}${shapes}</p:spTree></p:cSld></p:sld>`;
}

const slideLayout = `<?xml version="1.0" encoding="utf-8"?><p:sldLayout ${namespaces} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${shapeTreeRoot}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const slideMaster = `<?xml version="1.0" encoding="utf-8"?><p:sldMaster ${namespaces}><p:cSld><p:spTree>${shapeTreeRoot}</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`;

function relationships(values: Array<[string, string, string]>): string {
  return `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${values.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
}

function contentTypes(slideCount: number): string {
  const slides = Array.from(
    { length: slideCount },
    (_, index) =>
      `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join('');
  return `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>${slides}</Types>`;
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
