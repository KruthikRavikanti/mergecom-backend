import { createDatabase } from './database';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Local identity seed data cannot be created in production.');
}
if ((process.env.AUTH_MODE ?? 'development') !== 'development') {
  throw new Error('Set AUTH_MODE=development to create local identity data.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
  throw new Error('DATABASE_URL is required to seed identity data.');

const roles = [
  'owner',
  'admin',
  'project_lead',
  'contributor',
  'reviewer',
  'viewer',
  'external_reviewer',
] as const;
const organizations = [
  { name: 'Alpha Advisory', slug: 'alpha-advisory' },
  { name: 'Beta Capital', slug: 'beta-capital' },
] as const;
const projectSeeds = {
  'alpha-advisory': [
    {
      clientName: 'Northstar Holdings',
      documents: [
        {
          folderId: null,
          id: '60000000-0000-4000-8000-000000000001',
          kind: 'presentation',
          name: 'Confidential Information Memorandum.pptx',
        },
        {
          folderId: '50000000-0000-4000-8000-000000000001',
          id: '60000000-0000-4000-8000-000000000002',
          kind: 'spreadsheet',
          name: 'Operating Model.xlsx',
        },
      ],
      folders: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          name: 'Financial Analysis',
          parentFolderId: null,
        },
        {
          id: '50000000-0000-4000-8000-000000000002',
          name: 'Supporting Schedules',
          parentFolderId: '50000000-0000-4000-8000-000000000001',
        },
      ],
      id: '40000000-0000-4000-8000-000000000001',
      name: 'Project Meridian',
    },
    {
      clientName: 'Cedar Ridge Software',
      documents: [
        {
          folderId: null,
          id: '60000000-0000-4000-8000-000000000003',
          kind: 'word_document',
          name: 'Investment Committee Brief.docx',
        },
      ],
      folders: [],
      id: '40000000-0000-4000-8000-000000000002',
      name: 'Project Atlas',
    },
    {
      clientName: 'Beacon Industrial',
      documents: [
        {
          folderId: null,
          id: '60000000-0000-4000-8000-000000000004',
          kind: 'presentation',
          name: 'Board Review Deck.pptx',
        },
      ],
      folders: [],
      id: '40000000-0000-4000-8000-000000000003',
      name: 'Project Harbor',
    },
  ],
  'beta-capital': [
    {
      clientName: 'Lighthouse Systems',
      documents: [
        {
          folderId: null,
          id: '60000000-0000-4000-8000-000000000101',
          kind: 'spreadsheet',
          name: 'Revenue Build.xlsx',
        },
      ],
      folders: [],
      id: '40000000-0000-4000-8000-000000000101',
      name: 'Project Aurora',
    },
  ],
} as const;

