import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityRuntime } from '../identity/auth-routes';
import {
  createSecurityHandlers,
  sendApiError,
} from '../identity/http-security';
import type { ProjectActor } from '../projects/types';
import { ReviewOperationError, type ReviewStore } from './store';
import type { ReviewRequestSummary } from './types';

const Id = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const ProjectRole = Type.Union([
  Type.Literal('project_lead'),
  Type.Literal('contributor'),
  Type.Literal('reviewer'),
  Type.Literal('viewer'),
]);
const ReviewStatus = Type.Union([
  Type.Literal('open'),
  Type.Literal('approved'),
  Type.Literal('changes_requested'),
  Type.Literal('cancelled'),
  Type.Literal('superseded'),
]);
const DecisionValue = Type.Union([
  Type.Literal('approved'),
  Type.Literal('changes_requested'),
]);
const AnchorCategory = Type.Union([
  Type.Literal('content'),
  Type.Literal('feature'),
  Type.Literal('structure'),
  Type.Literal('validation'),
]);
const Person = Type.Object({ id: Id, name: Type.String() });
const VersionReference = Type.Object({
  author: Person,
  createdAt: DateTime,
  displayNumber: Type.Integer({ minimum: 1 }),
  id: Id,
  note: Type.String(),
});
const Decision = Type.Object({
  createdAt: DateTime,
  decision: DecisionValue,
  id: Id,
  note: Type.String(),
});
const Assignment = Type.Object({
  decision: Type.Union([Decision, Type.Null()]),
  projectRole: Type.Union([ProjectRole, Type.Null()]),
  reviewer: Person,
});
const Comment = Type.Object({
  author: Person,
  body: Type.String(),
  createdAt: DateTime,
  id: Id,
});
const Anchor = Type.Object({
  category: AnchorCategory,
  changeId: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  comparisonId: Id,
  label: Type.String({ maxLength: 500, minLength: 1 }),
  path: Type.String({ maxLength: 1000, minLength: 1 }),
});
const Thread = Type.Object({
  anchor: Type.Union([Anchor, Type.Null()]),
  canResolve: Type.Boolean(),
  comments: Type.Array(Comment),
  createdAt: DateTime,
  createdBy: Person,
  id: Id,
  resolvedAt: Type.Union([DateTime, Type.Null()]),
  resolvedBy: Type.Union([Person, Type.Null()]),
  status: Type.Union([Type.Literal('open'), Type.Literal('resolved')]),
  updatedAt: DateTime,
});
const Review = Type.Object({
  approvedVersion: Type.Union([
    Type.Object({ displayNumber: Type.Integer({ minimum: 1 }), id: Id }),
    Type.Null(),
  ]),
  assignments: Type.Array(Assignment),
  capabilities: Type.Object({
    canCancel: Type.Boolean(),
    canComment: Type.Boolean(),
    canDecide: Type.Boolean(),
  }),
  closedAt: Type.Union([DateTime, Type.Null()]),
  comparisonId: Type.Union([Id, Type.Null()]),
  createdAt: DateTime,
  id: Id,
  message: Type.String(),
  requestedBy: Person,
  status: ReviewStatus,
  threads: Type.Array(Thread),
  updatedAt: DateTime,
  version: VersionReference,
});
const ReviewPage = Type.Object({
  items: Type.Array(Review),
  nextCursor: Type.Union([Type.String(), Type.Null()]),
});
const DocumentParams = Type.Object({
  documentId: Id,
  organizationId: Id,
  projectId: Id,
});
const ReviewParams = Type.Intersect([
  DocumentParams,
  Type.Object({ reviewRequestId: Id }),
]);
const ThreadParams = Type.Intersect([
  ReviewParams,
  Type.Object({ threadId: Id }),
]);
const IdempotentHeaders = Type.Object({
  'idempotency-key': Type.String({ maxLength: 128, minLength: 8 }),
  'x-csrf-token': Type.String({ minLength: 20 }),
});
const Errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
  409: ErrorResponse,
};

