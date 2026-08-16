import { expect, test, type Page } from '@playwright/test';

const organizationId = '10000000-0000-4000-8000-000000000001';
const projectId = '40000000-0000-4000-8000-000000000001';
const folderId = '50000000-0000-4000-8000-000000000001';
const documentId = '60000000-0000-4000-8000-000000000001';
const projectsPath = `/v1/organizations/${organizationId}/projects`;
const projectPath = `${projectsPath}/${projectId}`;
const documentPath = `${projectPath}/documents/${documentId}`;
const versionPath = `${documentPath}/versions`;
const reviewsPath = `${documentPath}/reviews`;
const notificationsPath = `/v1/organizations/${organizationId}/notifications`;
const reviewId = '92000000-0000-4000-8000-000000000001';
const reviewerUserId = '20000000-0000-4000-8000-000000000002';

const currentUser = {
  activeOrganization: {
    id: organizationId,
    name: 'Alpha Advisory',
    role: 'owner',
    status: 'active',
  },
  organizations: [
    {
      id: organizationId,
      name: 'Alpha Advisory',
      role: 'owner',
    },
  ],
  session: {
    csrfToken: 'browser-test-csrf-token',
    expiresAt: '2026-08-16T12:00:00.000Z',
  },
  user: {
    displayName: 'Avery Chen',
    email: 'avery@mergecom.test',
    emailVerified: true,
    id: '20000000-0000-4000-8000-000000000001',
  },
};

