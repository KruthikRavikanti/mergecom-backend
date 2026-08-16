import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const livePhase13 = process.env.LIVE_PHASE13_E2E === 'true';
const officeAddinUrl = process.env.OFFICE_ADDIN_URL ?? 'https://localhost:5176';
const wordFixturePath = resolve(
  process.cwd(),
  'packages/test-fixtures/office/valid-word.docx',
);

test.use({ ignoreHTTPSErrors: true });
test.skip(!livePhase13, 'Requires the Phase 13 HTTPS Office task pane.');

test.beforeEach(async ({ page }) => {
  await page.route('**/office.js', (route) => route.abort());
});

test('shows an explicit signed-out Office state', async ({ page }) => {
  await installOfficeMock(page, {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    fileName: 'Board Review Deck.pptx',
    host: 'PowerPoint',
    platform: 'PC',
    requirementSupported: true,
  });

  await page.goto(officeAddinUrl);
  await expect(
    page.getByRole('heading', { name: 'Sign in to MergeCom' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('creates and exchanges a one-use Office dialog handoff', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as unknown as {
      Office: object;
      officeAuthenticationMessage?: string;
      officeAuthenticationTarget?: string;
    };
    state.Office = {
      context: {
        ui: {
          messageParent: (
            message: string,
            options?: { targetOrigin?: string },
          ) => {
            state.officeAuthenticationMessage = message;
            state.officeAuthenticationTarget = options?.targetOrigin;
          },
        },
      },
      onReady: () => Promise.resolve(),
    };
  });

  await page.goto(`${officeAddinUrl}/office-auth.html`);
  const message = await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window as unknown as {
          officeAuthenticationMessage?: string;
        };
        return state.officeAuthenticationMessage ?? null;
      }),
    )
    .not.toBeNull()
    .then(() =>
      page.evaluate(() => {
        const state = window as unknown as {
          officeAuthenticationMessage: string;
        };
        return state.officeAuthenticationMessage;
      }),
    );
  const payload = JSON.parse(message) as { code: string; type: string };
  expect(payload.type).toBe('mergecom-office-session');
  expect(payload.code).toMatch(/^office_handoff_[A-Za-z0-9_-]{43}$/u);
  expect(
    await page.evaluate(() => {
      const state = window as unknown as {
        officeAuthenticationTarget?: string;
      };
      return state.officeAuthenticationTarget;
    }),
  ).toBe(new URL(officeAddinUrl).origin);

  const exchange = await page.evaluate(async (code) => {
    const response = await fetch('/api/auth/office/exchange', {
      body: JSON.stringify({ code }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    return response.status;
  }, payload.code);
  expect(exchange).toBe(200);
  expect(
    await page.evaluate(async () => (await fetch('/api/v1/me')).status),
  ).toBe(200);
  expect(
    await page.evaluate(async (code) => {
      const response = await fetch('/api/auth/office/exchange', {
        body: JSON.stringify({ code }),
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      return response.status;
    }, payload.code),
  ).toBe(400);
});

test('refuses unsupported exact host capture before authentication', async ({
  page,
}) => {
  await installOfficeMock(page, {
    bytes: [0x50, 0x4b, 0x03, 0x04],
    fileName: 'Proposal.docx',
    host: 'Word',
    platform: 'OfficeOnline',
    requirementSupported: true,
  });

  await page.goto(officeAddinUrl);
  await expect(
    page.getByText(
      'Exact word package capture is not supported on office-online.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Push exact version' }),
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
  await expectNoHorizontalOverflow(page);
});

test('pushes, processes, and downloads exact Word bytes', async ({
  page,
}, testInfo) => {
  const bytes = await readFile(wordFixturePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const proxiedBlobRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/blob/')) {
      proxiedBlobRequests.push(request.url());
    }
  });
  await createDevelopmentSession(page.request);
  const currentUser = await getJson<CurrentUserResponse>(
    await page.request.get(`${officeAddinUrl}/api/v1/me`),
  );
  if (!currentUser.activeOrganization) {
    throw new Error('The development identity has no active organization.');
  }
  const organizationId = currentUser.activeOrganization.id;
  const headers = mutationHeaders(currentUser.session.csrfToken);
  const projectName = `Office Push ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;
  const project = await getJson<IdResponse>(
    await page.request.post(
      `${officeAddinUrl}/api/v1/organizations/${organizationId}/projects`,
      {
        data: { clientName: 'Synthetic verification', name: projectName },
        headers,
      },
    ),
    201,
  );
  const documentName = `Exact package ${randomUUID().slice(0, 8)}.docx`;
  const document = await getJson<IdResponse>(
    await page.request.post(
      `${officeAddinUrl}/api/v1/organizations/${organizationId}/projects/${project.id}/documents`,
      {
        data: {
          folderId: null,
          kind: 'word_document',
          name: documentName,
        },
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
      },
    ),
    201,
  );

  await installOfficeMock(page, {
    bytes: [...bytes],
    fileName: documentName,
    host: 'Word',
    platform: 'PC',
    requirementSupported: true,
  });
  await page.goto(officeAddinUrl);
  await expect(
    page.getByRole('heading', { name: 'Link document' }),
  ).toBeVisible();
  await page.getByLabel('Project').selectOption({ label: projectName });
  await expect(page.getByLabel('Document')).toBeEnabled();
  await page.getByLabel('Document').selectOption({ label: documentName });
  await page.getByRole('button', { name: 'Link current file' }).click();

  await expect(page.getByRole('heading', { name: documentName })).toBeVisible();
  await expect(page.getByText('First version', { exact: true })).toBeVisible();
  await page.getByLabel('Version note').fill('Phase 13 exact Office push');
  await page.getByRole('button', { name: 'Push exact version' }).click();
  await expect(page.getByText('V1 finalized successfully.')).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText('Processing complete')).toBeVisible();
  expect(proxiedBlobRequests).toHaveLength(1);

  const versionPage = await getJson<VersionPageResponse>(
    await page.request.get(
      `${officeAddinUrl}/api/v1/organizations/${organizationId}/projects/${project.id}/documents/${document.id}/versions?limit=10`,
    ),
  );
  expect(versionPage.items).toHaveLength(1);
  const version = versionPage.items[0];
  expect(version).toMatchObject({
    artifact: { sha256 },
    source: 'office_addin',
    status: 'ready',
  });

  const download = await getJson<DownloadGrantResponse>(
    await page.request.post(
      `${officeAddinUrl}/api/v1/organizations/${organizationId}/projects/${project.id}/documents/${document.id}/versions/${version!.id}/download`,
      { headers },
    ),
  );
  const downloaded = await page.request.get(download.url);
  expect(downloaded.ok()).toBe(true);
  expect(Buffer.from(await downloaded.body())).toEqual(bytes);
  expect(download.sha256).toBe(sha256);
  expect(
    await page.evaluate(() => {
      const state = window as unknown as {
        officeCaptureCalls: { close: number; slices: number[] };
      };
      return state.officeCaptureCalls.close;
    }),
  ).toBe(2);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      `phase13-office-push-${testInfo.project.name}.png`,
    ),
  });
});

interface OfficeMockOptions {
  bytes: number[];
  fileName: string;
  host: 'Excel' | 'PowerPoint' | 'Word';
  platform: 'Mac' | 'OfficeOnline' | 'PC' | 'iOS';
  requirementSupported: boolean;
}

interface CurrentUserResponse {
  activeOrganization: { id: string } | null;
  session: { csrfToken: string };
}

interface IdResponse {
  id: string;
}

interface VersionPageResponse {
  items: Array<{
    artifact: { sha256: string };
    id: string;
    source: string;
    status: string;
  }>;
}

interface DownloadGrantResponse {
  sha256: string;
  url: string;
}

async function createDevelopmentSession(request: APIRequestContext) {
  const response = await request.post(
    `${officeAddinUrl}/api/auth/development/session`,
    { data: { identity: 'alpha-owner' } },
  );
  expect(response.status(), await response.text()).toBe(200);
}

function mutationHeaders(csrfToken: string) {
  return {
    'Idempotency-Key': randomUUID(),
    Origin: new URL(officeAddinUrl).origin,
    'X-CSRF-Token': csrfToken,
  };
}

async function getJson<T>(
  response: Awaited<ReturnType<APIRequestContext['get']>>,
  expectedStatus = 200,
): Promise<T> {
  expect(response.status(), await response.text()).toBe(expectedStatus);
  return (await response.json()) as T;
}

async function installOfficeMock(
  page: Page,
  options: OfficeMockOptions,
): Promise<void> {
  await page.addInitScript((mockOptions) => {
    const sliceSize = 32 * 1024;
    const slices: number[][] = [];
    for (
      let offset = 0;
      offset < mockOptions.bytes.length;
      offset += sliceSize
    ) {
      slices.push(mockOptions.bytes.slice(offset, offset + sliceSize));
    }
    const settings = new Map<string, unknown>();
    const state = window as unknown as {
      Office: object;
      officeCaptureCalls: { close: number; slices: number[] };
      openedOfficeUrl?: string;
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
          settings: {
            get: (name: string) => settings.get(name) ?? null,
            remove: (name: string) => settings.delete(name),
            saveAsync: (callback: (result: object) => void) =>
              callback({ status: 'succeeded', value: undefined }),
            set: (name: string, value: unknown) => settings.set(name, value),
          },
          url: `https://contoso.example/files/${encodeURIComponent(mockOptions.fileName)}`,
        },
        requirements: {
          isSetSupported: () => mockOptions.requirementSupported,
        },
        ui: {
          openBrowserWindow: (url: string) => {
            state.openedOfficeUrl = url;
          },
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
