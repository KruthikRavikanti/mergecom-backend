import type { Pool } from 'pg';

import { hasAutomaticProjectAccess } from '../projects/authorization';
import type { WorkspaceStore } from './store';
import { WorkspaceOperationError } from './store';
import { searchDestination, workItemPresentation } from './presentation';
import type {
  RecentDocument,
  SearchResourceType,
  WorkItem,
  WorkItemType,
  WorkPage,
  WorkSection,
  WorkspaceActor,
  WorkspaceSearchResult,
} from './types';

interface WorkRow {
  actor_id: string | null;
  actor_name: string | null;
  document_id: string;
  document_name: string;
  item_type: WorkItemType;
  priority: number;
  project_id: string;
  project_name: string;
  resource_id: string;
  status: string;
  updated_at: Date;
}

interface SearchRow {
  breadcrumb: string;
  document_id: string | null;
  id: string;
  name: string;
  project_id: string;
  resource_type: SearchResourceType;
  updated_at: Date;
}

interface WorkCursor {
  id: string;
  priority: number;
  updatedAt: string;
}

const accessibleProjects = `
  accessible_projects as (
    select p.id, p.name,
           case when $3::boolean then 'project_lead'::text else pm.role::text end as access_role
      from projects p
      left join memberships m on m.organization_id = p.organization_id
       and m.user_id = $2 and m.status = 'active'
      left join project_memberships pm on pm.organization_id = p.organization_id
       and pm.project_id = p.id and pm.organization_membership_id = m.id
       and pm.removed_at is null
     where p.organization_id = $1 and p.archived_at is null and p.deleted_at is null
       and ($3::boolean or pm.id is not null)
  )`;

export class PostgresWorkspaceStore implements WorkspaceStore {
  public constructor(private readonly pool: Pool) {}

