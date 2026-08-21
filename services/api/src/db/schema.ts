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
  'running',
  'retryable_failed',
  'permanently_failed',
  'quarantined',
  'completed',
]);
export const mergeOperationStatus = pgEnum('merge_operation_status', [
  'queued',
  'running',
  'retryable_failed',
  'permanently_failed',
  'manual_resolution_required',
  'completed',
]);
export const outboxEventStatus = pgEnum('outbox_event_status', [
  'pending',
  'published',
  'failed',
]);
export const reviewRequestStatus = pgEnum('review_request_status', [
  'open',
  'approved',
  'changes_requested',
  'cancelled',
  'superseded',
]);
export const reviewDecision = pgEnum('review_decision', [
  'approved',
  'changes_requested',
]);
export const reviewThreadStatus = pgEnum('review_thread_status', [
  'open',
  'resolved',
]);
export const reviewAnchorType = pgEnum('review_anchor_type', [
  'general',
  'comparison_change',
]);
export const notificationCategory = pgEnum('notification_category', [
  'review_activity',
  'document_activity',
]);
export const notificationChannel = pgEnum('notification_channel', [
  'in_app',
  'email',
]);
export const notificationJobStatus = pgEnum('notification_job_status', [
  'queued',
  'running',
  'retryable_failed',
  'permanently_failed',
  'completed',
  'suppressed',
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
    approvedVersionId: uuid('approved_version_id'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
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
    check(
      'document_branches_approval_pointer_ck',
      sql`(${table.approvedVersionId} is null and ${table.approvedAt} is null and ${table.approvedByUserId} is null)
          or (${table.approvedVersionId} is not null and ${table.approvedAt} is not null and ${table.approvedByUserId} is not null)`,
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
    maxAttempts: integer('max_attempts').default(3).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    lastError: text('last_error'),
    traceId: uuid('trace_id').defaultRandom().notNull(),
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
    index('version_processing_jobs_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      'version_processing_jobs_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
  ],
);

export const normalizedSnapshots = pgTable(
  'normalized_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => documentVersions.id, { onDelete: 'cascade' })
      .notNull(),
    objectKey: text('object_key').notNull(),
    schemaVersion: text('schema_version').notNull(),
    parserVersion: text('parser_version').notNull(),
    fileType: documentKind('file_type').notNull(),
    snapshotSha256: text('snapshot_sha256').notNull(),
    stableHash: text('stable_hash').notNull(),
    packageSummary: jsonb('package_summary')
      .$type<Record<string, number | boolean>>()
      .notNull(),
    warnings: jsonb('warnings')
      .$type<
        Array<{
          code: string;
          message: string;
          part: string | null;
          severity: 'info' | 'warning';
        }>
      >()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    unsupportedFeatures: jsonb('unsupported_features')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    validationErrorCount: integer('validation_error_count')
      .default(0)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('normalized_snapshots_version_uq').on(table.versionId),
    uniqueIndex('normalized_snapshots_object_key_uq').on(table.objectKey),
    index('normalized_snapshots_organization_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    check(
      'normalized_snapshots_hashes_ck',
      sql`${table.snapshotSha256} ~ '^[0-9a-f]{64}$' and ${table.stableHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'normalized_snapshots_validation_count_ck',
      sql`${table.validationErrorCount} >= 0`,
    ),
  ],
);

export const versionRenditions = pgTable(
  'version_renditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => documentVersions.id, { onDelete: 'cascade' })
      .notNull(),
    requestedByUserId: uuid('requested_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    sourceSha256: text('source_sha256').notNull(),
    rendererProfile: text('renderer_profile').notNull(),
    rendererVersion: text('renderer_version').notNull(),
    fontPackVersion: text('font_pack_version').notNull(),
    status: processingJobStatus('status').default('queued').notNull(),
    objectKey: text('object_key'),
    renditionSha256: text('rendition_sha256'),
    byteCount: bigint('byte_count', { mode: 'number' }),
    pageCount: integer('page_count'),
    dimensions: jsonb('dimensions')
      .$type<Array<{ height: number; width: number }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    warnings: jsonb('warnings')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    failureCode: text('failure_code'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('version_renditions_source_profile_uq').on(
      table.versionId,
      table.sourceSha256,
      table.rendererProfile,
      table.rendererVersion,
      table.fontPackVersion,
    ),
    index('version_renditions_object_key_idx').on(table.objectKey),
    uniqueIndex('version_renditions_organization_version_id_uq').on(
      table.organizationId,
      table.versionId,
      table.id,
    ),
    index('version_renditions_version_created_idx').on(
      table.organizationId,
      table.versionId,
      table.createdAt,
    ),
    check(
      'version_renditions_source_hash_ck',
      sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'version_renditions_output_hash_ck',
      sql`${table.renditionSha256} is null or ${table.renditionSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'version_renditions_output_size_ck',
      sql`${table.byteCount} is null or ${table.byteCount} > 0`,
    ),
    check(
      'version_renditions_page_count_ck',
      sql`${table.pageCount} is null or ${table.pageCount} > 0`,
    ),
    check(
      'version_renditions_completion_ck',
      sql`(${table.status} = 'completed'
            and ${table.objectKey} is not null
            and ${table.renditionSha256} is not null
            and ${table.byteCount} is not null
            and ${table.pageCount} is not null
            and ${table.completedAt} is not null)
          or (${table.status} <> 'completed')`,
    ),
  ],
);

export const versionRenditionJobs = pgTable(
  'version_rendition_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    renditionId: uuid('rendition_id')
      .references(() => versionRenditions.id, { onDelete: 'cascade' })
      .notNull(),
    status: processingJobStatus('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    lastError: text('last_error'),
    traceId: uuid('trace_id').defaultRandom().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('version_rendition_jobs_rendition_uq').on(table.renditionId),
    index('version_rendition_jobs_queue_idx').on(
      table.status,
      table.availableAt,
    ),
    index('version_rendition_jobs_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      'version_rendition_jobs_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
  ],
);

export const versionComparisons = pgTable(
  'version_comparisons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    baseVersionId: uuid('base_version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    targetVersionId: uuid('target_version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    requestedByUserId: uuid('requested_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    comparisonSchemaVersion: text('comparison_schema_version')
      .default('1.0.0')
      .notNull(),
    parserVersion: text('parser_version').default('1.2.0').notNull(),
    engineVersion: text('engine_version').default('1.0.0').notNull(),
    status: processingJobStatus('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    lastError: text('last_error'),
    traceId: uuid('trace_id').defaultRandom().notNull(),
    resultObjectKey: text('result_object_key'),
    resultSha256: text('result_sha256'),
    stableHash: text('stable_hash'),
    byteEqual: boolean('byte_equal'),
    semanticEqual: boolean('semantic_equal'),
    completeness: text('completeness'),
    summary: jsonb('summary')
      .$type<Record<string, number>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    warnings: jsonb('warnings')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    changes: jsonb('changes')
      .$type<
        Array<{
          after: string | null;
          before: string | null;
          category: 'content' | 'feature' | 'structure' | 'validation';
          changeType: 'added' | 'modified' | 'moved' | 'removed';
          entityType: string;
          id: string;
          impact: 'high' | 'low' | 'medium';
          label: string;
          path: string;
        }>
      >()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('version_comparisons_version_parser_uq').on(
      table.baseVersionId,
      table.targetVersionId,
      table.comparisonSchemaVersion,
      table.parserVersion,
    ),
    uniqueIndex('version_comparisons_result_object_uq').on(
      table.resultObjectKey,
    ),
    uniqueIndex('version_comparisons_organization_document_id_uq').on(
      table.organizationId,
      table.documentId,
      table.id,
    ),
    index('version_comparisons_document_created_idx').on(
      table.organizationId,
      table.documentId,
      table.createdAt,
    ),
    index('version_comparisons_queue_idx').on(table.status, table.availableAt),
    index('version_comparisons_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      'version_comparisons_distinct_versions_ck',
      sql`${table.baseVersionId} <> ${table.targetVersionId}`,
    ),
    check(
      'version_comparisons_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      'version_comparisons_hashes_ck',
      sql`(${table.resultSha256} is null or ${table.resultSha256} ~ '^[0-9a-f]{64}$')
          and (${table.stableHash} is null or ${table.stableHash} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'version_comparisons_completeness_ck',
      sql`${table.completeness} is null or ${table.completeness} in ('complete', 'partial')`,
    ),
  ],
);

export const comparisonVisualizations = pgTable(
  'comparison_visualizations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    comparisonId: uuid('comparison_id')
      .references(() => versionComparisons.id, { onDelete: 'cascade' })
      .notNull(),
    schemaVersion: text('schema_version').notNull(),
    engineVersion: text('engine_version').notNull(),
    rendererProfile: text('renderer_profile').notNull(),
    objectKey: text('object_key').notNull(),
    artifactSha256: text('artifact_sha256').notNull(),
    totalChanges: integer('total_changes').notNull(),
    mappedChanges: integer('mapped_changes').notNull(),
    exactChanges: integer('exact_changes').notNull(),
    approximateChanges: integer('approximate_changes').notNull(),
    unavailableChanges: integer('unavailable_changes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('comparison_visualizations_profile_uq').on(
      table.comparisonId,
      table.schemaVersion,
      table.engineVersion,
      table.rendererProfile,
    ),
    uniqueIndex('comparison_visualizations_object_key_uq').on(table.objectKey),
    uniqueIndex('comparison_visualizations_organization_comparison_id_uq').on(
      table.organizationId,
      table.comparisonId,
      table.id,
    ),
    check(
      'comparison_visualizations_hash_ck',
      sql`${table.artifactSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'comparison_visualizations_counts_ck',
      sql`${table.totalChanges} >= 0
          and ${table.mappedChanges} >= 0
          and ${table.exactChanges} >= 0
          and ${table.approximateChanges} >= 0
          and ${table.unavailableChanges} >= 0
          and ${table.mappedChanges} <= ${table.totalChanges}
          and ${table.exactChanges} + ${table.approximateChanges} = ${table.mappedChanges}
          and ${table.mappedChanges} + ${table.unavailableChanges} = ${table.totalChanges}`,
    ),
  ],
);

export const mergeOperations = pgTable(
  'merge_operations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    branchId: uuid('branch_id')
      .references(() => documentBranches.id, { onDelete: 'restrict' })
      .notNull(),
    baseVersionId: uuid('base_version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    oursVersionId: uuid('ours_version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    theirsVersionId: uuid('theirs_version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    requestedByUserId: uuid('requested_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    note: text('note').notNull(),
    mergeSchemaVersion: text('merge_schema_version').default('1.2.0').notNull(),
    parserVersion: text('parser_version').default('1.2.0').notNull(),
    engineVersion: text('engine_version').default('1.2.0').notNull(),
    status: mergeOperationStatus('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    lastError: text('last_error'),
    traceId: uuid('trace_id').defaultRandom().notNull(),
    strategy: text('strategy'),
    stableHash: text('stable_hash'),
    warnings: jsonb('warnings')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    appliedPaths: jsonb('applied_paths')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    analysis: jsonb('analysis').$type<Record<string, unknown>>(),
    candidateObjectKey: text('candidate_object_key'),
    candidateSha256: text('candidate_sha256'),
    candidateByteSize: bigint('candidate_byte_size', { mode: 'number' }),
    resultVersionId: uuid('result_version_id').references(
      () => documentVersions.id,
      { onDelete: 'restrict' },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('merge_operations_source_versions_uq').on(
      table.baseVersionId,
      table.oursVersionId,
      table.theirsVersionId,
      table.mergeSchemaVersion,
      table.parserVersion,
    ),
    uniqueIndex('merge_operations_candidate_object_uq').on(
      table.candidateObjectKey,
    ),
    uniqueIndex('merge_operations_result_version_uq').on(table.resultVersionId),
    uniqueIndex('merge_operations_organization_document_id_uq').on(
      table.organizationId,
      table.documentId,
      table.id,
    ),
    index('merge_operations_document_created_idx').on(
      table.organizationId,
      table.documentId,
      table.createdAt,
    ),
    index('merge_operations_queue_idx').on(table.status, table.availableAt),
    index('merge_operations_lease_idx').on(table.status, table.leaseExpiresAt),
    check(
      'merge_operations_distinct_versions_ck',
      sql`${table.baseVersionId} <> ${table.oursVersionId}
          and ${table.baseVersionId} <> ${table.theirsVersionId}
          and ${table.oursVersionId} <> ${table.theirsVersionId}`,
    ),
    check(
      'merge_operations_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      'merge_operations_hashes_ck',
      sql`(${table.stableHash} is null or ${table.stableHash} ~ '^[0-9a-f]{64}$')
          and (${table.candidateSha256} is null or ${table.candidateSha256} ~ '^[0-9a-f]{64}$')`,
    ),
    check(
      'merge_operations_candidate_ck',
      sql`(${table.candidateObjectKey} is null and ${table.candidateSha256} is null and ${table.candidateByteSize} is null)
          or (${table.candidateObjectKey} is not null and ${table.candidateSha256} is not null and ${table.candidateByteSize} > 0)`,
    ),
    check(
      'merge_operations_outcome_ck',
      sql`(${table.status} = 'completed' and ${table.resultVersionId} is not null
            and ${table.candidateObjectKey} is not null and ${table.failureCode} is null
            and ${table.analysis} is not null)
          or (${table.status} = 'manual_resolution_required' and ${table.resultVersionId} is null
            and ${table.failureCode} is not null and ${table.analysis} is not null)
          or (${table.status} not in ('completed', 'manual_resolution_required')
            and ${table.resultVersionId} is null)`,
    ),
  ],
);

export const reviewRequests = pgTable(
  'review_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documents.id, { onDelete: 'cascade' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    comparisonId: uuid('comparison_id').references(
      () => versionComparisons.id,
      { onDelete: 'restrict' },
    ),
    requestedByUserId: uuid('requested_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    message: text('message').notNull(),
    status: reviewRequestStatus('status').default('open').notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByUserId: uuid('closed_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('review_requests_open_version_uq')
      .on(table.versionId)
      .where(sql`${table.status} = 'open'`),
    uniqueIndex('review_requests_organization_id_version_uq').on(
      table.organizationId,
      table.id,
      table.versionId,
    ),
    uniqueIndex('review_requests_organization_id_uq').on(
      table.organizationId,
      table.id,
    ),
    index('review_requests_document_created_idx').on(
      table.organizationId,
      table.documentId,
      table.createdAt,
      table.id,
    ),
    index('review_requests_version_idx').on(table.versionId),
    check(
      'review_requests_terminal_state_ck',
      sql`(${table.status} = 'open' and ${table.closedAt} is null and ${table.closedByUserId} is null)
          or (${table.status} <> 'open' and ${table.closedAt} is not null and ${table.closedByUserId} is not null)`,
    ),
  ],
);

export const reviewAssignments = pgTable(
  'review_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    reviewRequestId: uuid('review_request_id')
      .references(() => reviewRequests.id, { onDelete: 'cascade' })
      .notNull(),
    reviewerUserId: uuid('reviewer_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    assignedByUserId: uuid('assigned_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('review_assignments_request_reviewer_uq').on(
      table.reviewRequestId,
      table.reviewerUserId,
    ),
    uniqueIndex('review_assignments_organization_request_reviewer_uq').on(
      table.organizationId,
      table.reviewRequestId,
      table.reviewerUserId,
    ),
    index('review_assignments_reviewer_idx').on(
      table.organizationId,
      table.reviewerUserId,
      table.createdAt,
    ),
  ],
);

export const reviewDecisions = pgTable(
  'review_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    reviewRequestId: uuid('review_request_id')
      .references(() => reviewRequests.id, { onDelete: 'restrict' })
      .notNull(),
    versionId: uuid('version_id')
      .references(() => documentVersions.id, { onDelete: 'restrict' })
      .notNull(),
    reviewerUserId: uuid('reviewer_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    decision: reviewDecision('decision').notNull(),
    note: text('note').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('review_decisions_request_reviewer_uq').on(
      table.reviewRequestId,
      table.reviewerUserId,
    ),
    index('review_decisions_version_created_idx').on(
      table.organizationId,
      table.versionId,
      table.createdAt,
    ),
  ],
);

export const reviewThreads = pgTable(
  'review_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    reviewRequestId: uuid('review_request_id')
      .references(() => reviewRequests.id, { onDelete: 'cascade' })
      .notNull(),
    comparisonId: uuid('comparison_id').references(
      () => versionComparisons.id,
      { onDelete: 'restrict' },
    ),
    anchorType: reviewAnchorType('anchor_type').notNull(),
    anchorChangeId: text('anchor_change_id'),
    anchorPath: text('anchor_path'),
    anchorLabel: text('anchor_label'),
    anchorCategory: text('anchor_category'),
    status: reviewThreadStatus('status').default('open').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    ...timestamps,
  },
  (table) => [
    index('review_threads_request_created_idx').on(
      table.reviewRequestId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex('review_threads_organization_id_uq').on(
      table.organizationId,
      table.id,
    ),
    index('review_threads_anchor_idx').on(
      table.comparisonId,
      table.anchorChangeId,
    ),
    check(
      'review_threads_anchor_ck',
      sql`(${table.anchorType} = 'general' and ${table.comparisonId} is null
            and ${table.anchorChangeId} is null and ${table.anchorPath} is null
            and ${table.anchorLabel} is null and ${table.anchorCategory} is null)
          or (${table.anchorType} = 'comparison_change' and ${table.comparisonId} is not null
            and ${table.anchorChangeId} ~ '^[0-9a-f]{64}$' and ${table.anchorPath} is not null
            and ${table.anchorLabel} is not null
            and ${table.anchorCategory} in ('content', 'feature', 'structure', 'validation'))`,
    ),
    check(
      'review_threads_resolution_ck',
      sql`(${table.status} = 'open' and ${table.resolvedAt} is null and ${table.resolvedByUserId} is null)
          or (${table.status} = 'resolved' and ${table.resolvedAt} is not null and ${table.resolvedByUserId} is not null)`,
    ),
  ],
);

export const reviewComments = pgTable(
  'review_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    threadId: uuid('thread_id')
      .references(() => reviewThreads.id, { onDelete: 'cascade' })
      .notNull(),
    authorUserId: uuid('author_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('review_comments_thread_created_idx').on(
      table.threadId,
      table.createdAt,
      table.id,
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

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    inAppReviewActivity: boolean('in_app_review_activity')
      .default(true)
      .notNull(),
    emailReviewActivity: boolean('email_review_activity')
      .default(false)
      .notNull(),
    inAppDocumentActivity: boolean('in_app_document_activity')
      .default(true)
      .notNull(),
    emailDocumentActivity: boolean('email_document_activity')
      .default(false)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('notification_preferences_organization_user_uq').on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export const notificationDispatches = pgTable(
  'notification_dispatches',
  {
    outboxEventId: uuid('outbox_event_id')
      .primaryKey()
      .references(() => outboxEvents.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    status: notificationJobStatus('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(5).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    lastError: text('last_error'),
    traceId: uuid('trace_id').defaultRandom().notNull(),
    ...timestamps,
  },
  (table) => [
    index('notification_dispatches_queue_idx').on(
      table.status,
      table.availableAt,
    ),
    index('notification_dispatches_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      'notification_dispatches_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      'notification_dispatches_terminal_ck',
      sql`(${table.status} in ('completed', 'permanently_failed') and ${table.completedAt} is not null)
          or (${table.status} not in ('completed', 'permanently_failed') and ${table.completedAt} is null)`,
    ),
    check(
      'notification_dispatches_status_ck',
      sql`${table.status} <> 'suppressed'`,
    ),
  ],
);

export const userNotifications = pgTable(
  'user_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    recipientUserId: uuid('recipient_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sourceEventId: uuid('source_event_id')
      .references(() => outboxEvents.id, { onDelete: 'cascade' })
      .notNull(),
    category: notificationCategory('category').notNull(),
    eventType: text('event_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    href: text('href').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('user_notifications_event_recipient_uq').on(
      table.sourceEventId,
      table.recipientUserId,
    ),
    uniqueIndex('user_notifications_organization_id_uq').on(
      table.organizationId,
      table.id,
    ),
    index('user_notifications_inbox_idx').on(
      table.organizationId,
      table.recipientUserId,
      table.createdAt,
      table.id,
    ),
    check(
      'user_notifications_content_ck',
      sql`length(${table.title}) between 1 and 160
          and length(${table.body}) between 1 and 500
          and ${table.href} like '/app/projects/%'`,
    ),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .references(() => organizations.id, { onDelete: 'cascade' })
      .notNull(),
    notificationId: uuid('notification_id')
      .references(() => userNotifications.id, { onDelete: 'cascade' })
      .notNull(),
    channel: notificationChannel('channel').notNull(),
    status: notificationJobStatus('status').default('queued').notNull(),
    recipientAddress: text('recipient_address'),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(5).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
    lastError: text('last_error'),
    providerMessageId: text('provider_message_id'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('notification_deliveries_notification_channel_uq').on(
      table.notificationId,
      table.channel,
    ),
    index('notification_deliveries_queue_idx').on(
      table.channel,
      table.status,
      table.availableAt,
    ),
    index('notification_deliveries_lease_idx').on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      'notification_deliveries_attempts_ck',
      sql`${table.attempts} >= 0 and ${table.maxAttempts} > 0 and ${table.attempts} <= ${table.maxAttempts}`,
    ),
    check(
      'notification_deliveries_address_ck',
      sql`(${table.channel} = 'email' and (${table.recipientAddress} is not null or ${table.status} = 'suppressed'))
          or (${table.channel} = 'in_app' and ${table.recipientAddress} is null)`,
    ),
    check(
      'notification_deliveries_terminal_ck',
      sql`(${table.status} in ('completed', 'suppressed', 'permanently_failed') and ${table.completedAt} is not null)
          or (${table.status} not in ('completed', 'suppressed', 'permanently_failed') and ${table.completedAt} is null)`,
    ),
  ],
);
