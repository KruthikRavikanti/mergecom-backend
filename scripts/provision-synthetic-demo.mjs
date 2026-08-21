import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const apiOrigin = process.env.MERGECOM_API_ORIGIN ?? 'http://localhost:3001';
const webOrigin = process.env.MERGECOM_WEB_ORIGIN ?? 'http://localhost:5173';
const identity = process.env.MERGECOM_DEMO_IDENTITY ?? 'alpha-owner';
const fixtureRoot = resolve('packages/test-fixtures/office');
const projectName = '[SAMPLE] MergeCom Guided Tour';
const pollingDeadlineMs = Number(
  process.env.MERGECOM_DEMO_POLLING_TIMEOUT_MS ?? 180_000,
);

const samples = [
  {
    description:
      'Synthetic heading, paragraph, table value, formatting, and row changes.',
    documentName: '[SAMPLE] Word Review.docx',
    files: ['sample-word-v1.docx', 'sample-word-v2.docx'],
    kind: 'word_document',
    mediaType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    title: 'Review a synthetic Word revision',
  },
  {
    description:
      'Synthetic numeric, formula, hidden-cell, and structural row changes.',
    documentName: '[SAMPLE] Excel Review.xlsx',
    files: ['sample-excel-v1.xlsx', 'sample-excel-v2.xlsx'],
    kind: 'spreadsheet',
    mediaType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    title: 'Inspect a synthetic Excel model',
  },
  {
    description:
      'Synthetic slide text, shape position, and added-slide changes.',
    documentName: '[SAMPLE] PowerPoint Review.pptx',
    files: ['sample-powerpoint-v1.pptx', 'sample-powerpoint-v2.pptx'],
    kind: 'presentation',
    mediaType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    title: 'Compare a synthetic presentation',
  },
];

let cookie = '';
let csrfToken = '';

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  const method = options.method ?? 'GET';
  headers.set('accept', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (!['GET', 'HEAD'].includes(method)) {
    headers.set('origin', webOrigin);
    if (csrfToken) headers.set('x-csrf-token', csrfToken);
  }
  const response = await fetch(`${apiOrigin}${path}`, {
    ...options,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
  });
  const text = await response.text();
  const payload = text ? parseJson(text, path) : null;
  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} returned ${response.status}: ${payload?.message ?? text}`,
    );
  }
  return { payload, response };
}

async function listPaginated(path) {
  const items = [];
  let cursor = null;
  do {
    const separator = path.includes('?') ? '&' : '?';
    const query = new URLSearchParams({ limit: '100' });
    if (cursor) query.set('cursor', cursor);
    const { payload } = await request(`${path}${separator}${query}`);
    items.push(...payload.items);
    cursor = payload.nextCursor;
  } while (cursor);
  return items;
}

function parseJson(value, path) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Expected JSON from ${path}.`);
  }
}