  public async listWork(input: {
    actor: WorkspaceActor;
    page: { cursor?: string | undefined; limit: number };
    section: WorkSection | null;
  }): Promise<WorkPage> {
    const cursor = input.page.cursor
      ? decodeWorkCursor(input.page.cursor)
      : null;
    const result = await this.pool.query<WorkRow>(
      `with recursive ${accessibleProjects},
       work as (
        select 'assigned_review'::text as item_type, r.id as resource_id,
               r.status::text as status, 10 as priority, r.updated_at,
               p.id as project_id, p.name as project_name,
               d.id as document_id, d.name as document_name,
               requester.id as actor_id, requester.display_name as actor_name
          from review_requests r
          join review_assignments assignment on assignment.review_request_id = r.id
           and assignment.reviewer_user_id = $2
          left join review_decisions decision on decision.review_request_id = r.id
           and decision.reviewer_user_id = $2
          join documents d on d.id = r.document_id
          join accessible_projects p on p.id = d.project_id
          join users requester on requester.id = r.requested_by_user_id
         where r.organization_id = $1 and r.status = 'open' and decision.id is null
        union all
        select 'changes_requested', r.id, r.status::text, 20, r.updated_at,
               p.id, p.name, d.id, d.name, closer.id, closer.display_name
          from review_requests r
          join document_versions v on v.id = r.version_id and v.author_user_id = $2
          join documents d on d.id = r.document_id
          join accessible_projects p on p.id = d.project_id
          left join users closer on closer.id = r.closed_by_user_id
         where r.organization_id = $1 and r.status = 'changes_requested'
        union all
        select 'awaiting_decisions', r.id, r.status::text, 30, r.updated_at,
               p.id, p.name, d.id, d.name, null::uuid, null::text
          from review_requests r
          join documents d on d.id = r.document_id
          join accessible_projects p on p.id = d.project_id
         where r.organization_id = $1 and r.requested_by_user_id = $2
           and r.status = 'open'
           and exists (
             select 1 from review_assignments a
             left join review_decisions rd on rd.review_request_id = a.review_request_id
              and rd.reviewer_user_id = a.reviewer_user_id
             where a.review_request_id = r.id and rd.id is null
           )
        union all
        select case when v.status = 'conflicted'
                    then 'incoming_conflict' else 'version_exception' end,
               v.id, v.status::text,
               case when v.status = 'conflicted' then 35 else 40 end,
               v.created_at, p.id, p.name, d.id, d.name,
               author.id, author.display_name
          from document_versions v
          join documents d on d.id = v.document_id
          join accessible_projects p on p.id = d.project_id
          join users author on author.id = v.author_user_id
         where v.organization_id = $1
           and v.status in ('conflicted', 'quarantined', 'failed')
           and (v.author_user_id = $2 or p.access_role = 'project_lead')
        union all
        select 'comparison_exception', comparison.id, comparison.status::text,
               45, comparison.updated_at, p.id, p.name, d.id, d.name,
               requester.id, requester.display_name
          from version_comparisons comparison
          join documents d on d.id = comparison.document_id
          join accessible_projects p on p.id = d.project_id
          join users requester on requester.id = comparison.requested_by_user_id
         where comparison.organization_id = $1
           and comparison.status in ('permanently_failed', 'quarantined')
           and (comparison.requested_by_user_id = $2 or p.access_role = 'project_lead')
        union all
        select 'recent_document', recent.document_id, 'recent'::text, 100,
               recent.opened_at, p.id, p.name, d.id, d.name,
               null::uuid, null::text
          from user_document_recents recent
          join documents d on d.id = recent.document_id and d.archived_at is null
           and d.deleted_at is null
          join accessible_projects p on p.id = d.project_id
         where recent.organization_id = $1 and recent.user_id = $2
        union all
        select 'recent_comparison', comparison.id, comparison.status::text,
               200, comparison.updated_at, p.id, p.name, d.id, d.name,
               requester.id, requester.display_name
          from version_comparisons comparison
          join documents d on d.id = comparison.document_id
          join accessible_projects p on p.id = d.project_id
          join users requester on requester.id = comparison.requested_by_user_id
         where comparison.organization_id = $1 and comparison.status = 'completed'
        union all
        select 'approved_version', r.id, r.status::text, 210, r.updated_at,
               p.id, p.name, d.id, d.name, closer.id, closer.display_name
          from review_requests r
          join documents d on d.id = r.document_id
          join accessible_projects p on p.id = d.project_id
          left join users closer on closer.id = r.closed_by_user_id
         where r.organization_id = $1 and r.status = 'approved'
        union all
        select 'recent_version', v.id, v.status::text, 220, v.created_at,
               p.id, p.name, d.id, d.name, author.id, author.display_name
          from document_versions v
          join documents d on d.id = v.document_id
          join accessible_projects p on p.id = d.project_id
          join users author on author.id = v.author_user_id
         where v.organization_id = $1 and v.status = 'ready'
       )
       select * from work
        where ($4::text is null
          or ($4 = 'attention' and priority < 100)
          or ($4 = 'continue' and priority >= 100 and priority < 200)
          or ($4 = 'activity' and priority >= 200))
          and ($5::int is null or priority > $5
            or (priority = $5 and updated_at < $6::timestamptz)
            or (priority = $5 and updated_at = $6::timestamptz
              and resource_id < $7::uuid))
        order by priority, updated_at desc, resource_id desc
        limit $8`,
      [
        input.actor.organizationId,
        input.actor.userId,
        hasAutomaticProjectAccess(input.actor.organizationRole),
        input.section,
        cursor?.priority ?? null,
        cursor?.updatedAt ?? null,
        cursor?.id ?? null,
        input.page.limit + 1,
      ],
    );
    const rows = result.rows.slice(0, input.page.limit);
    const last = rows.at(-1);
    return {
      items: rows.map(mapWorkItem),
      nextCursor:
        result.rows.length > input.page.limit && last
          ? encodeWorkCursor({
              id: last.resource_id,
              priority: last.priority,
              updatedAt: last.updated_at.toISOString(),
            })
          : null,
    };
  }

  public async search(input: {
    actor: WorkspaceActor;
    limit: number;
    query: string;
  }): Promise<WorkspaceSearchResult[]> {
    const normalized = input.query.trim().replace(/\s+/gu, ' ').toLowerCase();
    if (!normalized) return [];
    const result = await this.pool.query<SearchRow>(
      `with recursive ${accessibleProjects},
       folder_paths as (
         select f.id, f.project_id, f.parent_folder_id, f.name::text as path
           from project_folders f
           join accessible_projects p on p.id = f.project_id
          where f.organization_id = $1 and f.parent_folder_id is null
            and f.deleted_at is null
         union all
         select child.id, child.project_id, child.parent_folder_id,
                (parent.path || ' / ' || child.name)::text
           from project_folders child
           join folder_paths parent on parent.id = child.parent_folder_id
          where child.organization_id = $1 and child.deleted_at is null
       ),
       results as (
         select 'project'::text as resource_type, p.id, p.id as project_id,
                null::uuid as document_id, p.name, p.name as breadcrumb,
                project.updated_at
           from accessible_projects p
           join projects project on project.id = p.id
          where lower(p.name) like '%' || $4 || '%'
         union all
         select 'folder', folder.id, p.id, null::uuid, folder.name,
                p.name || ' / ' || paths.path, folder.updated_at
           from project_folders folder
           join folder_paths paths on paths.id = folder.id
           join accessible_projects p on p.id = folder.project_id
          where lower(folder.name) like '%' || $4 || '%'
         union all
         select 'document', document.id, p.id, document.id, document.name,
                p.name || coalesce(' / ' || paths.path, '') || ' / ' || document.name,
                document.updated_at
           from documents document
           join accessible_projects p on p.id = document.project_id
           left join folder_paths paths on paths.id = document.folder_id
          where document.organization_id = $1 and document.archived_at is null
            and document.deleted_at is null
            and lower(document.name) like '%' || $4 || '%'
       )
       select * from results
        order by case when lower(name) = $4 then 0
                      when lower(name) like $4 || '%' then 1 else 2 end,
                 updated_at desc, id desc
        limit $5`,
      [
        input.actor.organizationId,
        input.actor.userId,
        hasAutomaticProjectAccess(input.actor.organizationRole),
        normalized,
        input.limit,
      ],
    );
    return result.rows.map((row) => ({
      breadcrumb: row.breadcrumb,
      destination: searchDestination({
        documentId: row.document_id,
        id: row.id,
        projectId: row.project_id,
        resourceType: row.resource_type,
      }),
      id: row.id,
      name: row.name,
      resourceType: row.resource_type,
      updatedAt: row.updated_at,
    }));
  }

