import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

const livePhase12 = process.env.LIVE_PHASE12_E2E === 'true';
const officeAddinUrl = process.env.OFFICE_ADDIN_URL ?? 'https://127.0.0.1:5176';
const packageBytes = Buffer.from([
  0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, 0x08, 0x00,
]);

test.use({ ignoreHTTPSErrors: true });
test.skip(!livePhase12, 'Requires the Phase 12 HTTPS Office task pane.');

test.beforeEach(async ({ page }) => {
  await page.route('**/office.js', (route) => route.abort());
});

test('captures exact Excel bytes through an Office.js host', async ({
  page,
}, testInfo) => {
  await installOfficeMock(page, {
    bytes: Array.from(packageBytes),
    fileName: 'Forecast Q3.xlsx',
    host: 'Excel',
    platform: 'PC',
    requirementSupported: true,
  });

  await page.goto(officeAddinUrl);
  await expect(
    page.getByRole('heading', { name: 'Workbook connected' }),
  ).toBeVisible();
  await expect(page.getByText('Exact OOXML', { exact: true })).toBeVisible();

  const captureEvent = page.evaluate(
    () =>
      new Promise<{ descriptor: { contentLength: number; sha256: string } }>(
        (resolve) => {
          window.addEventListener(
            'mergecom:office-package-captured',
            (event) => {
              resolve(
                (event as CustomEvent<{ descriptor: object }>).detail as {
                  descriptor: { contentLength: number; sha256: string };
                },
              );
            },
            { once: true },
          );
        },
      ),
  );
  await page.getByRole('button', { name: 'Capture current version' }).click();

  await expect(page.getByText('Exact package captured')).toBeVisible();
  const capture = await captureEvent;
  expect(capture.descriptor).toEqual({
    contentLength: packageBytes.byteLength,
    fileName: 'Forecast Q3.xlsx',
    mediaType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sha256: createHash('sha256').update(packageBytes).digest('hex'),
    sourceHost: 'excel',
  });
  expect(
    await page.evaluate(() => {
      const state = window as unknown as {
        officeCaptureCalls: { close: number; slices: number[] };
      };
      return state.officeCaptureCalls;
    }),
  ).toEqual({ close: 1, slices: [0, 1] });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download captured copy' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('Forecast Q3.xlsx');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`phase12-capture-${testInfo.project.name}.png`),
  });
});

test('refuses Word package capture on Office on the web', async ({ page }) => {
  await installOfficeMock(page, {
    bytes: Array.from(packageBytes),
    fileName: 'Proposal.docx',
    host: 'Word',
    platform: 'OfficeOnline',
    requirementSupported: true,
  });

  await page.goto(officeAddinUrl);
  await expect(
    page.getByRole('heading', { name: 'Document connected' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Exact word package capture is not supported on office-online.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Capture current version' }),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test('refuses macro-enabled Excel capture on Mac', async ({ page }) => {
  await installOfficeMock(page, {
    bytes: Array.from(packageBytes),
    fileName: 'Signed forecast.xlsm',
    host: 'Excel',
    platform: 'Mac',
    requirementSupported: true,
  });

  await page.goto(officeAddinUrl);
  await expect(
    page.getByText(
      'Excel on Mac omits VBA signature parts from compressed .xlsm files.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Capture current version' }),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

test('marks a regular browser tab as a preview', async ({ page }) => {
  await page.goto(`${officeAddinUrl}/?host=powerpoint`);
  await expect(
    page.getByRole('heading', { name: 'Open inside PowerPoint' }),
  ).toBeVisible();
  await expect(
    page.getByText('Browser preview', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Capture current version' }),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

interface OfficeMockOptions {
  bytes: number[];
  fileName: string;
  host: 'Excel' | 'PowerPoint' | 'Word';
  platform: 'Mac' | 'OfficeOnline' | 'PC' | 'iOS';
  requirementSupported: boolean;
}

async function installOfficeMock(
  page: Page,
  options: OfficeMockOptions,
): Promise<void> {
  await page.addInitScript((mockOptions) => {
    const slices = [mockOptions.bytes.slice(0, 4), mockOptions.bytes.slice(4)];
    const state = window as unknown as {
      Office: object;
      officeCaptureCalls: { close: number; slices: number[] };
    };
    state.officeCaptureCalls = { close: 0, slices: [] };
    state.Office = {
      AsyncResultStatus: { Failed: 'failed', Succeeded: 'succeeded' },
      FileType: { Compressed: 'compressed' },
      HostType: {
        Excel: 'Excel',
        PowerPoint: 'PowerPoint',
        Word: 'Word',
      },
      PlatformType: {
        Android: 'Android',
        Mac: 'Mac',
        OfficeOnline: 'OfficeOnline',
        PC: 'PC',
        Universal: 'Universal',
        iOS: 'iOS',
      },
      context: {
        document: {
          getFileAsync: (
            _fileType: string,
            _options: object,
            callback: (result: object) => void,
          ) => {
            callback({
              status: 'succeeded',
              value: {
                closeAsync: (closeCallback: (result: object) => void) => {
                  state.officeCaptureCalls.close += 1;
                  closeCallback({ status: 'succeeded', value: undefined });
                },
                getSliceAsync: (
                  index: number,
                  sliceCallback: (result: object) => void,
                ) => {
                  state.officeCaptureCalls.slices.push(index);
                  sliceCallback({
                    status: 'succeeded',
                    value: { data: slices[index], index },
                  });
                },
                size: mockOptions.bytes.length,
                sliceCount: slices.length,
              },
            });
          },
          url: `https://contoso.example/files/${encodeURIComponent(mockOptions.fileName)}`,
        },
        requirements: {
          isSetSupported: () => mockOptions.requirementSupported,
        },
      },
      onReady: () =>
        Promise.resolve({
          host: mockOptions.host,
          platform: mockOptions.platform,
        }),
    };
  }, options);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