function idempotencyKey(value) {
  return `mergecom-demo-${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

async function login() {
  const response = await fetch(`${apiOrigin}/auth/development/session`, {
    body: JSON.stringify({ identity }),
    headers: { 'content-type': 'application/json', origin: webOrigin },
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(
      `Development login failed with ${response.status}: ${await response.text()}`,
    );
  }
  const setCookie =
    response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie');
  cookie = setCookie?.split(';', 1)[0] ?? '';
  if (!cookie) throw new Error('Development login did not return a session.');
  const { payload: me } = await request('/v1/me');
  csrfToken = me.session.csrfToken;
  const organization = me.activeOrganization;
  if (!organization || !['owner', 'admin'].includes(organization.role)) {
    throw new Error(
      'Synthetic sample provisioning requires an active owner or admin session.',
    );
  }
  return organization;
}

async function findOrCreateProject(organizationId) {
  const path = `/v1/organizations/${organizationId}/projects`;
  const projects = await listPaginated(path);
  const existing = projects.find((project) => project.name === projectName);
  if (existing) return existing;
  const created = await request(path, {
    body: { clientName: 'Synthetic onboarding', name: projectName },
    headers: { 'idempotency-key': idempotencyKey(projectName) },
    method: 'POST',
  });
  return created.payload;
}

async function grantSampleAccess(organizationId, projectId) {
  const memberships = await request(
    `/v1/organizations/${organizationId}/memberships`,
  );
  const teamPath = `/v1/organizations/${organizationId}/projects/${projectId}/team`;
  const team = await listPaginated(teamPath);
  const current = new Map(
    team.map((member) => [member.organizationMembershipId, member]),
  );
  for (const membership of memberships.payload.memberships) {
    if (
      membership.status !== 'active' ||
      ['owner', 'admin'].includes(membership.role)
    ) {
      continue;
    }
    const assigned = current.get(membership.id);
    if (!assigned) {
      await request(teamPath, {
        body: { organizationMembershipId: membership.id, role: 'viewer' },
        method: 'POST',
      });
    } else if (assigned.role !== 'viewer') {
      await request(`${teamPath}/${assigned.id}`, {
        body: { role: 'viewer' },
        method: 'PATCH',
      });
    }
  }
}

async function findOrCreateDocument(organizationId, projectId, sample) {
  const path = `/v1/organizations/${organizationId}/projects/${projectId}/documents`;
  const documents = await listPaginated(path);
  const existing = documents.find(
    (document) => document.name === sample.documentName,
  );
  if (existing) {
    if (existing.kind !== sample.kind) {
      throw new Error(`${sample.documentName} exists with the wrong kind.`);
    }
    return existing;
  }
  const created = await request(path, {
    body: { folderId: null, kind: sample.kind, name: sample.documentName },
    headers: { 'idempotency-key': idempotencyKey(sample.documentName) },
    method: 'POST',
  });
  return created.payload;
}

async function fixture(file, mediaType) {
  const bytes = await readFile(resolve(fixtureRoot, file));
  return {
    bytes,
    filename: basename(file),
    mediaType,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function listVersions(basePath) {
  const { payload } = await request(`${basePath}/versions?limit=100`);
  return payload;
}

async function uploadFixture(basePath, item, baseVersionId) {
  const upload = await request(`${basePath}/uploads`, {
    body: {
      baseVersionId,
      byteSize: item.bytes.byteLength,
      clientMediaType: item.mediaType,
      filename: item.filename,
      sha256: item.sha256,
    },
    headers: {
      'idempotency-key': randomUUID(),
    },
    method: 'POST',
  });
  if (upload.payload.mode !== 'single' || !upload.payload.grant) {
    throw new Error(
      'Synthetic fixtures unexpectedly require multipart upload.',
    );
  }
  try {
    const grantHeaders = new Headers(upload.payload.grant.headers);
    const stored = await fetch(upload.payload.grant.url, {
      body: item.bytes,
      headers: grantHeaders,
      method: upload.payload.grant.method,
    });
    if (!stored.ok) {
      throw new Error(
        `Object storage rejected ${item.filename} with ${stored.status}.`,
      );
    }
    const finalized = await request(
      `${basePath}/uploads/${upload.payload.id}/finalize`,
      {
        body: {
          note: `Synthetic onboarding fixture ${item.filename}`,
          source: 'web_upload',
        },
        headers: {
          'idempotency-key': idempotencyKey(
            `finalize-${upload.payload.id}-${item.sha256}`,
          ),
        },
        method: 'POST',
      },
    );
    if (finalized.payload.outcome !== 'created') {
      throw new Error(`${item.filename} finalized as a branch conflict.`);
    }
    return finalized.payload.version;
  } catch (error) {
    await request(`${basePath}/uploads/${upload.payload.id}`, {
      method: 'DELETE',
    }).catch(() => undefined);
    throw error;
  }
}

async function ensureVersions(basePath, sample) {
  const fixtures = await Promise.all(
    sample.files.map((file) => fixture(file, sample.mediaType)),
  );
  let page = await listVersions(basePath);
  const versions = [];
  for (const item of fixtures) {
    let version = page.items.find(
      (candidate) => candidate.artifact.sha256 === item.sha256,
    );
    if (!version) {
      version = await uploadFixture(basePath, item, page.branch.headVersionId);
      page = await listVersions(basePath);
    }
    versions.push(version);
  }
  for (const version of versions) {
    await waitForVersion(basePath, version.id);
  }
  return versions;
}

async function waitForVersion(basePath, versionId) {
  const deadline = Date.now() + pollingDeadlineMs;
  while (Date.now() < deadline) {
    const page = await listVersions(basePath);
    const version = page.items.find((item) => item.id === versionId);
    if (!version) throw new Error(`Version ${versionId} disappeared.`);
    if (version.processing.state === 'completed') return version;
    if (
      ['permanently_failed', 'quarantined'].includes(version.processing.state)
    ) {
      throw new Error(
        `Version ${versionId} processing ended as ${version.processing.state}.`,
      );
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for version ${versionId}.`);
}

async function ensureComparison(basePath, versions) {
  const [baseVersion, targetVersion] = versions;
  const created = await request(`${basePath}/comparisons`, {
    body: {
      baseVersionId: baseVersion.id,
      targetVersionId: targetVersion.id,
    },
    headers: {
      'idempotency-key': idempotencyKey(
        `comparison-${baseVersion.id}-${targetVersion.id}`,
      ),
    },
    method: 'POST',
  });
  const comparisonId = created.payload.id;
  const deadline = Date.now() + pollingDeadlineMs;
  while (Date.now() < deadline) {
    const comparison = await request(`${basePath}/comparisons/${comparisonId}`);
    if (comparison.payload.state === 'completed') {
      await request(`${basePath}/comparisons/${comparisonId}/summary`);
      return comparison.payload;
    }
    if (
      ['permanently_failed', 'quarantined'].includes(comparison.payload.state)
    ) {
      throw new Error(
        `Comparison ${comparisonId} ended as ${comparison.payload.state}.`,
      );
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for comparison ${comparisonId}.`);
}

async function registerSample(
  organizationId,
  projectId,
  documentId,
  sample,
  comparisonId,
) {
  return request(`/v1/organizations/${organizationId}/onboarding/samples`, {
    body: {
      comparisonId,
      description: sample.description,
      documentId,
      kind: sample.kind,
      projectId,
      title: sample.title,
    },
    method: 'POST',
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function main() {
  const organization = await login();
  const project = await findOrCreateProject(organization.id);
  await grantSampleAccess(organization.id, project.id);
  const results = [];
  for (const sample of samples) {
    const document = await findOrCreateDocument(
      organization.id,
      project.id,
      sample,
    );
    const basePath = `/v1/organizations/${organization.id}/projects/${project.id}/documents/${document.id}`;
    const versions = await ensureVersions(basePath, sample);
    const comparison = await ensureComparison(basePath, versions);
    const registered = await registerSample(
      organization.id,
      project.id,
      document.id,
      sample,
      comparison.id,
    );
    results.push(registered.payload);
    console.log(`Registered ${sample.kind}: ${registered.payload.destination}`);
  }
  console.log(
    `Provisioned ${results.length} synthetic comparisons in ${organization.name}.`,
  );
}

await main();
