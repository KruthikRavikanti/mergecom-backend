import type { Pool, PoolClient } from 'pg';

import { hashToken } from '../security/crypto';
import {
  canCreateProject,
  canManageProject,
  canManageProjectTeam,
  canWriteProjectContent,
  effectiveProjectRole,
  hasAutomaticProjectAccess,
  projectRoleAllowed,
} from './authorization';
import {
  decodeNameCursor,
  decodeOrderedCursor,
  decodeUpdatedCursor,
  encodeCursor,
} from './cursor';
import {
  ProjectOperationError,
  type PageInput,
  type ProjectStore,
} from './store';
import type {
  CursorPage,
  DocumentKind,
  DocumentSummary,
  FolderPathItem,
  ProjectActor,
  ProjectFolderSummary,
  ProjectRole,
  ProjectSummary,
  ProjectTeamMember,
} from './types';

interface ProjectRow {
  access_role: ProjectRole | null;
  archived_at: Date | null;
  client_name: string | null;
  created_at: Date;
  created_by: string;
  document_count: number;
  folder_count: number;
  id: string;
  name: string;
  updated_at: Date;
}

interface FolderRow {
  id: string;
  name: string;
  parent_folder_id: string | null;
  sort_order: number;
  updated_at: Date;
}

interface DocumentRow {
  archived_at: Date | null;
  created_at: Date;
  folder_id: string | null;
  id: string;
  kind: DocumentKind;
  name: string;
  sort_order: number;
  updated_at: Date;
}

interface TeamRow {
  added_at: Date;
  display_name: string;
  id: string;
  organization_membership_id: string;
  organization_role: ProjectTeamMember['organizationRole'];
  primary_email: string;
  role: ProjectRole;
  user_id: string;
}

interface ProjectAccess {
  role: ProjectRole;
  row: ProjectRow;
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw translateDatabaseError(error);
  } finally {
    client.release();
  }
}

function translateDatabaseError(error: unknown): unknown {
  if (error instanceof ProjectOperationError) return error;
  if (!error || typeof error !== 'object' || !('code' in error)) return error;
  const code = String(error.code);
  if (code === '23505') return new ProjectOperationError('conflict');
  if (code === '23503' || code === '23514') {
    return new ProjectOperationError('invalid_parent');
  }
  return error;
}

function decodeCursor<T>(decoder: () => T): T {
  try {
    return decoder();
  } catch {
    throw new ProjectOperationError('invalid_cursor');
  }
}

