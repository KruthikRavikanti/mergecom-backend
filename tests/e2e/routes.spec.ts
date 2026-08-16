import { expect, test, type Page } from '@playwright/test';

const organizationId = '10000000-0000-4000-8000-000000000001';
const projectId = '40000000-0000-4000-8000-000000000001';
const folderId = '50000000-0000-4000-8000-000000000001';
const documentId = '60000000-0000-4000-8000-000000000001';
const projectsPath = `/v1/organizations/${organizationId}/projects`;
const projectPath = `${projectsPath}/${projectId}`;

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

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
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
    if (path === `${projectPath}/documents/${documentId}` && method === 'GET') {
      await route.fulfill({ json: documents[0], status: 200 });
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
  { heading: 'Team', path: '/app/team' },
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

test('support reports delivery failure', async ({ page }) => {
  await page.goto('/support');
  await page.getByLabel('Name').fill('Casey Reviewer');
  await page.getByLabel('Work email').fill('casey@example.test');
  await page.getByLabel('How can we help?').fill('Test request');
  await page.getByRole('button', { name: 'Submit ticket' }).click();
  await expect(page.getByRole('alert')).toContainText('not submitted');
});
