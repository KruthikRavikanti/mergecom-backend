import type { Pool } from 'pg';

import { hasAutomaticProjectAccess } from '../projects/authorization';
import { SAMPLE_NAME_PREFIX } from './sample-policy';
import type { OnboardingStore } from './store';
import { OnboardingOperationError } from './store';
import type {
  OnboardingActor,
  OnboardingEvidence,
  ProductFeedback,
  SampleComparison,
} from './types';

const accessibleProjects = `
  accessible_projects as (
    select p.id,
           case when $3::boolean then 'project_lead'::text else pm.role::text end as access_role
      from projects p
      left join memberships m on m.organization_id = p.organization_id
       and m.user_id = $2 and m.status = 'active'
      left join project_memberships pm on pm.organization_id = p.organization_id
       and pm.project_id = p.id and pm.organization_membership_id = m.id
       and pm.removed_at is null
     where p.organization_id = $1 and p.archived_at is null
       and p.deleted_at is null and ($3::boolean or pm.id is not null)
  )`;

export class PostgresOnboardingStore implements OnboardingStore {
  public constructor(private readonly pool: Pool) {}

  public async getEvidence(input: {
    actor: OnboardingActor;
  }): Promise<OnboardingEvidence> {
    const result = await this.pool.query<{
      can_write_content: boolean;
      has_comparison: boolean;
      has_document: boolean;
      has_project: boolean;
      has_review_action: boolean;
      has_sample_recent: boolean;
      has_version: boolean;
    }>(
      `with ${accessibleProjects},
       sample_projects as (
         select distinct project_id from sample_comparisons
          where organization_id = $1
       ),
       customer_projects as (
         select accessible.* from accessible_projects accessible
          where not exists (
            select 1 from sample_projects sample
             where sample.project_id = accessible.id
          )
       ),
       customer_documents as (
         select d.id from documents d
         join customer_projects p on p.id = d.project_id
          where d.organization_id = $1 and d.archived_at is null
            and d.deleted_at is null
       )
       select
         exists(select 1 from customer_projects) as has_project,
         exists(select 1 from customer_documents) as has_document,
         exists(
           select 1 from document_versions version
           join customer_documents d on d.id = version.document_id
            where version.organization_id = $1 and version.author_user_id = $2
         ) as has_version,
         exists(
           select 1 from version_comparisons comparison
           join customer_documents d on d.id = comparison.document_id
            where comparison.organization_id = $1
              and comparison.requested_by_user_id = $2
              and comparison.status = 'completed'
         ) as has_comparison,
         exists(
           select 1 from review_requests review
           join customer_documents d on d.id = review.document_id
            where review.organization_id = $1
              and (review.requested_by_user_id = $2 or exists (
                select 1 from review_decisions decision
                 where decision.review_request_id = review.id
                   and decision.reviewer_user_id = $2
              ))
         ) as has_review_action,
         exists(
           select 1 from user_document_recents recent
           join sample_comparisons sample
             on sample.organization_id = recent.organization_id
            and sample.document_id = recent.document_id
            where recent.organization_id = $1 and recent.user_id = $2
         ) as has_sample_recent,
         exists(
           select 1 from accessible_projects
            where access_role in ('project_lead', 'contributor')
         ) as can_write_content`,
      [
        input.actor.organizationId,
        input.actor.userId,
        hasAutomaticProjectAccess(input.actor.organizationRole),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new OnboardingOperationError('not_found');
    return {
      canWriteContent: row.can_write_content,
      hasComparison: row.has_comparison,
      hasDocument: row.has_document,
      hasProject: row.has_project,
      hasReviewAction: row.has_review_action,
      hasSampleRecent: row.has_sample_recent,
      hasVersion: row.has_version,
    };
  }

  public async getPreferences(input: { actor: OnboardingActor }): Promise<{
    dismissed: boolean;
    tourStatus: 'completed' | 'skipped' | 'unseen';
    tourVersion: string | null;
  }> {
    const result = await this.pool.query<{
      dismissed: boolean;
      tour_status: 'completed' | 'skipped' | null;
      tour_version: string | null;
    }>(
      `select dismissed_at is not null as dismissed, tour_status, tour_version
         from user_onboarding_states
        where organization_id = $1 and user_id = $2`,
      [input.actor.organizationId, input.actor.userId],
    );
    const row = result.rows[0];
    return {
      dismissed: row?.dismissed ?? false,
      tourStatus: row?.tour_status ?? 'unseen',
      tourVersion: row?.tour_version ?? null,
    };
  }

  public async updatePreferences(input: {
    actor: OnboardingActor;
    dismissed?: boolean | undefined;
    tour?: { status: 'completed' | 'skipped'; version: string } | undefined;
  }): Promise<void> {
    await this.pool.query(
      `insert into user_onboarding_states
        (organization_id, user_id, dismissed_at, tour_version, tour_status,
         tour_updated_at)
       values ($1, $2,
         case when $3::boolean then now() else null end,
         $4, $5, case when $5::text is null then null else now() end)
       on conflict (organization_id, user_id) do update set
         dismissed_at = case
           when $3::boolean is null then user_onboarding_states.dismissed_at
           when $3::boolean then now() else null end,
         tour_version = coalesce($4, user_onboarding_states.tour_version),
         tour_status = coalesce($5, user_onboarding_states.tour_status),
         tour_updated_at = case when $5::text is null
           then user_onboarding_states.tour_updated_at else now() end,
         updated_at = now()`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.dismissed ?? null,
        input.tour?.version ?? null,
        input.tour?.status ?? null,
      ],
    );
  }

  public async listSamples(input: {
    actor: OnboardingActor;
  }): Promise<SampleComparison[]> {
    const result = await this.pool.query<{
      comparison_id: string;
      description: string;
      document_id: string;
      document_name: string;
      kind: SampleComparison['kind'];
      project_id: string;
      project_name: string;
      title: string;
    }>(
      `with ${accessibleProjects}
       select sample.comparison_id, sample.description, sample.kind::text,
              sample.title, project.id as project_id,
              project.name as project_name, document.id as document_id,
              document.name as document_name
         from sample_comparisons sample
         join accessible_projects access on access.id = sample.project_id
         join projects project on project.id = sample.project_id
         join documents document on document.id = sample.document_id
          and document.archived_at is null and document.deleted_at is null
         join version_comparisons comparison on comparison.id = sample.comparison_id
          and comparison.status = 'completed'
        where sample.organization_id = $1
        order by case sample.kind
          when 'word_document' then 1 when 'spreadsheet' then 2 else 3 end`,
      [
        input.actor.organizationId,
        input.actor.userId,
        hasAutomaticProjectAccess(input.actor.organizationRole),
      ],
    );
    return result.rows.map(mapSample);
  }

  public async registerSample(input: {
    actor: OnboardingActor;
    comparisonId: string;
    description: string;
    documentId: string;
    kind: SampleComparison['kind'];
    projectId: string;
    title: string;
  }): Promise<SampleComparison> {
    const result = await this.pool.query<{
      comparison_id: string;
      description: string;
      document_id: string;
      document_name: string;
      kind: SampleComparison['kind'];
      project_id: string;
      project_name: string;
      title: string;
    }>(
      `insert into sample_comparisons
        (organization_id, project_id, document_id, comparison_id, kind,
         title, description, created_by_user_id)
       select $1, project.id, document.id, comparison.id, $6, $7, $8, $2
         from projects project
         join documents document on document.project_id = project.id
         join version_comparisons comparison
           on comparison.document_id = document.id
        where project.organization_id = $1 and project.id = $3
          and left(project.name, length($9)) = $9
          and length(project.name) > length($9)
          and document.organization_id = $1 and document.id = $4
          and left(document.name, length($9)) = $9
          and length(document.name) > length($9) and document.kind = $6
          and comparison.organization_id = $1 and comparison.id = $5
          and comparison.status = 'completed'
       on conflict (organization_id, kind) do update set
         project_id = excluded.project_id,
         document_id = excluded.document_id,
         comparison_id = excluded.comparison_id,
         title = excluded.title,
         description = excluded.description,
         created_by_user_id = excluded.created_by_user_id,
         created_at = now()
       returning comparison_id, description, kind::text, title,
         project_id, document_id,
         (select name from projects where id = project_id) as project_name,
         (select name from documents where id = document_id) as document_name`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.projectId,
        input.documentId,
        input.comparisonId,
        input.kind,
        input.title,
        input.description,
        SAMPLE_NAME_PREFIX,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new OnboardingOperationError('invalid_sample');
    return mapSample(row);
  }

  public async appendFeedback(
    input: Parameters<OnboardingStore['appendFeedback']>[0],
  ): Promise<ProductFeedback> {
    const result = await this.pool.query<{
      comment: string | null;
      created_at: Date;
      id: string;
      product_version: string;
      rating: number;
      reason: ProductFeedback['reason'];
      resource_type: ProductFeedback['resourceType'];
      route: string;
      user_id: string;
    }>(
      `insert into product_feedback
        (organization_id, user_id, rating, reason, comment, route,
         resource_type, product_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id, user_id, rating, reason, comment, route, resource_type,
         product_version, created_at`,
      [
        input.actor.organizationId,
        input.actor.userId,
        input.rating,
        input.reason,
        input.comment,
        input.route,
        input.resourceType,
        input.productVersion,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new OnboardingOperationError('not_found');
    return mapFeedback(row);
  }

  public async listFeedback(input: {
    actor: OnboardingActor;
    limit: number;
  }): Promise<ProductFeedback[]> {
    const result = await this.pool.query<{
      comment: string | null;
      created_at: Date;
      id: string;
      product_version: string;
      rating: number;
      reason: ProductFeedback['reason'];
      resource_type: ProductFeedback['resourceType'];
      route: string;
      user_id: string;
    }>(
      `select id, user_id, rating, reason, comment, route, resource_type,
              product_version, created_at
         from product_feedback
        where organization_id = $1
        order by created_at desc, id desc limit $2`,
      [input.actor.organizationId, input.limit],
    );
    return result.rows.map(mapFeedback);
  }
}

function mapSample(row: {
  comparison_id: string;
  description: string;
  document_id: string;
  document_name: string;
  kind: SampleComparison['kind'];
  project_id: string;
  project_name: string;
  title: string;
}): SampleComparison {
  return {
    description: row.description,
    destination: `/app/projects/${row.project_id}/documents/${row.document_id}/history/comparisons/${row.comparison_id}?tour=1`,
    document: { id: row.document_id, name: row.document_name },
    id: row.comparison_id,
    kind: row.kind,
    project: { id: row.project_id, name: row.project_name },
    title: row.title,
  };
}

function mapFeedback(row: {
  comment: string | null;
  created_at: Date;
  id: string;
  product_version: string;
  rating: number;
  reason: ProductFeedback['reason'];
  resource_type: ProductFeedback['resourceType'];
  route: string;
  user_id: string;
}): ProductFeedback {
  return {
    comment: row.comment,
    createdAt: row.created_at,
    id: row.id,
    productVersion: row.product_version,
    rating: row.rating,
    reason: row.reason,
    resourceType: row.resource_type,
    route: row.route,
    userId: row.user_id,
  };
}