interface ReviewRuntime extends IdentityRuntime {
  reviewStore: ReviewStore;
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

function serializeReview(review: ReviewRequestSummary) {
  return {
    ...review,
    assignments: review.assignments.map((assignment) => ({
      ...assignment,
      decision: assignment.decision
        ? {
            ...assignment.decision,
            createdAt: assignment.decision.createdAt.toISOString(),
          }
        : null,
    })),
    closedAt: review.closedAt?.toISOString() ?? null,
    createdAt: review.createdAt.toISOString(),
    threads: review.threads.map((thread) => ({
      ...thread,
      comments: thread.comments.map((comment) => ({
        ...comment,
        createdAt: comment.createdAt.toISOString(),
      })),
      createdAt: thread.createdAt.toISOString(),
      resolvedAt: thread.resolvedAt?.toISOString() ?? null,
      updatedAt: thread.updatedAt.toISOString(),
    })),
    updatedAt: review.updatedAt.toISOString(),
    version: {
      ...review.version,
      createdAt: review.version.createdAt.toISOString(),
    },
  };
}

async function sendReviewError(
  reply: FastifyReply,
  error: unknown,
  runtime: ReviewRuntime,
  audit: {
    action: string;
    actor: ProjectActor;
    requestId: string;
    targetId: string;
    targetType: string;
  },
) {
  if (!(error instanceof ReviewOperationError)) throw error;
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
    case 'idempotency_conflict':
      return sendApiError(
        reply,
        409,
        'idempotency_conflict',
        'The idempotency key was already used for different input.',
      );
    case 'invalid_reviewers':
      return sendApiError(
        reply,
        409,
        'invalid_reviewers',
        'Reviewers must be active project leads or reviewers and cannot include the version author.',
      );
    case 'review_unavailable':
      return sendApiError(
        reply,
        409,
        'review_unavailable',
        'This processed version is unavailable for a new review.',
      );
    case 'review_closed':
      return sendApiError(
        reply,
        409,
        'review_closed',
        'This review no longer accepts changes.',
      );
    case 'decision_exists':
      return sendApiError(
        reply,
        409,
        'decision_exists',
        'This reviewer already recorded a decision.',
      );
    case 'invalid_anchor':
      return sendApiError(
        reply,
        409,
        'invalid_anchor',
        'The discussion anchor does not match a persisted comparison change.',
      );
    case 'limit_reached':
      return sendApiError(
        reply,
        409,
        'review_limit_reached',
        'This review reached its bounded discussion limit.',
      );
    case 'conflict':
      return sendApiError(
        reply,
        409,
        'conflict',
        'The review changed concurrently.',
      );
  }
}

