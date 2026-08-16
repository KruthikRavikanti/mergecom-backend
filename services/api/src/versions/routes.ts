import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityRuntime } from '../identity/auth-routes';
import {
  createSecurityHandlers,
  sendApiError,
} from '../identity/http-security';
import type { ProjectActor } from '../projects/types';
import { VersionOperationError } from './store';
import { VersionService } from './service';
import type { DocumentVersionSummary } from './types';
import { UploadValidationError } from './validation';

const Id = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const MutationHeaders = Type.Object({
  'x-csrf-token': Type.String({ minLength: 20 }),
});
const IdempotentHeaders = Type.Object({
  'idempotency-key': Type.String({ maxLength: 128, minLength: 8 }),
  'x-csrf-token': Type.String({ minLength: 20 }),
});
const DocumentParams = Type.Object({
  documentId: Id,
  organizationId: Id,
  projectId: Id,
});
const UploadParams = Type.Intersect([
  DocumentParams,
  Type.Object({ uploadId: Id }),
]);
const VersionParams = Type.Intersect([
  DocumentParams,
  Type.Object({ versionId: Id }),
]);
const VersionStatus = Type.Union([
  Type.Literal('pending_processing'),
  Type.Literal('ready'),
  Type.Literal('conflicted'),
  Type.Literal('quarantined'),
  Type.Literal('failed'),
]);
const Artifact = Type.Object({
  byteSize: Type.Integer({ minimum: 1 }),
  detectedMediaType: Type.String(),
  extension: Type.String(),
  id: Id,
  originalFilename: Type.String(),
  scanStatus: Type.Union([
    Type.Literal('pending'),
    Type.Literal('clean'),
    Type.Literal('quarantined'),
    Type.Literal('failed'),
  ]),
  sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  storageChecksum: Type.Union([Type.String(), Type.Null()]),
  storageVersion: Type.Union([Type.String(), Type.Null()]),
});
const Version = Type.Object({
  artifact: Artifact,
  author: Type.Object({ id: Id, name: Type.String() }),
  baseVersionId: Type.Union([Id, Type.Null()]),
  branchId: Id,
  conflictReason: Type.Union([Type.String(), Type.Null()]),
  createdAt: DateTime,
  displayNumber: Type.Integer({ minimum: 1 }),
  documentId: Id,
  id: Id,
  mergeParentVersionId: Type.Union([Id, Type.Null()]),
  note: Type.String(),
  parentVersionId: Type.Union([Id, Type.Null()]),
  sequence: Type.Integer({ minimum: 1 }),
  source: Type.Union([
    Type.Literal('web_upload'),
    Type.Literal('office_addin'),
    Type.Literal('restore'),
    Type.Literal('merge'),
    Type.Literal('import'),
  ]),
  status: VersionStatus,
});
const Branch = Type.Object({
  headVersionId: Type.Union([Id, Type.Null()]),
  id: Id,
  name: Type.String(),
});
const Grant = Type.Object({
  expiresAt: DateTime,
  headers: Type.Record(Type.String(), Type.String()),
  method: Type.Union([Type.Literal('GET'), Type.Literal('PUT')]),
  url: Type.String({ format: 'uri' }),
});
const UploadIntent = Type.Object({
  branch: Branch,
  expiresAt: DateTime,
  grant: Type.Union([Grant, Type.Null()]),
  id: Id,
  mode: Type.Union([Type.Literal('single'), Type.Literal('multipart')]),
  multipart: Type.Union([
    Type.Object({
      partCount: Type.Integer({ minimum: 1 }),
      partSize: Type.Integer({ minimum: 1 }),
    }),
    Type.Null(),
  ]),
});
const FinalizeResponse = Type.Object({
  currentHeadVersionId: Type.Union([Id, Type.Null()]),
  outcome: Type.Union([Type.Literal('created'), Type.Literal('conflict')]),
  replayed: Type.Boolean(),
  version: Version,
});
const Errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
  413: ErrorResponse,
  503: ErrorResponse,
};

