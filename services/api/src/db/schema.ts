import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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
export const projectRole = pgEnum('project_role', [
  'project_lead',
  'contributor',
  'reviewer',
  'viewer',
]);
export const documentKind = pgEnum('document_kind', [
  'presentation',
  'spreadsheet',
  'word_document',
]);
export const artifactScanStatus = pgEnum('artifact_scan_status', [
  'pending',
  'clean',
  'quarantined',
  'failed',
]);
export const uploadMode = pgEnum('upload_mode', ['single', 'multipart']);
export const stagedUploadStatus = pgEnum('staged_upload_status', [
  'pending',
  'finalized',
  'cancelled',
  'expired',
  'failed',
]);
export const versionSource = pgEnum('version_source', [
  'web_upload',
  'office_addin',
  'restore',
  'merge',
  'import',
]);
export const versionStatus = pgEnum('version_status', [
  'pending_processing',
  'ready',
  'conflicted',
  'quarantined',
  'failed',
]);
export const processingJobStatus = pgEnum('processing_job_status', [
  'queued',
  'processing',
  'succeeded',
  'failed',
]);
export const outboxEventStatus = pgEnum('outbox_event_status', [
  'pending',
  'published',
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
    projectId: uuid('project_id'),
    projectRole: projectRole('project_role'),
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

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    clientName: text('client_name'),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: uuid('deleted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('projects_organization_updated_idx').on(
      table.organizationId,
      table.updatedAt,
      table.id,
    ),
    uniqueIndex('projects_organization_name_active_uq')
      .on(table.organizationId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const projectMemberships = pgTable(
  'project_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    organizationMembershipId: uuid('organization_membership_id')
      .references(() => memberships.id, { onDelete: 'cascade' })
      .notNull(),
    role: projectRole('role').notNull(),
    addedByUserId: uuid('added_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    removedByUserId: uuid('removed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('project_memberships_project_idx').on(table.projectId),
    index('project_memberships_organization_membership_idx').on(
      table.organizationMembershipId,
    ),
    uniqueIndex('project_memberships_active_uq')
      .on(table.projectId, table.organizationMembershipId)
      .where(sql`${table.removedAt} is null`),
  ],
);

export const projectFolders = pgTable(
  'project_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    parentFolderId: uuid('parent_folder_id'),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').default(1000).notNull(),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: uuid('deleted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('project_folders_parent_order_idx').on(
      table.organizationId,
      table.projectId,
      table.parentFolderId,
      table.sortOrder,
      table.id,
    ),
    uniqueIndex('project_folders_project_id_uq').on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    check(
      'project_folders_not_self_parent_ck',
      sql`${table.parentFolderId} is null or ${table.parentFolderId} <> ${table.id}`,
    ),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: uuid('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    folderId: uuid('folder_id'),
    name: text('name').notNull(),
    kind: documentKind('kind').notNull(),
    sortOrder: integer('sort_order').default(1000).notNull(),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    archivedByUserId: uuid('archived_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: uuid('deleted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('documents_folder_order_idx').on(
      table.organizationId,
      table.projectId,
      table.folderId,
      table.sortOrder,
      table.id,
    ),
    uniqueIndex('documents_project_id_uq').on(
      table.organizationId,
      table.projectId,
      table.id,
    ),
    uniqueIndex('documents_organization_id_uq').on(
      table.organizationId,
      table.id,
    ),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    actorUserId: uuid('actor_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    operation: text('operation').notNull(),
    keyHash: text('key_hash').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').$type<Record<string, unknown>>(),
    statusCode: integer('status_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_records_actor_operation_key_uq').on(
      table.actorUserId,
      table.operation,
      table.keyHash,
    ),
    index('idempotency_records_expires_idx').on(table.expiresAt),
  ],
);

export const documentBranches = pgTable(
  'document_branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    headVersionId: uuid('head_version_id'),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('document_branches_document_name_uq').on(
      table.documentId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex('document_branches_default_uq')
      .on(table.documentId)
      .where(sql`${table.isDefault} = true`),
    uniqueIndex('document_branches_organization_document_id_uq').on(
      table.organizationId,
      table.documentId,
      table.id,
    ),
  ],
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'restrict' })
      .notNull(),
    objectKey: text('object_key').notNull(),
    sha256: text('sha256').notNull(),
    byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
    detectedMediaType: text('detected_media_type').notNull(),
    originalFilename: text('original_filename').notNull(),
    extension: text('extension').notNull(),
    storageVersion: text('storage_version'),
    storageChecksum: text('storage_checksum'),
    scanStatus: artifactScanStatus('scan_status').default('pending').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('artifacts_object_key_uq').on(table.objectKey),
    uniqueIndex('artifacts_organization_id_uq').on(
      table.organizationId,
      table.id,
    ),
    index('artifacts_organization_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    check('artifacts_byte_size_ck', sql`${table.byteSize} > 0`),
    check('artifacts_sha256_ck', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'restrict' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'restrict' })
      .notNull(),
    branchId: uuid('branch_id')
      .references(() => documentBranches.id, { onDelete: 'restrict' })
      .notNull(),
    artifactId: uuid('artifact_id')
      .references(() => artifacts.id, { onDelete: 'restrict' })
      .notNull(),
    sequence: integer('sequence').notNull(),
    displayNumber: integer('display_number').notNull(),
    parentVersionId: uuid('parent_version_id').references(
      (): AnyPgColumn => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    mergeParentVersionId: uuid('merge_parent_version_id').references(
      (): AnyPgColumn => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    baseVersionId: uuid('base_version_id').references(
      (): AnyPgColumn => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    source: versionSource('source').notNull(),
    status: versionStatus('status').notNull(),
    note: text('note').notNull(),
    conflictReason: text('conflict_reason'),
    authorUserId: uuid('author_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('document_versions_branch_sequence_uq').on(
      table.branchId,
      table.sequence,
    ),
    uniqueIndex('document_versions_organization_document_id_uq').on(
      table.organizationId,
      table.documentId,
      table.id,
    ),
    index('document_versions_document_created_idx').on(
      table.documentId,
      table.createdAt,
      table.id,
    ),
    check('document_versions_sequence_ck', sql`${table.sequence} > 0`),
    check(
      'document_versions_conflict_status_ck',
      sql`(${table.status} = 'conflicted' and ${table.conflictReason} is not null)
          or (${table.status} <> 'conflicted' and ${table.conflictReason} is null)`,
    ),
  ],
);

export const stagedUploads = pgTable(
  'staged_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    branchId: uuid('branch_id')
      .references(() => documentBranches.id, { onDelete: 'cascade' })
      .notNull(),
    baseVersionId: uuid('base_version_id').references(
      () => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    stagingObjectKey: text('staging_object_key').notNull(),
    expectedSha256: text('expected_sha256').notNull(),
    expectedByteSize: bigint('expected_byte_size', {
      mode: 'number',
    }).notNull(),
    clientMediaType: text('client_media_type'),
    originalFilename: text('original_filename').notNull(),
    extension: text('extension').notNull(),
    mode: uploadMode('mode').notNull(),
    multipartUploadId: text('multipart_upload_id'),
    partSize: integer('part_size'),
    status: stagedUploadStatus('status').default('pending').notNull(),
    failureCode: text('failure_code'),
    finalizedVersionId: uuid('finalized_version_id').references(
      () => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('staged_uploads_staging_key_uq').on(table.stagingObjectKey),
    index('staged_uploads_expiry_status_idx').on(table.status, table.expiresAt),
    check(
      'staged_uploads_sha256_ck',
      sql`${table.expectedSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check('staged_uploads_byte_size_ck', sql`${table.expectedByteSize} > 0`),
    check(
      'staged_uploads_multipart_ck',
      sql`(${table.mode} = 'single' and ${table.multipartUploadId} is null and ${table.partSize} is null)
          or (${table.mode} = 'multipart' and ${table.multipartUploadId} is not null and ${table.partSize} is not null)`,
    ),
  ],
);

export const versionProcessingJobs = pgTable(
  'version_processing_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => documentVersions.id, { onDelete: 'cascade' })
      .notNull(),
    jobType: text('job_type').notNull(),
    status: processingJobStatus('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('version_processing_jobs_version_type_uq').on(
      table.versionId,
      table.jobType,
    ),
    index('version_processing_jobs_queue_idx').on(
      table.status,
      table.availableAt,
    ),
  ],
);

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, string | number | boolean | null>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: outboxEventStatus('status').default('pending').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('outbox_events_delivery_idx').on(table.status, table.availableAt),
    index('outbox_events_aggregate_idx').on(
      table.aggregateType,
      table.aggregateId,
    ),
  ],
);