export function registerReviewRoutes(
  app: FastifyInstance,
  runtime: ReviewRuntime,
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
  const base =
    '/v1/organizations/:organizationId/projects/:projectId/documents/:documentId/reviews';

  typed.get(
    base,
    {
      preHandler: reads,
      schema: {
        params: DocumentParams,
        querystring: Type.Object({
          cursor: Type.Optional(Type.String({ maxLength: 1000 })),
          limit: Type.Optional(Type.Integer({ maximum: 50, minimum: 1 })),
        }),
        response: { 200: ReviewPage, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.reviewStore.listReviews({
          actor: currentActor,
          cursor: request.query.cursor,
          documentId: request.params.documentId,
          limit: request.query.limit ?? 20,
          projectId: request.params.projectId,
        });
        return {
          items: result.items.map(serializeReview),
          nextCursor: result.nextCursor,
        };
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.list_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.post(
    base,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          comparisonId: Type.Union([Id, Type.Null()]),
          message: Type.String({
            maxLength: 2000,
            minLength: 1,
            pattern: '\\S',
          }),
          reviewerUserIds: Type.Array(Id, {
            maxItems: 20,
            minItems: 1,
            uniqueItems: true,
          }),
          versionId: Id,
        }),
        headers: IdempotentHeaders,
        params: DocumentParams,
        response: { 200: Review, 201: Review, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const result = await runtime.reviewStore.createReview({
          actor: currentActor,
          comparisonId: request.body.comparisonId,
          documentId: request.params.documentId,
          idempotencyKey: request.headers['idempotency-key'],
          message: request.body.message.trim(),
          projectId: request.params.projectId,
          requestId: request.id,
          reviewerUserIds: request.body.reviewerUserIds,
          versionId: request.body.versionId,
        });
        return reply
          .code(result.replayed ? 200 : 201)
          .send(serializeReview(result.review));
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.request_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.documentId,
          targetType: 'document',
        });
      }
    },
  );

  typed.get(
    `${base}/:reviewRequestId`,
    {
      preHandler: reads,
      schema: { params: ReviewParams, response: { 200: Review, ...Errors } },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeReview(
          await runtime.reviewStore.getReview({
            actor: currentActor,
            documentId: request.params.documentId,
            projectId: request.params.projectId,
            reviewRequestId: request.params.reviewRequestId,
          }),
        );
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.read_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.reviewRequestId,
          targetType: 'review_request',
        });
      }
    },
  );

  typed.post(
    `${base}/:reviewRequestId/decisions`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          decision: DecisionValue,
          note: Type.String({
            maxLength: 2000,
            minLength: 1,
            pattern: '\\S',
          }),
        }),
        headers: IdempotentHeaders,
        params: ReviewParams,
        response: { 200: Review, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeReview(
          await runtime.reviewStore.decide({
            actor: currentActor,
            decision: request.body.decision,
            documentId: request.params.documentId,
            idempotencyKey: request.headers['idempotency-key'],
            note: request.body.note.trim(),
            projectId: request.params.projectId,
            requestId: request.id,
            reviewRequestId: request.params.reviewRequestId,
          }),
        );
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.decision_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.reviewRequestId,
          targetType: 'review_request',
        });
      }
    },
  );

  typed.post(
    `${base}/:reviewRequestId/cancel`,
    {
      preHandler: mutations,
      schema: {
        headers: IdempotentHeaders,
        params: ReviewParams,
        response: { 200: Review, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeReview(
          await runtime.reviewStore.cancelReview({
            actor: currentActor,
            documentId: request.params.documentId,
            idempotencyKey: request.headers['idempotency-key'],
            projectId: request.params.projectId,
            requestId: request.id,
            reviewRequestId: request.params.reviewRequestId,
          }),
        );
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.cancel_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.reviewRequestId,
          targetType: 'review_request',
        });
      }
    },
  );

  typed.post(
    `${base}/:reviewRequestId/threads`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          anchor: Type.Union([Anchor, Type.Null()]),
          body: Type.String({
            maxLength: 2000,
            minLength: 1,
            pattern: '\\S',
          }),
        }),
        headers: IdempotentHeaders,
        params: ReviewParams,
        response: { 201: Review, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return reply.code(201).send(
          serializeReview(
            await runtime.reviewStore.createThread({
              actor: currentActor,
              anchor: request.body.anchor,
              body: request.body.body.trim(),
              documentId: request.params.documentId,
              idempotencyKey: request.headers['idempotency-key'],
              projectId: request.params.projectId,
              requestId: request.id,
              reviewRequestId: request.params.reviewRequestId,
            }),
          ),
        );
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.thread_create_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.reviewRequestId,
          targetType: 'review_request',
        });
      }
    },
  );

  typed.post(
    `${base}/:reviewRequestId/threads/:threadId/comments`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object({
          body: Type.String({
            maxLength: 2000,
            minLength: 1,
            pattern: '\\S',
          }),
        }),
        headers: IdempotentHeaders,
        params: ThreadParams,
        response: { 201: Review, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return reply.code(201).send(
          serializeReview(
            await runtime.reviewStore.addComment({
              actor: currentActor,
              body: request.body.body.trim(),
              documentId: request.params.documentId,
              idempotencyKey: request.headers['idempotency-key'],
              projectId: request.params.projectId,
              requestId: request.id,
              reviewRequestId: request.params.reviewRequestId,
              threadId: request.params.threadId,
            }),
          ),
        );
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.comment_create_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.threadId,
          targetType: 'review_thread',
        });
      }
    },
  );

  typed.post(
    `${base}/:reviewRequestId/threads/:threadId/resolve`,
    {
      preHandler: mutations,
      schema: {
        headers: IdempotentHeaders,
        params: ThreadParams,
        response: { 200: Review, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        return serializeReview(
          await runtime.reviewStore.resolveThread({
            actor: currentActor,
            documentId: request.params.documentId,
            idempotencyKey: request.headers['idempotency-key'],
            projectId: request.params.projectId,
            requestId: request.id,
            reviewRequestId: request.params.reviewRequestId,
            threadId: request.params.threadId,
          }),
        );
      } catch (error) {
        return sendReviewError(reply, error, runtime, {
          action: 'review.thread_resolve_denied',
          actor: currentActor,
          requestId: request.id,
          targetId: request.params.threadId,
          targetType: 'review_thread',
        });
      }
    },
  );
}
