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
      await client.query(
        `insert into memberships (organization_id, user_id, role)
         values ($1, $2, $3)
         on conflict (organization_id, user_id)
         do update set role = excluded.role, status = 'active',
                       suspended_at = null, suspended_by_user_id = null,
                       updated_at = now()`,
        [organizationId, userId, role],
      );
    }
  }
  await client.query('commit');
  console.info('Seeded two local organizations and every organization role.');
} catch (error) {
  await client.query('rollback');
  throw error;
} finally {
  client.release();
  await database.close();
}
