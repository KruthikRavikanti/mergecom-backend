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
import type {
  DocumentMerge,
  DocumentVersionSummary,
  VersionComparison,
  VersionRendition,
} from './types';
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
const ComparisonParams = Type.Intersect([
  DocumentParams,
  Type.Object({ comparisonId: Id }),
]);
const RenditionParams = Type.Intersect([
  VersionParams,
  Type.Object({ renditionId: Id }),
]);
const MergeParams = Type.Intersect([
  DocumentParams,
  Type.Object({ mergeId: Id }),
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
const ProcessingWarning = Type.Object({
  code: Type.String(),
  message: Type.String(),
  part: Type.Union([Type.String(), Type.Null()]),
  severity: Type.Union([Type.Literal('info'), Type.Literal('warning')]),
});
const SnapshotSummary = Type.Object({
  package: Type.Record(
    Type.String(),
    Type.Union([Type.Boolean(), Type.Number()]),
  ),
  parserVersion: Type.String(),
  schemaVersion: Type.String(),
  stableHash: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  unsupportedFeatures: Type.Array(Type.String()),
  validationErrorCount: Type.Integer({ minimum: 0 }),
  warnings: Type.Array(ProcessingWarning),
});
const Processing = Type.Object({
  attempts: Type.Integer({ minimum: 0 }),
  failureCode: Type.Union([Type.String(), Type.Null()]),
  maxAttempts: Type.Integer({ minimum: 1 }),
  nextAttemptAt: Type.Union([DateTime, Type.Null()]),
  snapshot: Type.Union([SnapshotSummary, Type.Null()]),
  state: Type.Union([
    Type.Literal('queued'),
    Type.Literal('running'),
    Type.Literal('retryable_failed'),
    Type.Literal('permanently_failed'),
    Type.Literal('quarantined'),
    Type.Literal('completed'),
  ]),
  supportTraceId: Id,
  updatedAt: DateTime,
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
  processing: Processing,
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
const ComparisonChange = Type.Object({
  after: Type.Union([Type.String(), Type.Null()]),
  before: Type.Union([Type.String(), Type.Null()]),
  category: Type.Union([
    Type.Literal('content'),
    Type.Literal('feature'),
    Type.Literal('structure'),
    Type.Literal('validation'),
  ]),
  changeType: Type.Union([
    Type.Literal('added'),
    Type.Literal('modified'),
    Type.Literal('moved'),
    Type.Literal('removed'),
  ]),
  entityType: Type.String(),
  id: Type.String(),
  impact: Type.Union([
    Type.Literal('high'),
    Type.Literal('low'),
    Type.Literal('medium'),
  ]),
  label: Type.String(),
  path: Type.String(),
});
const ComparisonVersionReference = Type.Object({
  artifactSha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  authorName: Type.String(),
  createdAt: DateTime,
  displayNumber: Type.Integer({ minimum: 1 }),
  id: Id,
  note: Type.String(),
});
const Comparison = Type.Object({
  attempts: Type.Integer({ minimum: 0 }),
  baseVersion: ComparisonVersionReference,
  byteEqual: Type.Union([Type.Boolean(), Type.Null()]),
  changes: Type.Array(ComparisonChange),
  comparisonSchemaVersion: Type.String(),
  completeness: Type.Union([
    Type.Literal('complete'),
    Type.Literal('partial'),
    Type.Null(),
  ]),
  createdAt: DateTime,
  engineVersion: Type.String(),
  failureCode: Type.Union([Type.String(), Type.Null()]),
  id: Id,
  maxAttempts: Type.Integer({ minimum: 1 }),
  nextAttemptAt: Type.Union([DateTime, Type.Null()]),
  parserVersion: Type.String(),
  semanticEqual: Type.Union([Type.Boolean(), Type.Null()]),
  stableHash: Type.Union([
    Type.String({ pattern: '^[0-9a-f]{64}$' }),
    Type.Null(),
  ]),
  state: Type.Union([
    Type.Literal('queued'),
    Type.Literal('running'),
    Type.Literal('retryable_failed'),
    Type.Literal('permanently_failed'),
    Type.Literal('quarantined'),
    Type.Literal('completed'),
  ]),
  summary: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
  supportTraceId: Id,
  targetVersion: ComparisonVersionReference,
  updatedAt: DateTime,
  warnings: Type.Array(Type.String()),
});
const BaselineRecommendation = Type.Object({
  baseline: Type.Union([
    Type.Object({
      author: Type.Object({ id: Id, name: Type.String() }),
      createdAt: DateTime,
      displayNumber: Type.Integer({ minimum: 1 }),
      id: Id,
      parentVersionId: Type.Union([Id, Type.Null()]),
      processingState: Processing.properties.state,
      sequence: Type.Integer({ minimum: 1 }),
      status: VersionStatus,
    }),
    Type.Null(),
  ]),
  reason: Type.Union([
    Type.Literal('approved_version'),
    Type.Literal('verified_local_base'),
    Type.Literal('previous_head'),
    Type.Literal('none'),
  ]),
});
const Rendition = Type.Object({
  attempts: Type.Integer({ minimum: 0 }),
  byteCount: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  completedAt: Type.Union([DateTime, Type.Null()]),
  createdAt: DateTime,
  dimensions: Type.Array(
    Type.Object({
      height: Type.Number({ exclusiveMinimum: 0 }),
      width: Type.Number({ exclusiveMinimum: 0 }),
    }),
  ),
  failureCode: Type.Union([Type.String(), Type.Null()]),
  fontPackVersion: Type.String(),
  id: Id,
  maxAttempts: Type.Integer({ minimum: 1 }),
  nextAttemptAt: Type.Union([DateTime, Type.Null()]),
  pageCount: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
  rendererProfile: Type.String(),
  rendererVersion: Type.String(),
  renditionSha256: Type.Union([
    Type.String({ pattern: '^[0-9a-f]{64}$' }),
    Type.Null(),
  ]),
  sourceSha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  state: Processing.properties.state,
  supportTraceId: Id,
  updatedAt: DateTime,
  versionId: Id,
  warnings: Type.Array(Type.String()),
});
const VisualLocator = Type.Object({
  boundingBox: Type.Optional(
    Type.Object({
      height: Type.Number({ minimum: 0, maximum: 1 }),
      width: Type.Number({ minimum: 0, maximum: 1 }),
      x: Type.Number({ minimum: 0, maximum: 1 }),
      y: Type.Number({ minimum: 0, maximum: 1 }),
    }),
  ),
  cell: Type.Optional(Type.String()),
  confidence: Type.Union([
    Type.Literal('approximate'),
    Type.Literal('exact'),
    Type.Literal('unavailable'),
  ]),
  kind: Type.Union([
    Type.Literal('page'),
    Type.Literal('paragraph'),
    Type.Literal('sheet_cell'),
    Type.Literal('slide'),
    Type.Literal('table_cell'),
  ]),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  semanticPath: Type.Optional(Type.String()),
  sheetId: Type.Optional(Type.String()),
  side: Type.Union([Type.Literal('base'), Type.Literal('target')]),
  slideId: Type.Optional(Type.String()),
});
const Visualization = Type.Object({
  comparisonId: Id,
  coverage: Type.Object({
    approximate: Type.Integer({ minimum: 0 }),
    exact: Type.Integer({ minimum: 0 }),
    mapped: Type.Integer({ minimum: 0 }),
    total: Type.Integer({ minimum: 0 }),
    unavailable: Type.Integer({ minimum: 0 }),
  }),
  engineVersion: Type.String(),
  mappings: Type.Array(
    Type.Object({
      changeId: Type.String(),
      confidence: VisualLocator.properties.confidence,
      locators: Type.Array(VisualLocator),
      reason: Type.Union([Type.String(), Type.Null()]),
    }),
  ),
  rendererProfile: Type.String(),
  schemaVersion: Type.String(),
});
const VisualData = Type.Object({
  fileType: Type.Union([
    Type.Literal('presentation'),
    Type.Literal('spreadsheet'),
    Type.Literal('word_document'),
  ]),
  parserVersion: Type.String(),
  payload: Type.Unknown(),
  schemaVersion: Type.String(),
  unsupportedFeatures: Type.Array(Type.String()),
  versionId: Id,
  warnings: Type.Array(ProcessingWarning),
});
const MergeVersionReference = Type.Intersect([
  ComparisonVersionReference,
  Type.Object({ status: VersionStatus }),
]);
const MergeAnalysisClassification = Type.Union([
  Type.Literal('ambiguous'),
  Type.Literal('compatible_overlap'),
  Type.Literal('non_overlapping'),
  Type.Literal('true_conflict'),
  Type.Literal('unsupported'),
]);
const MergeAnalysis = Type.Object({
  automaticMergeEligible: Type.Boolean(),
  automaticMergeEnabled: Type.Boolean(),
  blockers: Type.Array(
    Type.Object({
      category: Type.String(),
      code: Type.String(),
      explanation: Type.String(),
      path: Type.Union([Type.String(), Type.Null()]),
    }),
  ),
  items: Type.Array(
    Type.Object({
      automaticallyResolved: Type.Boolean(),
      category: Type.String(),
      classification: MergeAnalysisClassification,
      confidence: Type.Union([
        Type.Literal('high'),
        Type.Literal('low'),
        Type.Literal('medium'),
      ]),
      explanation: Type.String(),
      id: Type.String({ pattern: '^[0-9a-f]{64}$' }),
      label: Type.String(),
      oursChange: Type.Union([Type.String(), Type.Null()]),
      path: Type.String(),
      theirsChange: Type.Union([Type.String(), Type.Null()]),
    }),
  ),
  schemaVersion: Type.String(),
  summary: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
});
const Merge = Type.Object({
  analysis: Type.Union([MergeAnalysis, Type.Null()]),
  appliedPaths: Type.Array(Type.String()),
  attempts: Type.Integer({ minimum: 0 }),
  baseVersion: MergeVersionReference,
  branchId: Id,
  candidate: Type.Union([
    Type.Object({
      byteSize: Type.Integer({ minimum: 1 }),
      sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
    }),
    Type.Null(),
  ]),
  createdAt: DateTime,
  engineVersion: Type.String(),
  failureCode: Type.Union([Type.String(), Type.Null()]),
  id: Id,
  maxAttempts: Type.Integer({ minimum: 1 }),
  mergeSchemaVersion: Type.String(),
  nextAttemptAt: Type.Union([DateTime, Type.Null()]),
  note: Type.String(),
  oursVersion: MergeVersionReference,
  parserVersion: Type.String(),
  resultVersionId: Type.Union([Id, Type.Null()]),
  stableHash: Type.Union([
    Type.String({ pattern: '^[0-9a-f]{64}$' }),
    Type.Null(),
  ]),
  state: Type.Union([
    Type.Literal('queued'),
    Type.Literal('running'),
    Type.Literal('retryable_failed'),
    Type.Literal('permanently_failed'),
    Type.Literal('manual_resolution_required'),
    Type.Literal('completed'),
  ]),
  strategy: Type.Union([Type.String(), Type.Null()]),
  supportTraceId: Id,
  theirsVersion: MergeVersionReference,
  updatedAt: DateTime,
  warnings: Type.Array(Type.String()),
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
  return {
    ...version,
    createdAt: version.createdAt.toISOString(),
    processing: {
      ...version.processing,
      nextAttemptAt: version.processing.nextAttemptAt?.toISOString() ?? null,
      updatedAt: version.processing.updatedAt.toISOString(),
    },
  };
}

function serializeComparison(comparison: VersionComparison) {
  return {
    ...comparison,
    baseVersion: {
      ...comparison.baseVersion,
      createdAt: comparison.baseVersion.createdAt.toISOString(),
    },
    createdAt: comparison.createdAt.toISOString(),
    nextAttemptAt: comparison.nextAttemptAt?.toISOString() ?? null,
    targetVersion: {
      ...comparison.targetVersion,
      createdAt: comparison.targetVersion.createdAt.toISOString(),
    },
    updatedAt: comparison.updatedAt.toISOString(),
  };
}

function serializeRendition(rendition: VersionRendition) {
  return {
    ...rendition,
    completedAt: rendition.completedAt?.toISOString() ?? null,
    createdAt: rendition.createdAt.toISOString(),
    nextAttemptAt: rendition.nextAttemptAt?.toISOString() ?? null,
    updatedAt: rendition.updatedAt.toISOString(),
  };
}

function serializeMerge(merge: DocumentMerge) {
  return {
    ...merge,
    baseVersion: {
      ...merge.baseVersion,
      createdAt: merge.baseVersion.createdAt.toISOString(),
    },
    createdAt: merge.createdAt.toISOString(),
    nextAttemptAt: merge.nextAttemptAt?.toISOString() ?? null,
    oursVersion: {
      ...merge.oursVersion,
      createdAt: merge.oursVersion.createdAt.toISOString(),
    },
    theirsVersion: {
      ...merge.theirsVersion,
      createdAt: merge.theirsVersion.createdAt.toISOString(),
    },
    updatedAt: merge.updatedAt.toISOString(),
  };
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
    case 'comparison_unavailable':
      return sendApiError(
        reply,
        409,
        'comparison_unavailable',
        'Both versions must be fully processed, clean, and belong to this document.',
      );
    case 'rendition_unavailable':
      return sendApiError(
        reply,
        409,
        'rendition_unavailable',
        'The visual rendition is not available for this version.',
      );
    case 'merge_unavailable':
      return sendApiError(
        reply,
        409,
        'merge_unavailable',
        'Merge inputs must be clean processed versions with a common base, and ours must still be the branch head.',
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
    `${basePath}/versions/:versionId/renditions`,
    {
      preHandler: mutations,
      schema: {
        headers: IdempotentHeaders,
        params: VersionParams,
        response: { 200: Rendition, 201: Rendition, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.versionService.createRendition({
          actor: currentActor,
          documentId: request.params.documentId,
          idempotencyKey: request.headers['idempotency-key'],
          projectId: request.params.projectId,
          requestId: request.id,
          versionId: request.params.versionId,
        });
        return reply
          .code(result.replayed ? 200 : 201)
          .send(serializeRendition(result.rendition));
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'rendition.request_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );

  typed.get(
    `${basePath}/versions/:versionId/rendition`,
    {
      preHandler: reads,
      schema: {
        params: VersionParams,
        response: { 200: Rendition, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeRendition(
          await runtime.versionService.getRendition({
            actor: currentActor,
            documentId: request.params.documentId,
            projectId: request.params.projectId,
            versionId: request.params.versionId,
          }),
        );
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'rendition.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );

  typed.post(
    `${basePath}/versions/:versionId/renditions/:renditionId/grant`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: RenditionParams,
        response: {
          200: Type.Intersect([
            Grant,
            Type.Object({
              byteCount: Type.Union([
                Type.Integer({ minimum: 1 }),
                Type.Null(),
              ]),
              pageCount: Type.Union([
                Type.Integer({ minimum: 1 }),
                Type.Null(),
              ]),
              sha256: Type.Union([
                Type.String({ pattern: '^[0-9a-f]{64}$' }),
                Type.Null(),
              ]),
            }),
          ]),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const grant = await runtime.versionService.createRenditionViewGrant({
          actor: currentActor,
          documentId: request.params.documentId,
          projectId: request.params.projectId,
          renditionId: request.params.renditionId,
          requestId: request.id,
          versionId: request.params.versionId,
        });
        return { ...grant, expiresAt: grant.expiresAt.toISOString() };
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'rendition.view_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.renditionId,
          targetType: 'version_rendition',
        });
      }
    },
  );

  typed.get(
    `${basePath}/versions/:versionId/visual-data`,
    {
      preHandler: reads,
      schema: {
        params: VersionParams,
        response: { 200: VisualData, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return await runtime.versionService.getVisualData({
          actor: currentActor,
          documentId: request.params.documentId,
          projectId: request.params.projectId,
          versionId: request.params.versionId,
        });
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'visual_data.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );

  typed.get(
    `${basePath}/versions/:versionId/baseline-recommendation`,
    {
      preHandler: reads,
      schema: {
        params: VersionParams,
        querystring: Type.Object({
          verifiedBaseVersionId: Type.Optional(Id),
        }),
        response: { 200: BaselineRecommendation, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const recommendation = await runtime.versionService.recommendBaseline({
          actor: currentActor,
          documentId: request.params.documentId,
          projectId: request.params.projectId,
          targetVersionId: request.params.versionId,
          verifiedLocalBaseVersionId:
            request.query.verifiedBaseVersionId ?? null,
        });
        return {
          ...recommendation,
          baseline: recommendation.baseline
            ? {
                ...recommendation.baseline,
                createdAt: recommendation.baseline.createdAt.toISOString(),
              }
            : null,
        };
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'comparison.baseline_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.versionId,
          targetType: 'document_version',
        });
      }
    },
  );

  typed.post(
    `${basePath}/comparisons`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          baseVersionId: Id,
          targetVersionId: Id,
        }),
        headers: IdempotentHeaders,
        params: DocumentParams,
        response: { 200: Comparison, 201: Comparison, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.versionService.createComparison({
          actor: currentActor,
          baseVersionId: request.body.baseVersionId,
          documentId: request.params.documentId,
          idempotencyKey: request.headers['idempotency-key'],
          projectId: request.params.projectId,
          requestId: request.id,
          targetVersionId: request.body.targetVersionId,
        });
        return reply
          .code(result.replayed ? 200 : 201)
          .send(serializeComparison(result.comparison));
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'comparison.request_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.get(
    `${basePath}/comparisons/:comparisonId`,
    {
      preHandler: reads,
      schema: {
        params: ComparisonParams,
        response: { 200: Comparison, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeComparison(
          await runtime.versionService.getComparison({
            actor: currentActor,
            comparisonId: request.params.comparisonId,
            documentId: request.params.documentId,
            projectId: request.params.projectId,
          }),
        );
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'comparison.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.comparisonId,
          targetType: 'version_comparison',
        });
      }
    },
  );

  typed.get(
    `${basePath}/comparisons/:comparisonId/visualization`,
    {
      preHandler: reads,
      schema: {
        params: ComparisonParams,
        response: { 200: Visualization, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return await runtime.versionService.getVisualization({
          actor: currentActor,
          comparisonId: request.params.comparisonId,
          documentId: request.params.documentId,
          projectId: request.params.projectId,
        });
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'comparison.visualization_read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.comparisonId,
          targetType: 'version_comparison',
        });
      }
    },
  );

  typed.post(
    `${basePath}/comparisons/:comparisonId/viewer-events`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object(
          {
            durationMilliseconds: Type.Number({ maximum: 300_000, minimum: 0 }),
            outcome: Type.Union([
              Type.Literal('failed'),
              Type.Literal('loaded'),
            ]),
          },
          { additionalProperties: false },
        ),
        headers: MutationHeaders,
        params: ComparisonParams,
        response: { 204: Type.Null(), ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        await runtime.versionService.recordViewerLoad({
          actor: currentActor,
          comparisonId: request.params.comparisonId,
          documentId: request.params.documentId,
          durationMilliseconds: request.body.durationMilliseconds,
          outcome: request.body.outcome,
          projectId: request.params.projectId,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'visual_viewer_event_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.comparisonId,
          targetType: 'version_comparison',
        });
      }
    },
  );

  typed.post(
    `${basePath}/merges`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          baseVersionId: Id,
          note: Type.String({ maxLength: 500, minLength: 1 }),
          oursVersionId: Id,
          theirsVersionId: Id,
        }),
        headers: IdempotentHeaders,
        params: DocumentParams,
        response: { 200: Merge, 201: Merge, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.versionService.createMerge({
          actor: currentActor,
          baseVersionId: request.body.baseVersionId,
          documentId: request.params.documentId,
          idempotencyKey: request.headers['idempotency-key'],
          note: request.body.note.trim(),
          oursVersionId: request.body.oursVersionId,
          projectId: request.params.projectId,
          requestId: request.id,
          theirsVersionId: request.body.theirsVersionId,
        });
        return reply
          .code(result.replayed ? 200 : 201)
          .send(serializeMerge(result.merge));
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'merge.request_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.get(
    `${basePath}/merges/:mergeId`,
    {
      preHandler: reads,
      schema: { params: MergeParams, response: { 200: Merge, ...Errors } },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeMerge(
          await runtime.versionService.getMerge({
            actor: currentActor,
            documentId: request.params.documentId,
            mergeId: request.params.mergeId,
            projectId: request.params.projectId,
          }),
        );
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'merge.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.mergeId,
          targetType: 'merge_operation',
        });
      }
    },
  );

  typed.post(
    `${basePath}/merges/:mergeId/candidate/download`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: MergeParams,
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
        const grant =
          await runtime.versionService.createMergeCandidateDownloadGrant({
            actor: currentActor,
            documentId: request.params.documentId,
            mergeId: request.params.mergeId,
            projectId: request.params.projectId,
            requestId: request.id,
          });
        return { ...grant, expiresAt: grant.expiresAt.toISOString() };
      } catch (error) {
        return sendVersionError(reply, error, runtime, {
          action: 'merge.candidate_download_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.mergeId,
          targetType: 'merge_operation',
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