  public async listRecents(input: {
    actor: WorkspaceActor;
    limit: number;
  }): Promise<RecentDocument[]> {
    const result = await this.pool.query<{
      document_id: string;
      document_kind: string;
      document_name: string;
      opened_at: Date;
      project_id: string;
      project_name: string;
    }>(
      `with ${accessibleProjects}
       select recent.opened_at, d.id as document_id, d.name as document_name,
              d.kind::text as document_kind, p.id as project_id,
              p.name as project_name
         from user_document_recents recent
         join documents d on d.id = recent.document_id and d.archived_at is null
          and d.deleted_at is null
         join accessible_projects p on p.id = d.project_id
        where recent.organization_id = $1 and recent.user_id = $2
        order by recent.opened_at desc, d.id desc limit $4`,
      [
        input.actor.organizationId,
        input.actor.userId,
        hasAutomaticProjectAccess(input.actor.organizationRole),
        input.limit,
      ],
    );
    return result.rows.map((row) => ({
      destination: `/app/projects/${row.project_id}/documents/${row.document_id}/history`,
      document: {
        id: row.document_id,
        kind: row.document_kind,
        name: row.document_name,
      },
      openedAt: row.opened_at,
      project: { id: row.project_id, name: row.project_name },
    }));
  }

  public async recordRecent(input: {
    actor: WorkspaceActor;
    documentId: string;
    projectId: string;
  }): Promise<void> {
    const result = await this.pool.query(
      `with ${accessibleProjects}
       insert into user_document_recents
         (organization_id, user_id, document_id, opened_at)
       select $1, $2, d.id, now()
         from documents d
         join accessible_projects p on p.id = d.project_id
        where d.organization_id = $1 and d.project_id = $4 and d.id = $5
          and d.archived_at is null and d.deleted_at is null
       on conflict (organization_id, user_id, document_id)
       do update set opened_at = excluded.opened_at
       returning document_id`,
      [
        input.actor.organizationId,
        input.actor.userId,
        hasAutomaticProjectAccess(input.actor.organizationRole),
        input.projectId,
        input.documentId,
      ],
    );
    if (!result.rowCount) throw new WorkspaceOperationError('not_found');
  }
}

function mapWorkItem(row: WorkRow): WorkItem {
  const presentation = workItemPresentation({
    documentId: row.document_id,
    itemType: row.item_type,
    projectId: row.project_id,
    resourceId: row.resource_id,
  });
  return {
    acknowledged: false,
    actionLabel: presentation.actionLabel,
    actor:
      row.actor_id && row.actor_name
        ? { id: row.actor_id, name: row.actor_name }
        : null,
    destination: presentation.destination,
    document: { id: row.document_id, name: row.document_name },
    itemType: row.item_type,
    priority: row.priority,
    project: { id: row.project_id, name: row.project_name },
    resourceId: row.resource_id,
    section: presentation.section,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function encodeWorkCursor(cursor: WorkCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeWorkCursor(value: string): WorkCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as Partial<WorkCursor>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.priority !== 'number' ||
      typeof parsed.updatedAt !== 'string' ||
      !Number.isFinite(new Date(parsed.updatedAt).getTime())
    ) {
      throw new Error('invalid');
    }
    return parsed as WorkCursor;
  } catch {
    throw new WorkspaceOperationError('invalid_cursor');
  }
}