test.beforeEach(async ({ page }) => {
  let authenticated = false;
  const projects = [
    {
      accessRole: 'project_lead',
      archivedAt: null,
      clientName: 'Northstar Holdings',
      createdAt: '2026-08-01T12:00:00.000Z',
      createdBy: 'Avery Chen',
      documentCount: 1,
      folderCount: 1,
      id: projectId,
      name: 'Project Meridian',
      updatedAt: '2026-08-15T12:00:00.000Z',
    },
  ];
  const folders = [
    {
      id: folderId,
      name: 'Evidence Room',
      parentFolderId: null,
      sortOrder: 0,
      updatedAt: '2026-08-15T12:00:00.000Z',
    },
  ];
  const documents = [
    {
      archivedAt: null,
      createdAt: '2026-08-01T12:00:00.000Z',
      folderId: null,
      id: documentId,
      kind: 'presentation',
      name: 'Confidential Information Memorandum.pptx',
      sortOrder: 0,
      updatedAt: '2026-08-15T12:00:00.000Z',
    },
  ];
  const versions = [
    {
      artifact: {
        byteSize: 182400,
        detectedMediaType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: '.pptx',
        id: '80000000-0000-4000-8000-000000000002',
        originalFilename: 'Confidential Information Memorandum.pptx',
        scanStatus: 'pending',
        sha256: 'b'.repeat(64),
        storageChecksum: 'etag-v2',
        storageVersion: null,
      },
      author: {
        id: currentUser.user.id,
        name: currentUser.user.displayName,
      },
      baseVersionId: '90000000-0000-4000-8000-000000000001',
      branchId: '81000000-0000-4000-8000-000000000001',
      conflictReason: 'base_version_is_not_current_head',
      createdAt: '2026-08-15T14:00:00.000Z',
      displayNumber: 2,
      documentId,
      id: '90000000-0000-4000-8000-000000000002',
      mergeParentVersionId: null,
      note: 'Work prepared from the earlier client draft',
      parentVersionId: '90000000-0000-4000-8000-000000000001',
      processing: {
        attempts: 1,
        failureCode: null,
        maxAttempts: 3,
        nextAttemptAt: null,
        snapshot: {
          package: { entryCount: 14, hasMacros: true },
          parserVersion: '1.0.0',
          schemaVersion: '1.0.0',
          stableHash: 'd'.repeat(64),
          unsupportedFeatures: ['vba_macros'],
          validationErrorCount: 0,
          warnings: [
            {
              code: 'macros_present',
              message:
                'The package contains VBA macros. Macros were not executed.',
              part: null,
              severity: 'warning',
            },
          ],
        },
        state: 'completed',
        supportTraceId: '91000000-0000-4000-8000-000000000002',
        updatedAt: '2026-08-15T14:00:01.000Z',
      },
      sequence: 2,
      source: 'web_upload',
      status: 'conflicted',
    },
    {
      artifact: {
        byteSize: 176200,
        detectedMediaType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        extension: '.pptx',
        id: '80000000-0000-4000-8000-000000000001',
        originalFilename: 'Confidential Information Memorandum.pptx',
        scanStatus: 'pending',
        sha256: 'a'.repeat(64),
        storageChecksum: 'etag-v1',
        storageVersion: null,
      },
      author: {
        id: currentUser.user.id,
        name: currentUser.user.displayName,
      },
      baseVersionId: null,
      branchId: '81000000-0000-4000-8000-000000000001',
      conflictReason: null,
      createdAt: '2026-08-15T13:00:00.000Z',
      displayNumber: 1,
      documentId,
      id: '90000000-0000-4000-8000-000000000001',
      mergeParentVersionId: null,
      note: 'Initial management presentation',
      parentVersionId: null,
      processing: {
        attempts: 0,
        failureCode: null,
        maxAttempts: 3,
        nextAttemptAt: '2026-08-15T13:00:00.000Z',
        snapshot: null,
        state: 'queued',
        supportTraceId: '91000000-0000-4000-8000-000000000001',
        updatedAt: '2026-08-15T13:00:00.000Z',
      },
      sequence: 1,
      source: 'web_upload',
      status: 'pending_processing',
    },
  ];
  const review = {
    approvedVersion: null,
    assignments: [
      {
        decision: null,
        projectRole: 'reviewer',
        reviewer: { id: reviewerUserId, name: 'Riley Morgan' },
      },
    ],
    capabilities: {
      canCancel: true,
      canComment: true,
      canDecide: false,
    },
    closedAt: null,
    comparisonId: null,
    createdAt: '2026-08-15T14:10:00.000Z',
    id: reviewId,
    message: 'Confirm that the updated disclosure is ready for circulation.',
    requestedBy: {
      id: currentUser.user.id,
      name: currentUser.user.displayName,
    },
    status: 'open',
    threads: [],
    updatedAt: '2026-08-15T14:10:00.000Z',
    version: {
      author: {
        id: currentUser.user.id,
        name: currentUser.user.displayName,
      },
      createdAt: '2026-08-15T14:00:00.000Z',
      displayNumber: 2,
      id: '90000000-0000-4000-8000-000000000002',
      note: 'Work prepared from the earlier client draft',
    },
  };
  const notificationItems = [
    {
      body: 'A document version is waiting for your review.',
      category: 'review_activity',
      createdAt: '2026-08-16T14:00:00.000Z',
      eventType: 'review.requested',
      href: `/app/projects/${projectId}/documents/${documentId}/history/reviews/${reviewId}`,
      id: '93000000-0000-4000-8000-000000000001',
      readAt: null as string | null,
      title: 'Review requested',
    },
    {
      body: 'A requested version comparison is ready.',
      category: 'document_activity',
      createdAt: '2026-08-16T13:00:00.000Z',
      eventType: 'version.comparison_finished',
      href: `/app/projects/${projectId}/documents/${documentId}/history`,
      id: '93000000-0000-4000-8000-000000000002',
      readAt: null as string | null,
      title: 'Comparison ready',
    },
  ];
  let notificationPreferences = {
    emailAvailable: true,
    emailDocumentActivity: false,
    emailReviewActivity: false,
    inAppDocumentActivity: true,
    inAppReviewActivity: true,
    updatedAt: '2026-08-16T12:00:00.000Z',
  };
  let headVersionId = versions[1]!.id;

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/object-upload') {
      await route.fulfill({
        body: '',
        headers: {
          'access-control-allow-origin': '*',
          etag: 'browser-upload-etag',
        },
        status: 200,
      });
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }
    const path = url.pathname.replace(/^\/api/u, '');
    const method = request.method();

    if (path === '/auth/development/session') {
      authenticated = true;
      await route.fulfill({ json: { authenticated: true }, status: 200 });
      return;
    }
    if (path === '/v1/me') {
      await route.fulfill(
        authenticated
          ? { json: currentUser, status: 200 }
          : {
              json: {
                code: 'unauthenticated',
                message: 'Authentication is required.',
              },
              status: 401,
            },
      );
      return;
    }
    if (path.endsWith('/memberships')) {
      await route.fulfill({
        json: {
          memberships: [
            {
              email: 'avery@mergecom.test',
              id: '30000000-0000-4000-8000-000000000001',
              joinedAt: '2026-08-01T12:00:00.000Z',
              name: 'Avery Chen',
              role: 'owner',
              status: 'active',
              userId: '20000000-0000-4000-8000-000000000001',
            },
          ],
        },
        status: 200,
      });
      return;
    }
    if (path === `${notificationsPath}/preferences` && method === 'GET') {
      await route.fulfill({ json: notificationPreferences, status: 200 });
      return;
    }
    if (path === `${notificationsPath}/preferences` && method === 'PUT') {
      notificationPreferences = {
        ...notificationPreferences,
        ...(request.postDataJSON() as Omit<
          typeof notificationPreferences,
          'emailAvailable' | 'updatedAt'
        >),
        updatedAt: '2026-08-16T15:00:00.000Z',
      };
      await route.fulfill({ json: notificationPreferences, status: 200 });
      return;
    }
    if (path === notificationsPath && method === 'GET') {
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
      await route.fulfill({
        json: {
          items: notificationItems.filter(
            (notification) => !unreadOnly || !notification.readAt,
          ),
          nextCursor: null,
          unreadCount: notificationItems.filter(
            (notification) => !notification.readAt,
          ).length,
        },
        status: 200,
      });
      return;
    }
    if (path === `${notificationsPath}/read-all` && method === 'POST') {
      let updatedCount = 0;
      for (const notification of notificationItems) {
        if (!notification.readAt) {
          notification.readAt = '2026-08-16T15:00:00.000Z';
          updatedCount += 1;
        }
      }
      await route.fulfill({ json: { updatedCount }, status: 200 });
      return;
    }
    const notificationRead = path.match(
      new RegExp(`^${notificationsPath}/([0-9a-f-]+)/read$`, 'u'),
    );
    if (notificationRead && method === 'POST') {
      const notification = notificationItems.find(
        (candidate) => candidate.id === notificationRead[1],
      );
      if (!notification) {
        await route.fulfill({
          json: { code: 'not_found', message: 'Resource not found.' },
          status: 404,
        });
        return;
      }
      notification.readAt ??= '2026-08-16T15:00:00.000Z';
      await route.fulfill({ json: notification, status: 200 });
      return;
    }
    if (path === '/health/ready') {
      await route.fulfill({
        json: {
          dependencies: { database: 'ready' },
          service: 'api',
          status: 'ready',
        },
        status: 200,
      });
      return;
    }
    if (path === projectsPath && method === 'GET') {
      const archived = url.searchParams.get('archived') === 'true';
      await route.fulfill({
        json: {
          items: projects.filter(
            (project) => Boolean(project.archivedAt) === archived,
          ),
          nextCursor: null,
        },
        status: 200,
      });
      return;
    }
    if (path === projectsPath && method === 'POST') {
      const body = request.postDataJSON() as {
        clientName: string | null;
        name: string;
      };
      const created = {
        ...projects[0],
        clientName: body.clientName,
        documentCount: 0,
        folderCount: 0,
        id: '40000000-0000-4000-8000-000000000002',
        name: body.name,
      };
      projects.push(created);
      await route.fulfill({ json: created, status: 201 });
      return;
    }
    if (path === projectPath && method === 'GET') {
      await route.fulfill({ json: projects[0], status: 200 });
      return;
    }
    const projectUpdate = path.match(
      new RegExp(`^${projectsPath}/([0-9a-f-]+)$`, 'u'),
    );
    if (projectUpdate && method === 'PATCH') {
      const body = request.postDataJSON() as {
        clientName?: string | null;
        name?: string;
      };
      const project = projects.find(
        (candidate) => candidate.id === projectUpdate[1],
      );
      if (!project) {
        await route.fulfill({
          json: { code: 'not_found', message: 'Resource not found.' },
          status: 404,
        });
        return;
      }
      Object.assign(project, {
        ...(body.clientName !== undefined
          ? { clientName: body.clientName }
          : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        updatedAt: '2026-08-15T12:01:00.000Z',
      });
      await route.fulfill({ json: project, status: 200 });
      return;
    }
    if (path === `${projectPath}/folders` && method === 'GET') {
      const parentFolderId = url.searchParams.get('parentFolderId');
      await route.fulfill({
        json: {
          items: folders.filter(
            (folder) => folder.parentFolderId === parentFolderId,
          ),
          nextCursor: null,
        },
        status: 200,
      });
      return;
    }
    if (path === `${projectPath}/folders/${folderId}/path`) {
      await route.fulfill({
        json: { items: [{ id: folderId, name: 'Evidence Room' }] },
        status: 200,
      });
      return;
    }
    if (path === `${projectPath}/documents` && method === 'GET') {
      const archived = url.searchParams.get('archived') === 'true';
      const requestedFolderId = url.searchParams.get('folderId');
      await route.fulfill({
        json: {
          items: documents.filter(
            (document) =>
              document.folderId === requestedFolderId &&
              Boolean(document.archivedAt) === archived,
          ),
          nextCursor: null,
        },
        status: 200,
      });
      return;
    }
    if (path === documentPath && method === 'GET') {
      await route.fulfill({ json: documents[0], status: 200 });
      return;
    }
    if (path === versionPath && method === 'GET') {
      await route.fulfill({
        json: {
          branch: {
            headVersionId,
            id: '81000000-0000-4000-8000-000000000001',
            name: 'main',
          },
          items: versions,
          nextCursor: null,
        },
        status: 200,
      });
      return;
    }
    if (path === reviewsPath && method === 'GET') {
      await route.fulfill({
        json: { items: [review], nextCursor: null },
        status: 200,
      });
      return;
    }
    if (path === `${reviewsPath}/${reviewId}` && method === 'GET') {
      await route.fulfill({ json: review, status: 200 });
      return;
    }
    if (path === `${documentPath}/uploads` && method === 'POST') {
      await route.fulfill({
        json: {
          branch: {
            headVersionId,
            id: '81000000-0000-4000-8000-000000000001',
            name: 'main',
          },
          expiresAt: '2026-08-16T14:00:00.000Z',
          grant: {
            expiresAt: '2026-08-16T14:00:00.000Z',
            headers: {
              'content-type':
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            },
            method: 'PUT',
            url: 'http://127.0.0.1:5173/object-upload',
          },
          id: '82000000-0000-4000-8000-000000000001',
          mode: 'single',
          multipart: null,
        },
        status: 201,
      });
      return;
    }
    if (
      path ===
        `${documentPath}/uploads/82000000-0000-4000-8000-000000000001/finalize` &&
      method === 'POST'
    ) {
      const body = request.postDataJSON() as { note: string };
      const created = {
        ...versions[1]!,
        artifact: {
          ...versions[1]!.artifact,
          id: '80000000-0000-4000-8000-000000000003',
          sha256: 'c'.repeat(64),
        },
        baseVersionId: headVersionId,
        createdAt: '2026-08-15T15:00:00.000Z',
        displayNumber: 3,
        id: '90000000-0000-4000-8000-000000000003',
        note: body.note,
        parentVersionId: headVersionId,
        sequence: 3,
      };
      headVersionId = created.id;
      versions.unshift(created);
      await route.fulfill({
        json: {
          currentHeadVersionId: created.id,
          outcome: 'created',
          replayed: false,
          version: created,
        },
        status: 201,
      });
      return;
    }
    if (path.includes('/uploads/') && method === 'DELETE') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === `${projectPath}/team` && method === 'GET') {
      await route.fulfill({
        json: {
          items: [
            {
              addedAt: '2026-08-01T12:00:00.000Z',
              email: 'avery@mergecom.test',
              id: '70000000-0000-4000-8000-000000000001',
              name: 'Avery Chen',
              organizationMembershipId: '30000000-0000-4000-8000-000000000001',
              organizationRole: 'owner',
              role: 'project_lead',
              userId: '20000000-0000-4000-8000-000000000001',
            },
            {
              addedAt: '2026-08-01T12:00:00.000Z',
              email: 'riley@mergecom.test',
              id: '70000000-0000-4000-8000-000000000002',
              name: 'Riley Morgan',
              organizationMembershipId: '30000000-0000-4000-8000-000000000002',
              organizationRole: 'reviewer',
              role: 'reviewer',
              userId: reviewerUserId,
            },
          ],
          nextCursor: null,
        },
        status: 200,
      });
      return;
    }
    await route.fulfill({
      json: { code: 'not_found', message: 'Resource not found.' },
      status: 404,
    });
  });
});

