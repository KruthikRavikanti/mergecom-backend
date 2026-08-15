import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const organizationRole = pgEnum('organization_role', [
  'owner',
  'admin',
  'project_lead',
  'contributor',
  'reviewer',
  'viewer',
  'external_reviewer',
]);
export const membershipStatus = pgEnum('membership_status', [
  'active',
  'suspended',
]);
export const auditResult = pgEnum('audit_result', [
  'succeeded',
  'denied',
  'failed',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    displayName: text('display_name').notNull(),
    primaryEmail: text('primary_email').notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index('users_email_idx').on(table.primaryEmail)],
);

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex('organizations_slug_uq').on(table.slug)],
);

export const identityMappings = pgTable(
  'identity_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    issuer: text('issuer').notNull(),
    providerTenantId: text('provider_tenant_id').notNull(),
    providerSubject: text('provider_subject').notNull(),
    emailClaim: text('email_claim').notNull(),
    emailVerified: boolean('email_verified').notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('identity_mappings_subject_uq').on(
      table.issuer,
      table.providerTenantId,
      table.providerSubject,
    ),
    index('identity_mappings_user_idx').on(table.userId),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: organizationRole('role').notNull(),
    status: membershipStatus('status').default('active').notNull(),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedByUserId: uuid('suspended_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('memberships_organization_user_uq').on(
      table.organizationId,
      table.userId,
    ),
    index('memberships_user_idx').on(table.userId),
    index('memberships_organization_idx').on(table.organizationId),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    email: text('email').notNull(),
    role: organizationRole('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: uuid('invited_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('invitations_token_hash_uq').on(table.tokenHash),
    index('invitations_organization_idx').on(table.organizationId),
    index('invitations_email_idx').on(table.email),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    activeOrganizationId: uuid('active_organization_id').references(
      () => organizations.id,
      { onDelete: 'set null' },
    ),
    tokenHash: text('token_hash').notNull(),
    csrfTokenHash: text('csrf_token_hash').notNull(),
    providerSessionId: text('provider_session_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', {
      withTimezone: true,
    }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_expiry_idx').on(table.expiresAt),
  ],
);

export const oidcTransactions = pgTable(
  'oidc_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    handleHash: text('handle_hash').notNull(),
    codeVerifier: text('code_verifier').notNull(),
    state: text('state').notNull(),
    nonce: text('nonce').notNull(),
    returnTo: text('return_to').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('oidc_transactions_handle_hash_uq').on(table.handleHash),
  ],
);

export const organizationIdentityPolicies = pgTable(
  'organization_identity_policies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    issuer: text('issuer').notNull(),
    providerTenantId: text('provider_tenant_id').notNull(),
    verifiedEmailDomain: text('verified_email_domain'),
    defaultRole: organizationRole('default_role').default('viewer').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('organization_identity_policies_uq').on(
      table.organizationId,
      table.issuer,
      table.providerTenantId,
      table.verifiedEmailDomain,
    ),
  ],
);

export const organizationBootstrapGrants = pgTable(
  'organization_bootstrap_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuer: text('issuer').notNull(),
    providerTenantId: text('provider_tenant_id').notNull(),
    providerSubject: text('provider_subject').notNull(),
    verifiedEmail: text('verified_email').notNull(),
    organizationName: text('organization_name').notNull(),
    organizationSlug: text('organization_slug').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    consumedByUserId: uuid('consumed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('organization_bootstrap_grants_subject_uq').on(
      table.issuer,
      table.providerTenantId,
      table.providerSubject,
    ),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    result: auditResult('result').notNull(),
    requestId: text('request_id').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number | boolean | null>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_events_organization_occurred_idx').on(
      table.organizationId,
      table.occurredAt,
    ),
    index('audit_events_actor_idx').on(table.actorUserId),
  ],
);
