import { createDatabase } from './database';

if (process.env.ALLOW_OWNER_BOOTSTRAP !== 'true') {
  throw new Error(
    'Set ALLOW_OWNER_BOOTSTRAP=true for this operator-only command.',
  );
}

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const database = createDatabase(required('DATABASE_URL'));
try {
  const expiresInHours = Number(process.env.BOOTSTRAP_EXPIRES_HOURS ?? 24);
  if (!Number.isSafeInteger(expiresInHours) || expiresInHours < 1) {
    throw new Error('BOOTSTRAP_EXPIRES_HOURS must be a positive integer.');
  }
  await database.pool.query(
    `insert into organization_bootstrap_grants
      (issuer, provider_tenant_id, provider_subject, verified_email,
       organization_name, organization_slug, expires_at, created_by)
     values ($1, $2, $3, $4, $5, $6, now() + ($7 * interval '1 hour'), $8)`,
    [
      required('BOOTSTRAP_ISSUER'),
      required('BOOTSTRAP_TENANT_ID'),
      required('BOOTSTRAP_SUBJECT'),
      required('BOOTSTRAP_EMAIL').trim().toLowerCase(),
      required('BOOTSTRAP_ORGANIZATION_NAME'),
      required('BOOTSTRAP_ORGANIZATION_SLUG'),
      expiresInHours,
      required('BOOTSTRAP_CREATED_BY'),
    ],
  );
  console.info('Created a time-limited, subject-bound first-owner grant.');
} finally {
  await database.close();
}