function mapProject(row: ProjectRow, role?: ProjectRole): ProjectSummary {
  return {
    accessRole: role ?? row.access_role ?? 'viewer',
    archivedAt: row.archived_at,
    clientName: row.client_name,
    createdAt: row.created_at,
    createdBy: row.created_by,
    documentCount: Number(row.document_count),
    folderCount: Number(row.folder_count),
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

function mapFolder(row: FolderRow): ProjectFolderSummary {
  return {
    id: row.id,
    name: row.name,
    parentFolderId: row.parent_folder_id,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: DocumentRow): DocumentSummary {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    folderId: row.folder_id,
    id: row.id,
    kind: row.kind,
    name: row.name,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function mapTeamMember(row: TeamRow): ProjectTeamMember {
  return {
    addedAt: row.added_at,
    email: row.primary_email,
    id: row.id,
    name: row.display_name,
    organizationMembershipId: row.organization_membership_id,
    organizationRole: row.organization_role,
    role: row.role,
    userId: row.user_id,
  };
}

function requestHash(value: object): string {
  return hashToken(JSON.stringify(value));
}

export class PostgresProjectStore implements ProjectStore {
  public constructor(private readonly pool: Pool) {}

  private async insertAudit(
    client: PoolClient,
    input: {
      action: string;
      actor: ProjectActor;
      metadata?: Record<string, string | number | boolean | null>;
      requestId: string;
      targetId?: string | null;
      targetType: string;
    },
  ): Promise<void> {
    await client.query(
      `insert into audit_events
        (organization_id, actor_user_id, action, target_type, target_id,
         result, request_id, metadata)
       values ($1, $2, $3, $4, $5, 'succeeded', $6, $7)`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.action,
        input.targetType,
        input.targetId ?? null,
        input.requestId,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  private async claimIdempotency(
    client: PoolClient,
    input: {
      actor: ProjectActor;
      key: string;
      operation: string;
      payload: object;
    },
  ): Promise<{ recordId: string; resourceId: string | null }> {
    const keyHash = hashToken(input.key);
    const payloadHash = requestHash(input.payload);
    await client.query(
      `delete from idempotency_records
        where actor_user_id = $1 and operation = $2 and key_hash = $3
          and expires_at <= now()`,
      [input.actor.userId, input.operation, keyHash],
    );
    const inserted = await client.query<{ id: string }>(
      `insert into idempotency_records
        (organization_id, actor_user_id, operation, key_hash, request_hash,
         expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '24 hours')
       on conflict (actor_user_id, operation, key_hash) do nothing
       returning id`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.operation,
        keyHash,
        payloadHash,
      ],
    );
    const recordId = inserted.rows[0]?.id;
    if (recordId) return { recordId, resourceId: null };

    const existing = await client.query<{
      id: string;
      request_hash: string;
      response: { resourceId?: unknown } | null;
    }>(
      `select id, request_hash, response
         from idempotency_records
        where actor_user_id = $1 and operation = $2 and key_hash = $3
        for update`,
      [input.actor.userId, input.operation, keyHash],
    );
    const row = existing.rows[0];
    if (
      !row ||
      row.request_hash !== payloadHash ||
      typeof row.response?.resourceId !== 'string'
    ) {
      throw new ProjectOperationError('idempotency_conflict');
    }
    return { recordId: row.id, resourceId: row.response.resourceId };
  }

  private async completeIdempotency(
    client: PoolClient,
    recordId: string,
    resourceId: string,
  ): Promise<void> {
    await client.query(
      `update idempotency_records
          set response = $2, status_code = 201
        where id = $1`,
      [recordId, JSON.stringify({ resourceId })],
    );
  }

  private async projectRow(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
  ): Promise<ProjectRow | null> {
    const result = await client.query<ProjectRow>(
      `select p.id, p.name, p.client_name, p.archived_at,
              p.created_at, p.updated_at, creator.display_name as created_by,
              pm.role as access_role,
              (select count(*)::int from documents d
                where d.organization_id = p.organization_id
                  and d.project_id = p.id and d.deleted_at is null) as document_count,
              (select count(*)::int from project_folders f
                where f.organization_id = p.organization_id
                  and f.project_id = p.id and f.deleted_at is null) as folder_count
         from projects p
         join users creator on creator.id = p.created_by_user_id
         left join memberships om
           on om.organization_id = p.organization_id and om.user_id = $3
          and om.status = 'active'
         left join project_memberships pm
           on pm.project_id = p.id and pm.organization_id = p.organization_id
          and pm.organization_membership_id = om.id and pm.removed_at is null
        where p.organization_id = $1 and p.id = $2 and p.deleted_at is null`,
      [actor.organizationId, projectId, actor.userId],
    );
    return result.rows[0] ?? null;
  }

  private async requireProjectAccess(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
  ): Promise<ProjectAccess> {
    const row = await this.projectRow(client, actor, projectId);
    const role = effectiveProjectRole(
      actor.organizationRole,
      row?.access_role ?? null,
    );
    if (!row || !role) throw new ProjectOperationError('not_found');
    return { role, row };
  }

  private async requireFolder(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
    folderId: string,
  ): Promise<FolderRow> {
    const result = await client.query<FolderRow>(
      `select id, name, parent_folder_id, sort_order, updated_at
         from project_folders
        where organization_id = $1 and project_id = $2 and id = $3
          and deleted_at is null`,
      [actor.organizationId, projectId, folderId],
    );
    const row = result.rows[0];
    if (!row) throw new ProjectOperationError('not_found');
    return row;
  }

  private async requireDocument(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
    documentId: string,
  ): Promise<DocumentRow> {
    const result = await client.query<DocumentRow>(
      `select id, folder_id, name, kind, sort_order, archived_at,
              created_at, updated_at
         from documents
        where organization_id = $1 and project_id = $2 and id = $3
          and deleted_at is null`,
      [actor.organizationId, projectId, documentId],
    );
    const row = result.rows[0];
    if (!row) throw new ProjectOperationError('not_found');
    return row;
  }

  private async validateFolderParent(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
    folderId: string | null,
  ): Promise<void> {
    if (!folderId) return;
    const result = await client.query(
      `select 1 from project_folders
        where organization_id = $1 and project_id = $2 and id = $3
          and deleted_at is null`,
      [actor.organizationId, projectId, folderId],
    );
    if (!result.rowCount) throw new ProjectOperationError('invalid_parent');
  }

  public async listProjects(
    actor: ProjectActor,
    archived: boolean,
    page: PageInput,
  ): Promise<CursorPage<ProjectSummary>> {
    const cursor = page.cursor
      ? decodeCursor(() => decodeUpdatedCursor(page.cursor!))
      : null;
    const automatic = hasAutomaticProjectAccess(actor.organizationRole);
    const result = await this.pool.query<ProjectRow>(
      `select p.id, p.name, p.client_name, p.archived_at,
              p.created_at, p.updated_at, creator.display_name as created_by,
              pm.role as access_role,
              (select count(*)::int from documents d
                where d.organization_id = p.organization_id
                  and d.project_id = p.id and d.deleted_at is null) as document_count,
              (select count(*)::int from project_folders f
                where f.organization_id = p.organization_id
                  and f.project_id = p.id and f.deleted_at is null) as folder_count
         from projects p
         join users creator on creator.id = p.created_by_user_id
         left join memberships om
           on om.organization_id = p.organization_id and om.user_id = $2
          and om.status = 'active'
         left join project_memberships pm
           on pm.project_id = p.id and pm.organization_id = p.organization_id
          and pm.organization_membership_id = om.id and pm.removed_at is null
        where p.organization_id = $1 and p.deleted_at is null
          and ($3::boolean = true or pm.id is not null)
          and (($4::boolean = true and p.archived_at is not null)
            or ($4::boolean = false and p.archived_at is null))
          and ($5::timestamptz is null
            or (date_trunc('milliseconds', p.updated_at), p.id)
              < ($5::timestamptz, $6::uuid))
        order by date_trunc('milliseconds', p.updated_at) desc, p.id desc
        limit $7`,
      [
        actor.organizationId,
        actor.userId,
        automatic,
        archived,
        cursor?.updatedAt ?? null,
        cursor?.id ?? null,
        page.limit + 1,
      ],
    );
    const rows = result.rows.slice(0, page.limit);
    const last = rows.at(-1);
    return {
      items: rows.map((row) =>
        mapProject(row, automatic ? 'project_lead' : undefined),
      ),
      nextCursor:
        result.rows.length > page.limit && last
          ? encodeCursor({
              id: last.id,
              updatedAt: last.updated_at.toISOString(),
            })
          : null,
    };
  }

  public async getProject(
    actor: ProjectActor,
    projectId: string,
  ): Promise<ProjectSummary> {
    const client = await this.pool.connect();
    try {
      const access = await this.requireProjectAccess(client, actor, projectId);
      return mapProject(access.row, access.role);
    } finally {
      client.release();
    }
  }

  public async createProject(input: {
    actor: ProjectActor;
    clientName: string | null;
    idempotencyKey: string;
    name: string;
    requestId: string;
  }): Promise<ProjectSummary> {
    if (!canCreateProject(input.actor.organizationRole)) {
      throw new ProjectOperationError('denied');
    }
    return inTransaction(this.pool, async (client) => {
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation: 'project.create',
        payload: { clientName: input.clientName, name: input.name },
      });
      if (idempotency.resourceId) {
        const access = await this.requireProjectAccess(
          client,
          input.actor,
          idempotency.resourceId,
        );
        return mapProject(access.row, access.role);
      }
      const project = await client.query<{ id: string }>(
        `insert into projects
          (organization_id, name, client_name, created_by_user_id)
         values ($1, $2, $3, $4) returning id`,
        [
          input.actor.organizationId,
          input.name,
          input.clientName,
          input.actor.userId,
        ],
      );
      const projectId = project.rows[0]?.id;
      if (!projectId) throw new Error('Project creation failed.');
      const organizationMembership = await client.query<{ id: string }>(
        `select id from memberships
          where organization_id = $1 and user_id = $2 and status = 'active'`,
        [input.actor.organizationId, input.actor.userId],
      );
      const organizationMembershipId = organizationMembership.rows[0]?.id;
      if (!organizationMembershipId) {
        throw new ProjectOperationError('denied');
      }
      await client.query(
        `insert into project_memberships
          (organization_id, project_id, organization_membership_id, role,
           added_by_user_id)
         values ($1, $2, $3, 'project_lead', $4)`,
        [
          input.actor.organizationId,
          projectId,
          organizationMembershipId,
          input.actor.userId,
        ],
      );
      await this.completeIdempotency(client, idempotency.recordId, projectId);
      await this.insertAudit(client, {
        action: 'project.created',
        actor: input.actor,
        requestId: input.requestId,
        targetId: projectId,
        targetType: 'project',
      });
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        projectId,
      );
      return mapProject(access.row, access.role);
    });
  }

  public async updateProject(input: {
    actor: ProjectActor;
    clientName?: string | null | undefined;
    expectedUpdatedAt: Date;
    name?: string | undefined;
    projectId: string;
    requestId: string;
  }): Promise<ProjectSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canManageProject(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const updated = await client.query(
        `update projects
            set name = case when $4::boolean then $5 else name end,
                client_name = case when $6::boolean then $7 else client_name end,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and id = $2 and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $3
          returning id`,
        [
          input.actor.organizationId,
          input.projectId,
          input.expectedUpdatedAt,
          input.name !== undefined,
          input.name ?? null,
          input.clientName !== undefined,
          input.clientName ?? null,
        ],
      );
      if (!updated.rowCount) throw new ProjectOperationError('conflict');
      await this.insertAudit(client, {
        action:
          input.name === undefined ? 'project.updated' : 'project.renamed',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.projectId,
        targetType: 'project',
      });
      const next = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      return mapProject(next.row, next.role);
    });
  }

  public async archiveProject(input: {
    actor: ProjectActor;
    archived: boolean;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<ProjectSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canManageProject(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const updated = await client.query(
        `update projects
            set archived_at = case when $4::boolean then now() else null end,
                archived_by_user_id = case when $4::boolean then $5::uuid else null end,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and id = $2 and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $3
          returning id`,
        [
          input.actor.organizationId,
          input.projectId,
          input.expectedUpdatedAt,
          input.archived,
          input.actor.userId,
        ],
      );
      if (!updated.rowCount) throw new ProjectOperationError('conflict');
      await this.insertAudit(client, {
        action: input.archived ? 'project.archived' : 'project.restored',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.projectId,
        targetType: 'project',
      });
      const next = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      return mapProject(next.row, next.role);
    });
  }

  public async deleteProject(input: {
    actor: ProjectActor;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canManageProject(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const updated = await client.query(
        `update projects
            set deleted_at = now(), deleted_by_user_id = $4,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and id = $2 and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $3`,
        [
          input.actor.organizationId,
          input.projectId,
          input.expectedUpdatedAt,
          input.actor.userId,
        ],
      );
      if (!updated.rowCount) throw new ProjectOperationError('conflict');
      await this.insertAudit(client, {
        action: 'project.deleted',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.projectId,
        targetType: 'project',
      });
    });
  }

  public async listFolders(
    actor: ProjectActor,
    projectId: string,
    parentFolderId: string | null,
    page: PageInput,
  ): Promise<CursorPage<ProjectFolderSummary>> {
    const cursor = page.cursor
      ? decodeCursor(() => decodeOrderedCursor(page.cursor!))
      : null;
    const client = await this.pool.connect();
    try {
      await this.requireProjectAccess(client, actor, projectId);
      await this.validateFolderParent(client, actor, projectId, parentFolderId);
      const result = await client.query<FolderRow>(
        `select id, name, parent_folder_id, sort_order, updated_at
           from project_folders
          where organization_id = $1 and project_id = $2
            and parent_folder_id is not distinct from $3::uuid
            and deleted_at is null
            and ($4::int is null
              or (sort_order, lower(name), id) > ($4::int, $5, $6::uuid))
          order by sort_order, lower(name), id
          limit $7`,
        [
          actor.organizationId,
          projectId,
          parentFolderId,
          cursor?.sortOrder ?? null,
          cursor?.name ?? null,
          cursor?.id ?? null,
          page.limit + 1,
        ],
      );
      const rows = result.rows.slice(0, page.limit);
      const last = rows.at(-1);
      return {
        items: rows.map(mapFolder),
        nextCursor:
          result.rows.length > page.limit && last
            ? encodeCursor({
                id: last.id,
                name: last.name.toLowerCase(),
                sortOrder: last.sort_order,
              })
            : null,
      };
    } finally {
      client.release();
    }
  }

  public async getFolderPath(
    actor: ProjectActor,
    projectId: string,
    folderId: string | null,
  ): Promise<FolderPathItem[]> {
    const client = await this.pool.connect();
    try {
      await this.requireProjectAccess(client, actor, projectId);
      if (!folderId) return [];
      await this.requireFolder(client, actor, projectId, folderId);
      const result = await client.query<{
        depth: number;
        id: string;
        name: string;
      }>(
        `with recursive path as (
           select id, name, parent_folder_id, 0 as depth
             from project_folders
            where organization_id = $1 and project_id = $2 and id = $3
              and deleted_at is null
           union all
           select parent.id, parent.name, parent.parent_folder_id,
                  child.depth + 1
             from project_folders parent
             join path child on parent.id = child.parent_folder_id
            where parent.organization_id = $1 and parent.project_id = $2
              and parent.deleted_at is null
         )
         select id, name, depth from path order by depth desc`,
        [actor.organizationId, projectId, folderId],
      );
      return result.rows.map(({ id, name }) => ({ id, name }));
    } finally {
      client.release();
    }
  }

  public async createFolder(input: {
    actor: ProjectActor;
    idempotencyKey: string;
    name: string;
    parentFolderId: string | null;
    projectId: string;
    requestId: string;
  }): Promise<ProjectFolderSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      await this.validateFolderParent(
        client,
        input.actor,
        input.projectId,
        input.parentFolderId,
      );
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation: `folder.create:${input.projectId}`,
        payload: { name: input.name, parentFolderId: input.parentFolderId },
      });
      if (idempotency.resourceId) {
        return mapFolder(
          await this.requireFolder(
            client,
            input.actor,
            input.projectId,
            idempotency.resourceId,
          ),
        );
      }
      const result = await client.query<FolderRow>(
        `insert into project_folders
          (organization_id, project_id, parent_folder_id, name, sort_order,
           created_by_user_id)
         values (
           $1, $2, $3, $4,
           coalesce((select max(sort_order) + 1000 from project_folders
             where organization_id = $1 and project_id = $2
               and parent_folder_id is not distinct from $3::uuid
               and deleted_at is null), 1000),
           $5
         )
         returning id, name, parent_folder_id, sort_order, updated_at`,
        [
          input.actor.organizationId,
          input.projectId,
          input.parentFolderId,
          input.name,
          input.actor.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Folder creation failed.');
      await this.completeIdempotency(client, idempotency.recordId, row.id);
      await this.insertAudit(client, {
        action: 'folder.created',
        actor: input.actor,
        requestId: input.requestId,
        targetId: row.id,
        targetType: 'folder',
      });
      return mapFolder(row);
    });
  }

  public async updateFolder(input: {
    actor: ProjectActor;
    expectedUpdatedAt: Date;
    folderId: string;
    name?: string | undefined;
    parentFolderId?: string | null | undefined;
    projectId: string;
    requestId: string;
    sortOrder?: number | undefined;
  }): Promise<ProjectFolderSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      await this.requireFolder(
        client,
        input.actor,
        input.projectId,
        input.folderId,
      );
      if (input.parentFolderId !== undefined) {
        await this.validateFolderParent(
          client,
          input.actor,
          input.projectId,
          input.parentFolderId,
        );
      }
      const result = await client.query<FolderRow>(
        `update project_folders
            set name = case when $5::boolean then $6 else name end,
                parent_folder_id = case when $7::boolean then $8::uuid else parent_folder_id end,
                sort_order = case when $9::boolean then $10::int else sort_order end,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and project_id = $2 and id = $3
            and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $4
          returning id, name, parent_folder_id, sort_order, updated_at`,
        [
          input.actor.organizationId,
          input.projectId,
          input.folderId,
          input.expectedUpdatedAt,
          input.name !== undefined,
          input.name ?? null,
          input.parentFolderId !== undefined,
          input.parentFolderId ?? null,
          input.sortOrder !== undefined,
          input.sortOrder ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new ProjectOperationError('conflict');
      await this.insertAudit(client, {
        action:
          input.parentFolderId !== undefined
            ? 'folder.moved'
            : input.name !== undefined
              ? 'folder.renamed'
              : 'folder.updated',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.folderId,
        targetType: 'folder',
      });
      return mapFolder(row);
    });
  }

  public async deleteFolder(input: {
    actor: ProjectActor;
    expectedUpdatedAt: Date;
    folderId: string;
    projectId: string;
    requestId: string;
  }): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      await this.requireFolder(
        client,
        input.actor,
        input.projectId,
        input.folderId,
      );
      const contents = await client.query(
        `select 1 from project_folders
          where organization_id = $1 and project_id = $2
            and parent_folder_id = $3 and deleted_at is null
         union all
         select 1 from documents
          where organization_id = $1 and project_id = $2
            and folder_id = $3 and deleted_at is null
         limit 1`,
        [input.actor.organizationId, input.projectId, input.folderId],
      );
      if (contents.rowCount) throw new ProjectOperationError('non_empty');
      const updated = await client.query(
        `update project_folders
            set deleted_at = now(), deleted_by_user_id = $5,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and project_id = $2 and id = $3
            and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $4`,
        [
          input.actor.organizationId,
          input.projectId,
          input.folderId,
          input.expectedUpdatedAt,
          input.actor.userId,
        ],
      );
      if (!updated.rowCount) throw new ProjectOperationError('conflict');
      await this.insertAudit(client, {
        action: 'folder.deleted',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.folderId,
        targetType: 'folder',
      });
    });
  }

  public async listDocuments(
    actor: ProjectActor,
    projectId: string,
    folderId: string | null,
    archived: boolean,
    page: PageInput,
  ): Promise<CursorPage<DocumentSummary>> {
    const cursor = page.cursor
      ? decodeCursor(() => decodeOrderedCursor(page.cursor!))
      : null;
    const client = await this.pool.connect();
    try {
      await this.requireProjectAccess(client, actor, projectId);
      await this.validateFolderParent(client, actor, projectId, folderId);
      const result = await client.query<DocumentRow>(
        `select id, folder_id, name, kind, sort_order, archived_at,
                created_at, updated_at
           from documents
          where organization_id = $1 and project_id = $2
            and folder_id is not distinct from $3::uuid
            and deleted_at is null
            and (($4::boolean = true and archived_at is not null)
              or ($4::boolean = false and archived_at is null))
            and ($5::int is null
              or (sort_order, lower(name), id) > ($5::int, $6, $7::uuid))
          order by sort_order, lower(name), id
          limit $8`,
        [
          actor.organizationId,
          projectId,
          folderId,
          archived,
          cursor?.sortOrder ?? null,
          cursor?.name ?? null,
          cursor?.id ?? null,
          page.limit + 1,
        ],
      );
      const rows = result.rows.slice(0, page.limit);
      const last = rows.at(-1);
      return {
        items: rows.map(mapDocument),
        nextCursor:
          result.rows.length > page.limit && last
            ? encodeCursor({
                id: last.id,
                name: last.name.toLowerCase(),
                sortOrder: last.sort_order,
              })
            : null,
      };
    } finally {
      client.release();
    }
  }

  public async getDocument(
    actor: ProjectActor,
    projectId: string,
    documentId: string,
  ): Promise<DocumentSummary> {
    const client = await this.pool.connect();
    try {
      await this.requireProjectAccess(client, actor, projectId);
      return mapDocument(
        await this.requireDocument(client, actor, projectId, documentId),
      );
    } finally {
      client.release();
    }
  }

  public async createDocument(input: {
    actor: ProjectActor;
    folderId: string | null;
    idempotencyKey: string;
    kind: DocumentKind;
    name: string;
    projectId: string;
    requestId: string;
  }): Promise<DocumentSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      await this.validateFolderParent(
        client,
        input.actor,
        input.projectId,
        input.folderId,
      );
      const idempotency = await this.claimIdempotency(client, {
        actor: input.actor,
        key: input.idempotencyKey,
        operation: `document.create:${input.projectId}`,
        payload: {
          folderId: input.folderId,
          kind: input.kind,
          name: input.name,
        },
      });
      if (idempotency.resourceId) {
        return mapDocument(
          await this.requireDocument(
            client,
            input.actor,
            input.projectId,
            idempotency.resourceId,
          ),
        );
      }
      const result = await client.query<DocumentRow>(
        `insert into documents
          (organization_id, project_id, folder_id, name, kind, sort_order,
           created_by_user_id)
         values (
           $1, $2, $3, $4, $5,
           coalesce((select max(sort_order) + 1000 from documents
             where organization_id = $1 and project_id = $2
               and folder_id is not distinct from $3::uuid
               and deleted_at is null), 1000),
           $6
         )
         returning id, folder_id, name, kind, sort_order, archived_at,
                   created_at, updated_at`,
        [
          input.actor.organizationId,
          input.projectId,
          input.folderId,
          input.name,
          input.kind,
          input.actor.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Document creation failed.');
      await client.query(
        `insert into document_branches
          (organization_id, document_id, name, is_default, created_by_user_id)
         values ($1, $2, 'main', true, $3)`,
        [input.actor.organizationId, row.id, input.actor.userId],
      );
      await this.completeIdempotency(client, idempotency.recordId, row.id);
      await this.insertAudit(client, {
        action: 'document.created',
        actor: input.actor,
        requestId: input.requestId,
        targetId: row.id,
        targetType: 'document',
      });
      return mapDocument(row);
    });
  }

  public async updateDocument(input: {
    actor: ProjectActor;
    documentId: string;
    expectedUpdatedAt: Date;
    folderId?: string | null | undefined;
    name?: string | undefined;
    projectId: string;
    requestId: string;
    sortOrder?: number | undefined;
  }): Promise<DocumentSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      await this.requireDocument(
        client,
        input.actor,
        input.projectId,
        input.documentId,
      );
      if (input.folderId !== undefined) {
        await this.validateFolderParent(
          client,
          input.actor,
          input.projectId,
          input.folderId,
        );
      }
      const result = await client.query<DocumentRow>(
        `update documents
            set name = case when $5::boolean then $6 else name end,
                folder_id = case when $7::boolean then $8::uuid else folder_id end,
                sort_order = case when $9::boolean then $10::int else sort_order end,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and project_id = $2 and id = $3
            and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $4
          returning id, folder_id, name, kind, sort_order, archived_at,
                    created_at, updated_at`,
        [
          input.actor.organizationId,
          input.projectId,
          input.documentId,
          input.expectedUpdatedAt,
          input.name !== undefined,
          input.name ?? null,
          input.folderId !== undefined,
          input.folderId ?? null,
          input.sortOrder !== undefined,
          input.sortOrder ?? null,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new ProjectOperationError('conflict');
      await this.insertAudit(client, {
        action:
          input.folderId !== undefined
            ? 'document.moved'
            : input.name !== undefined
              ? 'document.renamed'
              : 'document.updated',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.documentId,
        targetType: 'document',
      });
      return mapDocument(row);
    });
  }

  public async archiveDocument(input: {
    actor: ProjectActor;
    archived: boolean;
    documentId: string;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<DocumentSummary> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const result = await client.query<DocumentRow>(
        `update documents
            set archived_at = case when $5::boolean then now() else null end,
                archived_by_user_id = case when $5::boolean then $6::uuid else null end,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and project_id = $2 and id = $3
            and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $4
          returning id, folder_id, name, kind, sort_order, archived_at,
                    created_at, updated_at`,
        [
          input.actor.organizationId,
          input.projectId,
          input.documentId,
          input.expectedUpdatedAt,
          input.archived,
          input.actor.userId,
        ],
      );
      const row = result.rows[0];
      if (!row) {
        await this.requireDocument(
          client,
          input.actor,
          input.projectId,
          input.documentId,
        );
        throw new ProjectOperationError('conflict');
      }
      await this.insertAudit(client, {
        action: input.archived ? 'document.archived' : 'document.restored',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.documentId,
        targetType: 'document',
      });
      return mapDocument(row);
    });
  }

  public async deleteDocument(input: {
    actor: ProjectActor;
    documentId: string;
    expectedUpdatedAt: Date;
    projectId: string;
    requestId: string;
  }): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canWriteProjectContent(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const updated = await client.query(
        `update documents
            set deleted_at = now(), deleted_by_user_id = $5,
                updated_at = greatest(
                  date_trunc('milliseconds', clock_timestamp()),
                  date_trunc('milliseconds', updated_at) + interval '1 millisecond'
                )
          where organization_id = $1 and project_id = $2 and id = $3
            and deleted_at is null
            and date_trunc('milliseconds', updated_at) = $4`,
        [
          input.actor.organizationId,
          input.projectId,
          input.documentId,
          input.expectedUpdatedAt,
          input.actor.userId,
        ],
      );
      if (!updated.rowCount) {
        await this.requireDocument(
          client,
          input.actor,
          input.projectId,
          input.documentId,
        );
        throw new ProjectOperationError('conflict');
      }
      await this.insertAudit(client, {
        action: 'document.deleted',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.documentId,
        targetType: 'document',
      });
    });
  }

  public async listProjectMembers(
    actor: ProjectActor,
    projectId: string,
    page: PageInput,
  ): Promise<CursorPage<ProjectTeamMember>> {
    const cursor = page.cursor
      ? decodeCursor(() => decodeNameCursor(page.cursor!))
      : null;
    const client = await this.pool.connect();
    try {
      await this.requireProjectAccess(client, actor, projectId);
      const result = await client.query<TeamRow>(
        `select pm.id, pm.organization_membership_id, pm.role,
                pm.created_at as added_at, m.user_id,
                m.role as organization_role, u.display_name, u.primary_email
           from project_memberships pm
           join memberships m on m.id = pm.organization_membership_id
             and m.organization_id = pm.organization_id
           join users u on u.id = m.user_id
          where pm.organization_id = $1 and pm.project_id = $2
            and pm.removed_at is null and m.status = 'active'
            and ($3::text is null
              or (lower(u.display_name), pm.id) > ($3, $4::uuid))
          order by lower(u.display_name), pm.id
          limit $5`,
        [
          actor.organizationId,
          projectId,
          cursor?.name ?? null,
          cursor?.id ?? null,
          page.limit + 1,
        ],
      );
      const rows = result.rows.slice(0, page.limit);
      const last = rows.at(-1);
      return {
        items: rows.map(mapTeamMember),
        nextCursor:
          result.rows.length > page.limit && last
            ? encodeCursor({
                id: last.id,
                name: last.display_name.toLowerCase(),
              })
            : null,
      };
    } finally {
      client.release();
    }
  }

  private async requireTeamMember(
    client: PoolClient,
    actor: ProjectActor,
    projectId: string,
    projectMembershipId: string,
  ): Promise<TeamRow> {
    const result = await client.query<TeamRow>(
      `select pm.id, pm.organization_membership_id, pm.role,
              pm.created_at as added_at, m.user_id,
              m.role as organization_role, u.display_name, u.primary_email
         from project_memberships pm
         join memberships m on m.id = pm.organization_membership_id
           and m.organization_id = pm.organization_id
         join users u on u.id = m.user_id
        where pm.organization_id = $1 and pm.project_id = $2 and pm.id = $3
          and pm.removed_at is null and m.status = 'active'`,
      [actor.organizationId, projectId, projectMembershipId],
    );
    const row = result.rows[0];
    if (!row) throw new ProjectOperationError('not_found');
    return row;
  }

  public async addProjectMember(input: {
    actor: ProjectActor;
    organizationMembershipId: string;
    projectId: string;
    requestId: string;
    role: ProjectRole;
  }): Promise<ProjectTeamMember> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canManageProjectTeam(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const target = await client.query<{
        organization_role: ProjectTeamMember['organizationRole'];
      }>(
        `select role as organization_role from memberships
          where organization_id = $1 and id = $2 and status = 'active'`,
        [input.actor.organizationId, input.organizationMembershipId],
      );
      const targetRole = target.rows[0]?.organization_role;
      if (!targetRole) throw new ProjectOperationError('not_found');
      if (!projectRoleAllowed(targetRole, input.role)) {
        throw new ProjectOperationError('role_exceeds_organization');
      }
      const result = await client.query<{ id: string }>(
        `insert into project_memberships
          (organization_id, project_id, organization_membership_id, role,
           added_by_user_id)
         values ($1, $2, $3, $4, $5)
         returning id`,
        [
          input.actor.organizationId,
          input.projectId,
          input.organizationMembershipId,
          input.role,
          input.actor.userId,
        ],
      );
      const membershipId = result.rows[0]?.id;
      if (!membershipId) throw new Error('Project membership creation failed.');
      await this.insertAudit(client, {
        action: 'project.membership_added',
        actor: input.actor,
        metadata: { role: input.role },
        requestId: input.requestId,
        targetId: membershipId,
        targetType: 'project_membership',
      });
      return mapTeamMember(
        await this.requireTeamMember(
          client,
          input.actor,
          input.projectId,
          membershipId,
        ),
      );
    });
  }

  public async changeProjectMemberRole(input: {
    actor: ProjectActor;
    projectId: string;
    projectMembershipId: string;
    requestId: string;
    role: ProjectRole;
  }): Promise<ProjectTeamMember> {
    return inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canManageProjectTeam(access.role)) {
        throw new ProjectOperationError('denied');
      }
      const member = await this.requireTeamMember(
        client,
        input.actor,
        input.projectId,
        input.projectMembershipId,
      );
      if (!projectRoleAllowed(member.organization_role, input.role)) {
        throw new ProjectOperationError('role_exceeds_organization');
      }
      await client.query(
        `update project_memberships set role = $4, updated_at = now()
          where organization_id = $1 and project_id = $2 and id = $3
            and removed_at is null`,
        [
          input.actor.organizationId,
          input.projectId,
          input.projectMembershipId,
          input.role,
        ],
      );
      await this.insertAudit(client, {
        action: 'project.membership_role_changed',
        actor: input.actor,
        metadata: { fromRole: member.role, toRole: input.role },
        requestId: input.requestId,
        targetId: input.projectMembershipId,
        targetType: 'project_membership',
      });
      return mapTeamMember(
        await this.requireTeamMember(
          client,
          input.actor,
          input.projectId,
          input.projectMembershipId,
        ),
      );
    });
  }

  public async removeProjectMember(input: {
    actor: ProjectActor;
    projectId: string;
    projectMembershipId: string;
    requestId: string;
  }): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const access = await this.requireProjectAccess(
        client,
        input.actor,
        input.projectId,
      );
      if (!canManageProjectTeam(access.role)) {
        throw new ProjectOperationError('denied');
      }
      await this.requireTeamMember(
        client,
        input.actor,
        input.projectId,
        input.projectMembershipId,
      );
      await client.query(
        `update project_memberships
            set removed_at = now(), removed_by_user_id = $4, updated_at = now()
          where organization_id = $1 and project_id = $2 and id = $3
            and removed_at is null`,
        [
          input.actor.organizationId,
          input.projectId,
          input.projectMembershipId,
          input.actor.userId,
        ],
      );
      await this.insertAudit(client, {
        action: 'project.membership_removed',
        actor: input.actor,
        requestId: input.requestId,
        targetId: input.projectMembershipId,
        targetType: 'project_membership',
      });
    });
  }
}