const publicRoutes = [
  { heading: 'MergeCom', path: '/' },
  { heading: 'Sign in to MergeCom', path: '/login' },
  { heading: 'Join MergeCom', path: '/signup' },
  { heading: 'Current security posture', path: '/security' },
  { heading: 'Support', path: '/support' },
  { heading: 'Page not found', path: '/not-a-route' },
];

for (const route of publicRoutes) {
  test(`public route ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, exact: true }),
    ).toBeVisible();
  });
}

async function startIdentitySession(page: Page) {
  await page.goto('/login');
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app$/u);
}

const authenticatedRoutes = [
  { heading: 'Projects', path: '/app' },
  { heading: 'Project Meridian', path: `/app/projects/${projectId}` },
  {
    heading: 'Project Meridian',
    path: `/app/projects/${projectId}/folders/${folderId}`,
  },
  {
    heading: 'Confidential Information Memorandum.pptx',
    path: `/app/projects/${projectId}/documents/${documentId}/history`,
  },
  {
    heading: 'Version 2',
    path: `/app/projects/${projectId}/documents/${documentId}/history/reviews/${reviewId}`,
  },
  { heading: 'Team', path: '/app/team' },
  { heading: 'Notifications', path: '/app/notifications' },
  { heading: 'Settings', path: '/app/settings' },
  { heading: 'Workspace controls', path: '/app/admin' },
];

for (const route of authenticatedRoutes) {
  test(`authenticated route ${route.path}`, async ({ page }) => {
    await startIdentitySession(page);
    await page.goto(route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, exact: true }),
    ).toBeVisible();
  });
}

test('reads inbox activity and persists notification preferences', async ({
  page,
}, testInfo) => {
  await startIdentitySession(page);
  await page.goto('/app/notifications');
  await expect(
    page.getByText('Review requested', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Comparison ready', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('phase9-notifications.png'),
  });

  await page.getByRole('button', { name: /Review requested/u }).click();
  await expect(page).toHaveURL(
    new RegExp(`/history/reviews/${reviewId}$`, 'u'),
  );
  await page.goto('/app/settings');
  const reviewEmail = page.getByLabel('Review activity email');
  await reviewEmail.check();
  await expect(reviewEmail).toBeChecked();
  const documentInbox = page.getByLabel('Document activity in-app inbox');
  await documentInbox.uncheck();
  await expect(documentInbox).not.toBeChecked();

  await page.goto('/app/notifications');
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await page
    .getByRole('group', { name: 'Notification view' })
    .getByRole('button', { name: /^Unread/u })
    .click();
  await expect(
    page.getByRole('heading', { name: 'No unread notifications' }),
  ).toBeVisible();
});

test('creates a persisted project through the API boundary', async ({
  page,
}) => {
  await startIdentitySession(page);
  await page.getByRole('button', { name: 'New project' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Create project' });
  await createDialog.getByLabel('Project name').fill('Project Polaris');
  await createDialog.getByLabel('Client').fill('Polaris Industries');
  await createDialog.getByRole('button', { name: 'Create project' }).click();
  await expect(
    page.getByRole('heading', { name: 'Project Polaris', exact: true }),
  ).toBeVisible();
});

test('updates project metadata from the current saved state', async ({
  page,
}) => {
  await startIdentitySession(page);
  const projectCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Project Meridian', exact: true }),
  });
  await projectCard.getByRole('button', { name: 'Edit project' }).click();
  const editDialog = page.getByRole('dialog', {
    name: 'Edit Project Meridian',
  });
  await editDialog.getByLabel('Project name').fill('Project Meridian Updated');
  await editDialog.getByLabel('Client').fill('Northstar Capital');
  await editDialog.getByRole('button', { name: 'Save project' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'Project Meridian Updated',
      exact: true,
    }),
  ).toBeVisible();
});

test('navigates nested folders and project team', async ({ page }) => {
  await startIdentitySession(page);
  await page.getByRole('link', { name: 'Open Project Meridian' }).click();
  await page.getByRole('link', { name: 'Evidence Room' }).click();
  await expect(page).toHaveURL(new RegExp(`/folders/${folderId}$`, 'u'));
  await expect(
    page.getByRole('navigation', { name: 'Folder breadcrumb' }),
  ).toContainText('Evidence Room');
  await page
    .getByRole('navigation', { name: 'Project views' })
    .getByRole('link', { name: 'Team', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Project team', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: 'Avery Chen avery@mergecom.test' }),
  ).toBeVisible();
});

test('protected deep link returns after identity sign in', async ({ page }) => {
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/login\?returnTo=/u);
  await page
    .getByRole('button', { name: 'Continue with local identity' })
    .click();
  await expect(page).toHaveURL(/\/app\/settings$/u);
});

test('shows immutable history states and uploads a version with progress', async ({
  page,
}, testInfo) => {
  await startIdentitySession(page);
  await page.goto(`/app/projects/${projectId}/documents/${documentId}/history`);
  await expect(page.getByText('Conflicting', { exact: true })).toBeVisible();
  await expect(page.getByText('Processing', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Upload version' }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload version' });
  await dialog.getByLabel('Office file').setInputFiles({
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01]),
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    name: 'Board update.pptx',
  });
  await dialog.getByLabel('Version note').fill('Updated board narrative');
  await dialog.getByRole('button', { name: 'Upload version' }).click();
  await expect(page.getByRole('heading', { name: 'Version 3' })).toBeVisible();
  await expect(page.getByText('Updated board narrative')).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('phase4-history.png'),
  });
});

test('support reports delivery failure', async ({ page }) => {
  await page.goto('/support');
  await page.getByLabel('Name').fill('Casey Reviewer');
  await page.getByLabel('Work email').fill('casey@example.test');
  await page.getByLabel('How can we help?').fill('Test request');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByRole('alert')).toContainText('not submitted');
});