interface VersionRuntime extends IdentityRuntime {
  versionService: VersionService;
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

function serializeVersion(version: DocumentVersionSummary) {
  return { ...version, createdAt: version.createdAt.toISOString() };
}

async function sendVersionError(
  reply: FastifyReply,
  error: unknown,
  runtime: VersionRuntime,
  audit: {
    action: string;
    actor: ProjectActor;
    requestId: string;
    targetId?: string;
    targetType: string;
  },
) {
  if (error instanceof UploadValidationError) {
    const status = error.code === 'upload_too_large' ? 413 : 400;
    return sendApiError(
      reply,
      status,
      error.code,
      error.code === 'invalid_hash'
        ? 'The uploaded bytes do not match the expected SHA-256.'
        : 'The file is not a valid compatible Office package.',
    );
  }
  if (!(error instanceof VersionOperationError)) {
    reply.log.error({ error }, 'Artifact operation failed.');
    return sendApiError(
      reply,
      503,
      'artifact_service_unavailable',
      'Artifact storage is temporarily unavailable.',
    );
  }
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
    case 'quota_exceeded':
      return sendApiError(
        reply,
        413,
        'quota_exceeded',
        'The workspace storage quota would be exceeded.',
      );
    case 'upload_expired':
      return sendApiError(
        reply,
        409,
        'upload_expired',
        'The upload intent has expired.',
      );
    case 'invalid_base':
      return sendApiError(
        reply,
        409,
        'invalid_base',
        'The base version is not valid for this branch.',
      );
    case 'stale_head':
      return sendApiError(
        reply,
        409,
        'stale_head',
        'The branch head changed before the restore completed.',
      );
    case 'idempotency_conflict':
      return sendApiError(
        reply,
        409,
        'idempotency_conflict',
        'The idempotency key was already used for different input.',
      );
    case 'invalid_state':
      return sendApiError(
        reply,
        409,
        'invalid_upload_state',
        'The upload is not in the required state.',
      );
  }
}

