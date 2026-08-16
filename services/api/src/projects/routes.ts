import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityRuntime } from '../identity/auth-routes';
import {
  createSecurityHandlers,
  sendApiError,
} from '../identity/http-security';
import { ProjectOperationError, type ProjectStore } from './store';
import type {
  DocumentSummary,
  ProjectActor,
  ProjectFolderSummary,
  ProjectSummary,
  ProjectTeamMember,
} from './types';

const Id = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const ProjectRole = Type.Union([
  Type.Literal('project_lead'),
  Type.Literal('contributor'),
  Type.Literal('reviewer'),
  Type.Literal('viewer'),
]);
const OrganizationRole = Type.Union([
  Type.Literal('owner'),
  Type.Literal('admin'),
  Type.Literal('project_lead'),
  Type.Literal('contributor'),
  Type.Literal('reviewer'),
  Type.Literal('viewer'),
  Type.Literal('external_reviewer'),
]);
const DocumentKind = Type.Union([
  Type.Literal('presentation'),
  Type.Literal('spreadsheet'),
  Type.Literal('word_document'),
]);
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const PageQuery = Type.Object({
  cursor: Type.Optional(Type.String({ maxLength: 1000 })),
  limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
});
const ProjectParams = Type.Object({
  organizationId: Id,
  projectId: Id,
});
const FolderParams = Type.Object({
  folderId: Id,
  organizationId: Id,
  projectId: Id,
});
const DocumentParams = Type.Object({
  documentId: Id,
  organizationId: Id,
  projectId: Id,
});
const ProjectMembershipParams = Type.Object({
  organizationId: Id,
  projectId: Id,
  projectMembershipId: Id,
});
const MutationHeaders = Type.Object({
  'x-csrf-token': Type.String({ minLength: 20 }),
});
const CreateHeaders = Type.Object({
  'idempotency-key': Type.String({ maxLength: 128, minLength: 8 }),
  'x-csrf-token': Type.String({ minLength: 20 }),
});
const Project = Type.Object({
  accessRole: ProjectRole,
  archivedAt: Type.Union([DateTime, Type.Null()]),
  clientName: Type.Union([Type.String(), Type.Null()]),
  createdAt: DateTime,
  createdBy: Type.String(),
  documentCount: Type.Integer(),
  folderCount: Type.Integer(),
  id: Id,
  name: Type.String(),
  updatedAt: DateTime,
});
const Folder = Type.Object({
  id: Id,
  name: Type.String(),
  parentFolderId: Type.Union([Id, Type.Null()]),
  sortOrder: Type.Integer(),
  updatedAt: DateTime,
});
const Document = Type.Object({
  archivedAt: Type.Union([DateTime, Type.Null()]),
  createdAt: DateTime,
  folderId: Type.Union([Id, Type.Null()]),
  id: Id,
  kind: DocumentKind,
  name: Type.String(),
  sortOrder: Type.Integer(),
  updatedAt: DateTime,
});
const TeamMember = Type.Object({
  addedAt: DateTime,
  email: Type.String({ format: 'email' }),
  id: Id,
  name: Type.String(),
  organizationMembershipId: Id,
  organizationRole: OrganizationRole,
  role: ProjectRole,
  userId: Id,
});
const ProjectPage = Type.Object({
  items: Type.Array(Project),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
const FolderPage = Type.Object({
  items: Type.Array(Folder),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
const DocumentPage = Type.Object({
  items: Type.Array(Document),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
const TeamPage = Type.Object({
  items: Type.Array(TeamMember),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
const MutationErrors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
};

interface ProjectRuntime extends IdentityRuntime {
  projectStore: ProjectStore;
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

function serializeProject(project: ProjectSummary) {
  return {
    ...project,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function serializeFolder(folder: ProjectFolderSummary) {
  return { ...folder, updatedAt: folder.updatedAt.toISOString() };
}

function serializeDocument(document: DocumentSummary) {
  return {
    ...document,
    archivedAt: document.archivedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function serializeTeamMember(member: ProjectTeamMember) {
  return { ...member, addedAt: member.addedAt.toISOString() };
}

async function sendProjectError(
  reply: FastifyReply,
  error: unknown,
  runtime: ProjectRuntime,
  audit: {
    action: string;
    actor: ProjectActor;
    requestId: string;
    targetId?: string | null | undefined;
    targetType: string;
  },
) {
  if (!(error instanceof ProjectOperationError)) throw error;
  await runtime.store.appendAuditEvent({
    action: audit.action,
    actorUserId: audit.actor.userId,
    metadata: { reason: error.code },
    organizationId: audit.actor.organizationId,
    requestId: audit.requestId,
    result:
      error.code === 'denied' || error.code === 'not_found'
        ? 'denied'
        : 'failed',
    targetId: audit.targetId,
    targetType: audit.targetType,
  });
  switch (error.code) {
    case 'denied':
      return sendApiError(
        reply,
        403,
        'forbidden',
        'This action is not permitted.',
      );
    case 'not_found':
      return sendApiError(reply, 404, 'not_found', 'Resource not found.');
    case 'invalid_cursor':
      return sendApiError(
        reply,
        400,
        'invalid_cursor',
        'The pagination cursor is invalid.',
      );
    case 'invalid_parent':
      return sendApiError(
        reply,
        409,
        'invalid_parent',
        'The destination folder is invalid.',
      );
    case 'non_empty':
      return sendApiError(
        reply,
        409,
        'folder_not_empty',
        'Remove or move the folder contents first.',
      );
    case 'role_exceeds_organization':
      return sendApiError(
        reply,
        409,
        'role_exceeds_organization',
        'The project role exceeds the organization role.',
      );
    case 'idempotency_conflict':
      return sendApiError(
        reply,
        409,
        'idempotency_conflict',
        'The idempotency key was already used for different input.',
      );
    case 'conflict':
      return sendApiError(
        reply,
        409,
        'conflict',
        'The resource changed or conflicts with an existing name.',
      );
  }
}

function page(query: { cursor?: string; limit?: number }) {
  return { cursor: query.cursor, limit: query.limit ?? 50 };
}

export function registerProjectRoutes(
  app: FastifyInstance,
  runtime: ProjectRuntime,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);
  const readHandlers = [
    security.requireSession,
    security.requireOrganization('organization:read'),
  ];
  const mutationHandlers = [
    security.requireSession,
    security.requireCsrf,
    security.requireOrganization('organization:read'),
  ];

  typed.get(
    '/v1/organizations/:organizationId/projects',
    {
      preHandler: readHandlers,
      schema: {
        params: Type.Object({ organizationId: Id }),
        querystring: Type.Intersect([
          PageQuery,
          Type.Object({ archived: Type.Optional(Type.Boolean()) }),
        ]),
        response: { 200: ProjectPage, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.projectStore.listProjects(
          currentActor,
          request.query.archived ?? false,
          page(request.query),
        );
        return {
          items: result.items.map(serializeProject),
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.list_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.organizationId,
          targetType: 'organization',
        });
      }
    },
  );

  typed.post(
    '/v1/organizations/:organizationId/projects',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({
          clientName: Type.Optional(
            Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
          ),
          name: Type.String({ maxLength: 160, minLength: 1 }),
        }),
        headers: CreateHeaders,
        params: Type.Object({ organizationId: Id }),
        response: { 201: Project, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const project = await runtime.projectStore.createProject({
          actor: currentActor,
          clientName: request.body.clientName ?? null,
          idempotencyKey: request.headers['idempotency-key'],
          name: request.body.name.trim(),
          requestId: request.id,
        });
        return reply.code(201).send(serializeProject(project));
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.create_denied',
          actor: currentActor,
          requestId: request.id,
          targetType: 'project',
        });
      }
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/projects/:projectId',
    {
      preHandler: readHandlers,
      schema: {
        params: ProjectParams,
        response: { 200: Project, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeProject(
          await runtime.projectStore.getProject(
            currentActor,
            request.params.projectId,
          ),
        );
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.patch(
    '/v1/organizations/:organizationId/projects/:projectId',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({
          clientName: Type.Optional(
            Type.Union([Type.String({ maxLength: 160 }), Type.Null()]),
          ),
          expectedUpdatedAt: DateTime,
          name: Type.Optional(Type.String({ maxLength: 160, minLength: 1 })),
        }),
        headers: MutationHeaders,
        params: ProjectParams,
        response: { 200: Project, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeProject(
          await runtime.projectStore.updateProject({
            actor: currentActor,
            clientName: request.body.clientName,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
            name: request.body.name?.trim(),
            projectId: request.params.projectId,
            requestId: request.id,
          }),
        );
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.update_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  for (const [path, archived] of [
    ['archive', true],
    ['restore', false],
  ] as const) {
    typed.post(
      `/v1/organizations/:organizationId/projects/:projectId/${path}`,
      {
        preHandler: mutationHandlers,
        schema: {
          body: Type.Object({ expectedUpdatedAt: DateTime }),
          headers: MutationHeaders,
          params: ProjectParams,
          response: { 200: Project, ...MutationErrors },
        },
      },
      async (request, reply) => {
        const currentActor = actor(request);
        try {
          return serializeProject(
            await runtime.projectStore.archiveProject({
              actor: currentActor,
              archived,
              expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
              projectId: request.params.projectId,
              requestId: request.id,
            }),
          );
        } catch (error) {
          return sendProjectError(reply, error, runtime, {
            action: `project.${path}_denied`,
            actor: currentActor,
            requestId: request.id,
            targetId: request.params.projectId,
            targetType: 'project',
          });
        }
      },
    );
  }

  typed.delete(
    '/v1/organizations/:organizationId/projects/:projectId',
    {
      preHandler: mutationHandlers,
      schema: {
        headers: MutationHeaders,
        params: ProjectParams,
        querystring: Type.Object({ expectedUpdatedAt: DateTime }),
        response: { 204: Type.Null(), ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.projectStore.deleteProject({
          actor: currentActor,
          expectedUpdatedAt: new Date(request.query.expectedUpdatedAt),
          projectId: request.params.projectId,
          requestId: request.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.delete_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/projects/:projectId/folders',
    {
      preHandler: readHandlers,
      schema: {
        params: ProjectParams,
        querystring: Type.Intersect([
          PageQuery,
          Type.Object({ parentFolderId: Type.Optional(Id) }),
        ]),
        response: { 200: FolderPage, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.projectStore.listFolders(
          currentActor,
          request.params.projectId,
          request.query.parentFolderId ?? null,
          page(request.query),
        );
        return {
          items: result.items.map(serializeFolder),
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'folder.list_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.post(
    '/v1/organizations/:organizationId/projects/:projectId/folders',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({
          name: Type.String({ maxLength: 160, minLength: 1 }),
          parentFolderId: Type.Optional(Type.Union([Id, Type.Null()])),
        }),
        headers: CreateHeaders,
        params: ProjectParams,
        response: { 201: Folder, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const folder = await runtime.projectStore.createFolder({
          actor: currentActor,
          idempotencyKey: request.headers['idempotency-key'],
          name: request.body.name.trim(),
          parentFolderId: request.body.parentFolderId ?? null,
          projectId: request.params.projectId,
          requestId: request.id,
        });
        return reply.code(201).send(serializeFolder(folder));
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'folder.create_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/projects/:projectId/folders/:folderId/path',
    {
      preHandler: readHandlers,
      schema: {
        params: FolderParams,
        response: {
          200: Type.Object({
            items: Type.Array(Type.Object({ id: Id, name: Type.String() })),
          }),
          ...MutationErrors,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return {
          items: await runtime.projectStore.getFolderPath(
            currentActor,
            request.params.projectId,
            request.params.folderId,
          ),
        };
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'folder.path_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.folderId,
          targetType: 'folder',
        });
      }
    },
  );

  typed.patch(
    '/v1/organizations/:organizationId/projects/:projectId/folders/:folderId',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({
          expectedUpdatedAt: DateTime,
          name: Type.Optional(Type.String({ maxLength: 160, minLength: 1 })),
          parentFolderId: Type.Optional(Type.Union([Id, Type.Null()])),
          sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
        headers: MutationHeaders,
        params: FolderParams,
        response: { 200: Folder, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeFolder(
          await runtime.projectStore.updateFolder({
            actor: currentActor,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
            folderId: request.params.folderId,
            name: request.body.name?.trim(),
            parentFolderId: request.body.parentFolderId,
            projectId: request.params.projectId,
            requestId: request.id,
            sortOrder: request.body.sortOrder,
          }),
        );
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'folder.update_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.folderId,
          targetType: 'folder',
        });
      }
    },
  );

  typed.delete(
    '/v1/organizations/:organizationId/projects/:projectId/folders/:folderId',
    {
      preHandler: mutationHandlers,
      schema: {
        headers: MutationHeaders,
        params: FolderParams,
        querystring: Type.Object({ expectedUpdatedAt: DateTime }),
        response: { 204: Type.Null(), ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.projectStore.deleteFolder({
          actor: currentActor,
          expectedUpdatedAt: new Date(request.query.expectedUpdatedAt),
          folderId: request.params.folderId,
          projectId: request.params.projectId,
          requestId: request.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'folder.delete_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.folderId,
          targetType: 'folder',
        });
      }
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/projects/:projectId/documents',
    {
      preHandler: readHandlers,
      schema: {
        params: ProjectParams,
        querystring: Type.Intersect([
          PageQuery,
          Type.Object({
            archived: Type.Optional(Type.Boolean()),
            folderId: Type.Optional(Id),
          }),
        ]),
        response: { 200: DocumentPage, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.projectStore.listDocuments(
          currentActor,
          request.params.projectId,
          request.query.folderId ?? null,
          request.query.archived ?? false,
          page(request.query),
        );
        return {
          items: result.items.map(serializeDocument),
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'document.list_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.post(
    '/v1/organizations/:organizationId/projects/:projectId/documents',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({
          folderId: Type.Optional(Type.Union([Id, Type.Null()])),
          kind: DocumentKind,
          name: Type.String({ maxLength: 255, minLength: 1 }),
        }),
        headers: CreateHeaders,
        params: ProjectParams,
        response: { 201: Document, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const document = await runtime.projectStore.createDocument({
          actor: currentActor,
          folderId: request.body.folderId ?? null,
          idempotencyKey: request.headers['idempotency-key'],
          kind: request.body.kind,
          name: request.body.name.trim(),
          projectId: request.params.projectId,
          requestId: request.id,
        });
        return reply.code(201).send(serializeDocument(document));
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'document.create_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/projects/:projectId/documents/:documentId',
    {
      preHandler: readHandlers,
      schema: {
        params: DocumentParams,
        response: { 200: Document, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeDocument(
          await runtime.projectStore.getDocument(
            currentActor,
            request.params.projectId,
            request.params.documentId,
          ),
        );
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'document.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.patch(
    '/v1/organizations/:organizationId/projects/:projectId/documents/:documentId',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({
          expectedUpdatedAt: DateTime,
          folderId: Type.Optional(Type.Union([Id, Type.Null()])),
          name: Type.Optional(Type.String({ maxLength: 255, minLength: 1 })),
          sortOrder: Type.Optional(Type.Integer({ minimum: 0 })),
        }),
        headers: MutationHeaders,
        params: DocumentParams,
        response: { 200: Document, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeDocument(
          await runtime.projectStore.updateDocument({
            actor: currentActor,
            documentId: request.params.documentId,
            expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
            folderId: request.body.folderId,
            name: request.body.name?.trim(),
            projectId: request.params.projectId,
            requestId: request.id,
            sortOrder: request.body.sortOrder,
          }),
        );
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'document.update_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  for (const [path, archived] of [
    ['archive', true],
    ['restore', false],
  ] as const) {
    typed.post(
      `/v1/organizations/:organizationId/projects/:projectId/documents/:documentId/${path}`,
      {
        preHandler: mutationHandlers,
        schema: {
          body: Type.Object({ expectedUpdatedAt: DateTime }),
          headers: MutationHeaders,
          params: DocumentParams,
          response: { 200: Document, ...MutationErrors },
        },
      },
      async (request, reply) => {
        const currentActor = actor(request);
        try {
          return serializeDocument(
            await runtime.projectStore.archiveDocument({
              actor: currentActor,
              archived,
              documentId: request.params.documentId,
              expectedUpdatedAt: new Date(request.body.expectedUpdatedAt),
              projectId: request.params.projectId,
              requestId: request.id,
            }),
          );
        } catch (error) {
          return sendProjectError(reply, error, runtime, {
            action: `document.${path}_denied`,
            actor: currentActor,
            requestId: request.id,
            targetId: request.params.documentId,
            targetType: 'document',
          });
        }
      },
    );
  }

  typed.delete(
    '/v1/organizations/:organizationId/projects/:projectId/documents/:documentId',
    {
      preHandler: mutationHandlers,
      schema: {
        headers: MutationHeaders,
        params: DocumentParams,
        querystring: Type.Object({ expectedUpdatedAt: DateTime }),
        response: { 204: Type.Null(), ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.projectStore.deleteDocument({
          actor: currentActor,
          documentId: request.params.documentId,
          expectedUpdatedAt: new Date(request.query.expectedUpdatedAt),
          projectId: request.params.projectId,
          requestId: request.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'document.delete_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/projects/:projectId/team',
    {
      preHandler: readHandlers,
      schema: {
        params: ProjectParams,
        querystring: PageQuery,
        response: { 200: TeamPage, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.projectStore.listProjectMembers(
          currentActor,
          request.params.projectId,
          page(request.query),
        );
        return {
          items: result.items.map(serializeTeamMember),
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.membership_list_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.post(
    '/v1/organizations/:organizationId/projects/:projectId/team',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({ organizationMembershipId: Id, role: ProjectRole }),
        headers: MutationHeaders,
        params: ProjectParams,
        response: { 201: TeamMember, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const member = await runtime.projectStore.addProjectMember({
          actor: currentActor,
          organizationMembershipId: request.body.organizationMembershipId,
          projectId: request.params.projectId,
          requestId: request.id,
          role: request.body.role,
        });
        return reply.code(201).send(serializeTeamMember(member));
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.membership_add_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectId,
          targetType: 'project',
        });
      }
    },
  );

  typed.patch(
    '/v1/organizations/:organizationId/projects/:projectId/team/:projectMembershipId',
    {
      preHandler: mutationHandlers,
      schema: {
        body: Type.Object({ role: ProjectRole }),
        headers: MutationHeaders,
        params: ProjectMembershipParams,
        response: { 200: TeamMember, ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeTeamMember(
          await runtime.projectStore.changeProjectMemberRole({
            actor: currentActor,
            projectId: request.params.projectId,
            projectMembershipId: request.params.projectMembershipId,
            requestId: request.id,
            role: request.body.role,
          }),
        );
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.membership_role_change_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectMembershipId,
          targetType: 'project_membership',
        });
      }
    },
  );

  typed.delete(
    '/v1/organizations/:organizationId/projects/:projectId/team/:projectMembershipId',
    {
      preHandler: mutationHandlers,
      schema: {
        headers: MutationHeaders,
        params: ProjectMembershipParams,
        response: { 204: Type.Null(), ...MutationErrors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.projectStore.removeProjectMember({
          actor: currentActor,
          projectId: request.params.projectId,
          projectMembershipId: request.params.projectMembershipId,
          requestId: request.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendProjectError(reply, error, runtime, {
          action: 'project.membership_remove_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.projectMembershipId,
          targetType: 'project_membership',
        });
      }
    },
  );
}