const database = createDatabase(databaseUrl);
const client = await database.pool.connect();
try {
  await client.query('begin');
  for (const organization of organizations) {
    const organizationResult = await client.query<{ id: string }>(
      `insert into organizations (name, slug)
       values ($1, $2)
       on conflict (slug) do update set name = excluded.name, updated_at = now()
       returning id`,
      [organization.name, organization.slug],
    );
    const organizationId = organizationResult.rows[0]?.id;
    if (!organizationId) throw new Error('Could not seed an organization.');
    const seededMemberships = new Map<
      (typeof roles)[number],
      { membershipId: string; userId: string }
    >();

    for (const role of roles) {
      const roleLabel = role.replaceAll('_', '-');
      const subject = `${organization.slug.startsWith('alpha') ? 'alpha' : 'beta'}-${roleLabel}`;
      const email = `${subject}@mergecom.test`;
      const mapping = await client.query<{ user_id: string }>(
        `select user_id from identity_mappings
          where issuer = 'https://identity.local.mergecom'
            and provider_tenant_id = 'local-development'
            and provider_subject = $1`,
        [subject],
      );
      let userId = mapping.rows[0]?.user_id;
      if (!userId) {
        const user = await client.query<{ id: string }>(
          `insert into users (display_name, primary_email, email_verified)
           values ($1, $2, true) returning id`,
          [`${organization.name} ${roleLabel.replaceAll('-', ' ')}`, email],
        );
        userId = user.rows[0]?.id;
        if (!userId) throw new Error('Could not seed a user.');
        await client.query(
          `insert into identity_mappings
            (user_id, issuer, provider_tenant_id, provider_subject,
             email_claim, email_verified)
           values ($1, 'https://identity.local.mergecom',
                   'local-development', $2, $3, true)`,
          [userId, subject, email],
        );
      }
      await client.query(
        `update users
            set display_name = $2, primary_email = $3, email_verified = true,
                disabled_at = null, updated_at = now()
          where id = $1`,
        [
          userId,
          `${organization.name} ${roleLabel.replaceAll('-', ' ')}`,
          email,
        ],
      );
      await client.query(
        `update identity_mappings
            set email_claim = $2, email_verified = true, updated_at = now()
          where user_id = $1 and issuer = 'https://identity.local.mergecom'
            and provider_tenant_id = 'local-development'
            and provider_subject = $3`,
        [userId, email, subject],
      );
      const membership = await client.query<{ id: string }>(
        `insert into memberships (organization_id, user_id, role)
         values ($1, $2, $3)
         on conflict (organization_id, user_id)
         do update set role = excluded.role, status = 'active',
                       suspended_at = null, suspended_by_user_id = null,
                       updated_at = now()
         returning id`,
        [organizationId, userId, role],
      );
      const membershipId = membership.rows[0]?.id;
      if (!membershipId) throw new Error('Could not seed a membership.');
      seededMemberships.set(role, { membershipId, userId });
    }

    const owner = seededMemberships.get('owner');
    if (!owner) throw new Error('Could not find the seeded owner.');
    for (const project of projectSeeds[organization.slug]) {
      await client.query(
        `insert into projects
          (id, organization_id, name, client_name, created_by_user_id)
         values ($1, $2, $3, $4, $5)
         on conflict (id) do update
           set organization_id = excluded.organization_id,
               name = excluded.name, client_name = excluded.client_name,
               deleted_at = null, deleted_by_user_id = null,
               updated_at = now()`,
        [
          project.id,
          organizationId,
          project.name,
          project.clientName,
          owner.userId,
        ],
      );
      for (const [index, folder] of project.folders.entries()) {
        await client.query(
          `insert into project_folders
            (id, organization_id, project_id, parent_folder_id, name,
             sort_order, created_by_user_id)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update
             set parent_folder_id = excluded.parent_folder_id,
                 name = excluded.name, sort_order = excluded.sort_order,
                 deleted_at = null, deleted_by_user_id = null,
                 updated_at = now()`,
          [
            folder.id,
            organizationId,
            project.id,
            folder.parentFolderId,
            folder.name,
            (index + 1) * 1000,
            owner.userId,
          ],
        );
      }
      for (const [index, document] of project.documents.entries()) {
        await client.query(
          `insert into documents
            (id, organization_id, project_id, folder_id, name, kind,
             sort_order, created_by_user_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (id) do update
             set folder_id = excluded.folder_id, name = excluded.name,
                 kind = excluded.kind, sort_order = excluded.sort_order,
                 archived_at = null, archived_by_user_id = null,
                 deleted_at = null, deleted_by_user_id = null,
                 updated_at = now()`,
          [
            document.id,
            organizationId,
            project.id,
            document.folderId,
            document.name,
            document.kind,
            (index + 1) * 1000,
            owner.userId,
          ],
        );
      }
      for (const [role, seeded] of seededMemberships) {
        const assignedRole =
          role === 'owner' || role === 'admin' || role === 'project_lead'
            ? 'project_lead'
            : role === 'external_reviewer'
              ? 'reviewer'
              : role;
        await client.query(
          `insert into project_memberships
            (organization_id, project_id, organization_membership_id, role,
             added_by_user_id)
           values ($1, $2, $3, $4, $5)
           on conflict (project_id, organization_membership_id)
             where removed_at is null
           do update set role = excluded.role, updated_at = now()`,
          [
            organizationId,
            project.id,
            seeded.membershipId,
            assignedRole,
            owner.userId,
          ],
        );
      }
    }
  }
  await client.query('commit');
  console.info(
    'Seeded two local organizations, every organization role, and Phase 3 projects.',
  );
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await database.close();
}
