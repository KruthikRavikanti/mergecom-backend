import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityRuntime } from '../identity/auth-routes';
import {
  createSecurityHandlers,
  sendApiError,
} from '../identity/http-security';
import type { ProjectActor } from '../projects/types';
import { WorkspaceOperationError, type WorkspaceStore } from './store';

const Id = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const OrganizationParams = Type.Object({ organizationId: Id });
const MutationHeaders = Type.Object({
  'x-csrf-token': Type.String({ minLength: 20 }),
});
const WorkSection = Type.Union([
  Type.Literal('attention'),
  Type.Literal('continue'),
  Type.Literal('activity'),
]);
const WorkItemType = Type.Union([
  Type.Literal('assigned_review'),
  Type.Literal('changes_requested'),
  Type.Literal('awaiting_decisions'),
  Type.Literal('version_exception'),
  Type.Literal('comparison_exception'),
  Type.Literal('incoming_conflict'),
  Type.Literal('recent_comparison'),
  Type.Literal('approved_version'),
  Type.Literal('recent_version'),
  Type.Literal('recent_document'),
]);
const NamedResource = Type.Object({ id: Id, name: Type.String() });
const WorkItem = Type.Object({
  acknowledged: Type.Boolean(),
  actionLabel: Type.String(),
  actor: Type.Union([NamedResource, Type.Null()]),
  destination: Type.String(),
  document: NamedResource,
  itemType: WorkItemType,
  priority: Type.Integer({ minimum: 0 }),
  project: NamedResource,
  resourceId: Id,
  section: WorkSection,
  status: Type.String(),
  updatedAt: DateTime,
});
const SearchResult = Type.Object({
  breadcrumb: Type.String(),
  destination: Type.String(),
  id: Id,
  name: Type.String(),
  resourceType: Type.Union([
    Type.Literal('project'),
    Type.Literal('folder'),
    Type.Literal('document'),
  ]),
  updatedAt: DateTime,
});
const RecentDocument = Type.Object({
  destination: Type.String(),
  document: Type.Object({
    id: Id,
    kind: Type.String(),
    name: Type.String(),
  }),
  openedAt: DateTime,
  project: NamedResource,
});
const Errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};

interface WorkspaceRuntime extends IdentityRuntime {
  workspaceStore: WorkspaceStore;
}

function actor(request: FastifyRequest): ProjectActor {
  const context = request.sessionContext!;
  const membership = context.activeMembership!;
  return {
    organizationId: membership.organizationId,
    organizationRole: membership.role,
    userId: context.user.id,
  };
}

function sendWorkspaceError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof WorkspaceOperationError)) throw error;
  if (error.code === 'invalid_cursor') {
    return sendApiError(reply, 400, 'invalid_cursor', 'The cursor is invalid.');
  }
  return sendApiError(reply, 404, 'not_found', 'Resource not found.');
}

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  runtime: WorkspaceRuntime,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);
  const reads = [
    security.requireSession,
    security.requireOrganization('organization:read'),
  ];
  const mutations = [...reads, security.requireCsrf];
  const basePath = '/v1/organizations/:organizationId/workspace';

  typed.get(
    `${basePath}/my-work`,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        querystring: Type.Object({
          cursor: Type.Optional(Type.String({ maxLength: 1000 })),
          limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
          section: Type.Optional(WorkSection),
        }),
        response: {
          200: Type.Object({
            items: Type.Array(WorkItem),
            nextCursor: Type.Union([Type.String(), Type.Null()]),
          }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      try {
        const page = await runtime.workspaceStore.listWork({
          actor: actor(request),
          page: {
            cursor: request.query.cursor,
            limit: request.query.limit ?? 50,
          },
          section: request.query.section ?? null,
        });
        return {
          items: page.items.map((item) => ({
            ...item,
            updatedAt: item.updatedAt.toISOString(),
          })),
          nextCursor: page.nextCursor,
        };
      } catch (error) {
        return sendWorkspaceError(reply, error);
      }
    },
  );

  typed.get(
    `${basePath}/search`,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ maximum: 25, minimum: 1 })),
          q: Type.String({ maxLength: 160, minLength: 1 }),
        }),
        response: {
          200: Type.Object({ items: Type.Array(SearchResult) }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      try {
        const items = await runtime.workspaceStore.search({
          actor: actor(request),
          limit: request.query.limit ?? 12,
          query: request.query.q,
        });
        return {
          items: items.map((item) => ({
            ...item,
            updatedAt: item.updatedAt.toISOString(),
          })),
        };
      } catch (error) {
        return sendWorkspaceError(reply, error);
      }
    },
  );

  typed.get(
    `${basePath}/recents`,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ maximum: 25, minimum: 1 })),
        }),
        response: {
          200: Type.Object({ items: Type.Array(RecentDocument) }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      try {
        const items = await runtime.workspaceStore.listRecents({
          actor: actor(request),
          limit: request.query.limit ?? 10,
        });
        return {
          items: items.map((item) => ({
            ...item,
            openedAt: item.openedAt.toISOString(),
          })),
        };
      } catch (error) {
        return sendWorkspaceError(reply, error);
      }
    },
  );

  typed.put(
    `${basePath}/recents`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({ documentId: Id, projectId: Id }),
        headers: MutationHeaders,
        params: OrganizationParams,
        response: { 204: Type.Null(), ...Errors },
      },
    },
    async (request, reply) => {
      try {
        await runtime.workspaceStore.recordRecent({
          actor: actor(request),
          documentId: request.body.documentId,
          projectId: request.body.projectId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendWorkspaceError(reply, error);
      }
    },
  );
}