export function registerVersionRoutes(
  app: FastifyInstance,
  runtime: VersionRuntime,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);
  const reads = [
    security.requireSession,
    security.requireOrganization('organization:read'),
  ];
  const mutations = [
    security.requireSession,
    security.requireCsrf,
    security.requireOrganization('organization:read'),
  ];
  const basePath =
    '/v1/organizations/:organizationId/projects/:projectId/documents/:documentId';

  typed.post(
    `${basePath}/uploads`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          baseVersionId: Type.Union([Id, Type.Null()]),
          byteSize: Type.Integer({ minimum: 1 }),
          clientMediaType: Type.Optional(
            Type.Union([Type.String(), Type.Null()]),
          ),
          filename: Type.String({ maxLength: 255, minLength: 1 }),
          sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
        }),
        headers: IdempotentHeaders,
        params: DocumentParams,
        response: { 200: UploadIntent, 201: UploadIntent, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const { replayed, ...intent } =
          await runtime.versionService.createUploadIntent({
            actor: currentActor,
            baseVersionId: request.body.baseVersionId,
            byteSize: request.body.byteSize,
            clientMediaType: request.body.clientMediaType ?? null,
            documentId: request.params.documentId,
            filename: request.body.filename,
            idempotencyKey: request.headers['idempotency-key'],
            projectId: request.params.projectId,
            requestId: request.id,
            sha256: request.body.sha256,
          });
        return reply.code(replayed ? 200 : 201).send({
          ...intent,
          expiresAt: intent.expiresAt.toISOString(),
          grant: intent.grant
            ? {
                ...intent.grant,
                expiresAt: intent.grant.expiresAt.toISOString(),
              }
            : null,
        });
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'upload.intent_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.post(
    `${basePath}/uploads/:uploadId/parts/:partNumber/grant`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: Type.Intersect([
          UploadParams,
          Type.Object({ partNumber: Type.Integer({ minimum: 1 }) }),
        ]),
        response: { 200: Grant, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const grant = await runtime.versionService.signMultipartPart({
          actor: currentActor,
          documentId: request.params.documentId,
          partNumber: request.params.partNumber,
          projectId: request.params.projectId,
          uploadId: request.params.uploadId,
        });
        return { ...grant, expiresAt: grant.expiresAt.toISOString() };
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'upload.part_grant_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.uploadId,
          targetType: 'staged_upload',
        });
      }
    },
  );

  typed.post(
    `${basePath}/uploads/:uploadId/multipart/complete`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          parts: Type.Array(
            Type.Object({
              etag: Type.String({ minLength: 1 }),
              partNumber: Type.Integer({ minimum: 1 }),
            }),
            { minItems: 1 },
          ),
        }),
        headers: MutationHeaders,
        params: UploadParams,
        response: { 204: Type.Null(), ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.versionService.completeMultipart({
          actor: currentActor,
          documentId: request.params.documentId,
          parts: request.body.parts,
          projectId: request.params.projectId,
          uploadId: request.params.uploadId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'upload.multipart_complete_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.uploadId,
          targetType: 'staged_upload',
        });
      }
    },
  );

  typed.delete(
    `${basePath}/uploads/:uploadId`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: UploadParams,
        response: { 204: Type.Null(), ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.versionService.cancelUpload({
          actor: currentActor,
          documentId: request.params.documentId,
          projectId: request.params.projectId,
          requestId: request.id,
          uploadId: request.params.uploadId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'upload.cancel_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.uploadId,
          targetType: 'staged_upload',
        });
      }
    },
  );

  typed.post(
    `${basePath}/uploads/:uploadId/finalize`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          note: Type.String({ maxLength: 500, minLength: 1 }),
          source: Type.Optional(
            Type.Union([
              Type.Literal('web_upload'),
              Type.Literal('office_addin'),
            ]),
          ),
        }),
        headers: IdempotentHeaders,
        params: UploadParams,
        response: {
          200: FinalizeResponse,
          201: FinalizeResponse,
          409: Type.Union([FinalizeResponse, ErrorResponse]),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          413: ErrorResponse,
          503: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.versionService.finalizeUpload({
          actor: currentActor,
          documentId: request.params.documentId,
          idempotencyKey: request.headers['idempotency-key'],
          note: request.body.note.trim(),
          projectId: request.params.projectId,
          requestId: request.id,
          source: request.body.source ?? 'web_upload',
          uploadId: request.params.uploadId,
        });
        return reply
          .code(
            result.outcome === 'conflict' ? 409 : result.replayed ? 200 : 201,
          )
          .send({ ...result, version: serializeVersion(result.version) });
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'upload.finalize_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.uploadId,
          targetType: 'staged_upload',
        });
      }
    },
  );

  typed.get(
    `${basePath}/versions`,
    {
      preHandler: reads,
      schema: {
        params: DocumentParams,
        querystring: Type.Object({
          cursor: Type.Optional(Type.String({ maxLength: 1000 })),
          limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
        }),
        response: {
          200: Type.Object({
            branch: Branch,
            items: Type.Array(Version),
            nextCursor: Type.Union([Type.String(), Type.Null()]),
          }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const page = await runtime.versionService.listVersions({
          actor: currentActor,
          documentId: request.params.documentId,
          page: {
            cursor: request.query.cursor,
            limit: request.query.limit ?? 50,
          },
          projectId: request.params.projectId,
        });
        return {
          ...page,
          items: page.items.map(serializeVersion),
        };
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'version.list_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.get(
    `${basePath}/versions/:versionId`,
    {
      preHandler: reads,
      schema: { params: VersionParams, response: { 200: Version, ...Errors } },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeVersion(
          await runtime.versionService.getVersion({
            actor: currentActor,
            documentId: request.params.documentId,
            projectId: request.params.projectId,
            versionId: request.params.versionId,
          }),
        );
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'version.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );

  typed.post(
    `${basePath}/versions/:versionId/download`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: VersionParams,
        response: {
          200: Type.Intersect([
            Grant,
            Type.Object({ filename: Type.String(), sha256: Type.String() }),
          ]),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const grant = await runtime.versionService.createDownloadGrant({
          actor: currentActor,
          documentId: request.params.documentId,
          projectId: request.params.projectId,
          requestId: request.id,
          versionId: request.params.versionId,
        });
        return { ...grant, expiresAt: grant.expiresAt.toISOString() };
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'version.download_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );

  typed.post(
    `${basePath}/versions/:versionId/restore`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          expectedHeadVersionId: Id,
          note: Type.String({ maxLength: 500, minLength: 1 }),
        }),
        headers: IdempotentHeaders,
        params: VersionParams,
        response: { 200: Version, 201: Version, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.versionService.restoreVersion({
          actor: currentActor,
          documentId: request.params.documentId,
          expectedHeadVersionId: request.body.expectedHeadVersionId,
          idempotencyKey: request.headers['idempotency-key'],
          note: request.body.note.trim(),
          projectId: request.params.projectId,
          requestId: request.id,
          versionId: request.params.versionId,
        });
        return reply
          .code(result.replayed ? 200 : 201)
          .send(serializeVersion(result.version));
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'version.restore_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );
}
