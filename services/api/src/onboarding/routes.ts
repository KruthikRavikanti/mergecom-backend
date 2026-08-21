import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { IdentityRuntime } from '../identity/auth-routes';
import {
  createSecurityHandlers,
  sendApiError,
} from '../identity/http-security';
import type { ProjectActor } from '../projects/types';
import { deriveOnboardingSteps } from './checklist';
import { OnboardingOperationError, type OnboardingStore } from './store';

export const PRODUCT_VERSION = '0.9.0-phase29';
export const COMPARISON_TOUR_VERSION = 'comparison-workspace-v1';

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
const DocumentKind = Type.Union([
  Type.Literal('presentation'),
  Type.Literal('spreadsheet'),
  Type.Literal('word_document'),
]);
const FeedbackReason = Type.Union([
  Type.Literal('confusing'),
  Type.Literal('missing_capability'),
  Type.Literal('performance'),
  Type.Literal('incorrect_result'),
  Type.Literal('positive'),
  Type.Literal('other'),
]);
const FeedbackResourceType = Type.Union([
  Type.Literal('onboarding'),
  Type.Literal('comparison'),
  Type.Literal('office_addin'),
  Type.Literal('setup'),
  Type.Literal('workspace'),
  Type.Literal('other'),
]);
const SampleComparison = Type.Object({
  description: Type.String(),
  destination: Type.String(),
  document: Type.Object({ id: Id, name: Type.String() }),
  id: Id,
  kind: DocumentKind,
  project: Type.Object({ id: Id, name: Type.String() }),
  title: Type.String(),
});
const Feedback = Type.Object({
  comment: Type.Union([Type.String(), Type.Null()]),
  createdAt: DateTime,
  id: Id,
  productVersion: Type.String(),
  rating: Type.Integer({ maximum: 5, minimum: 1 }),
  reason: FeedbackReason,
  resourceType: FeedbackResourceType,
  route: Type.String(),
  userId: Id,
});
const Errors = {
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};

interface OnboardingRuntime extends IdentityRuntime {
  onboardingStore: OnboardingStore;
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

function sendOnboardingError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof OnboardingOperationError)) throw error;
  if (error.code === 'denied') {
    return sendApiError(
      reply,
      403,
      'forbidden',
      'This action is not permitted.',
    );
  }
  if (error.code === 'invalid_sample') {
    return sendApiError(
      reply,
      400,
      'invalid_sample',
      'A sample must reference a completed comparison in clearly labeled synthetic resources.',
    );
  }
  return sendApiError(reply, 404, 'not_found', 'Resource not found.');
}

export function registerOnboardingRoutes(
  app: FastifyInstance,
  runtime: OnboardingRuntime,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);
  const reads = [
    security.requireSession,
    security.requireOrganization('organization:read'),
  ];
  const mutations = [...reads, security.requireCsrf];
  const basePath = '/v1/organizations/:organizationId/onboarding';

  typed.get(
    basePath,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        response: {
          200: Type.Object({
            dismissed: Type.Boolean(),
            progress: Type.Object({
              completed: Type.Integer({ minimum: 0 }),
              total: Type.Integer({ minimum: 0 }),
            }),
            samples: Type.Array(SampleComparison),
            steps: Type.Array(
              Type.Object({
                completed: Type.Boolean(),
                description: Type.String(),
                destination: Type.String(),
                key: Type.Union([
                  Type.Literal('explore_sample'),
                  Type.Literal('project_access'),
                  Type.Literal('add_document'),
                  Type.Literal('first_version'),
                  Type.Literal('save_and_compare'),
                  Type.Literal('review'),
                ]),
                label: Type.String(),
              }),
            ),
            tour: Type.Object({
              status: Type.Union([
                Type.Literal('completed'),
                Type.Literal('skipped'),
                Type.Literal('unseen'),
              ]),
              version: Type.Union([Type.String(), Type.Null()]),
            }),
          }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      try {
        const [evidence, preferences, samples] = await Promise.all([
          runtime.onboardingStore.getEvidence({ actor: currentActor }),
          runtime.onboardingStore.getPreferences({ actor: currentActor }),
          runtime.onboardingStore.listSamples({ actor: currentActor }),
        ]);
        const steps = deriveOnboardingSteps({
          evidence,
          role: currentActor.organizationRole,
        });
        return {
          dismissed: preferences.dismissed,
          progress: {
            completed: steps.filter((step) => step.completed).length,
            total: steps.length,
          },
          samples,
          steps,
          tour: {
            status: preferences.tourStatus,
            version: preferences.tourVersion,
          },
        };
      } catch (error) {
        return sendOnboardingError(reply, error);
      }
    },
  );

  typed.patch(
    `${basePath}/preferences`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object(
          {
            dismissed: Type.Optional(Type.Boolean()),
            tour: Type.Optional(
              Type.Object({
                status: Type.Union([
                  Type.Literal('completed'),
                  Type.Literal('skipped'),
                ]),
                version: Type.String({ maxLength: 80, minLength: 1 }),
              }),
            ),
          },
          { additionalProperties: false, minProperties: 1 },
        ),
        headers: MutationHeaders,
        params: OrganizationParams,
        response: { 204: Type.Null(), ...Errors },
      },
    },
    async (request, reply) => {
      try {
        await runtime.onboardingStore.updatePreferences({
          actor: actor(request),
          dismissed: request.body.dismissed,
          tour: request.body.tour,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendOnboardingError(reply, error);
      }
    },
  );

  typed.get(
    `${basePath}/setup-readiness`,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        response: {
          200: Type.Object({
            api: Type.Literal('ready'),
            authenticated: Type.Literal(true),
            environment: Type.Union([
              Type.Literal('development'),
              Type.Literal('hosted'),
            ]),
            manifestUrls: Type.Object({
              excel: Type.String({ format: 'uri' }),
              powerpoint: Type.String({ format: 'uri' }),
              word: Type.String({ format: 'uri' }),
            }),
            productVersion: Type.String(),
            taskPaneOrigin: Type.String({ format: 'uri' }),
            webOrigin: Type.String({ format: 'uri' }),
          }),
          ...Errors,
        },
      },
    },
    () => ({
      api: 'ready' as const,
      authenticated: true as const,
      environment:
        runtime.config.nodeEnv === 'production'
          ? ('hosted' as const)
          : ('development' as const),
      manifestUrls: {
        excel: `${runtime.config.officeAddinOrigin}/manifest.excel.xml`,
        powerpoint: `${runtime.config.officeAddinOrigin}/manifest.powerpoint.xml`,
        word: `${runtime.config.officeAddinOrigin}/manifest.word.xml`,
      },
      productVersion: PRODUCT_VERSION,
      taskPaneOrigin: runtime.config.officeAddinOrigin,
      webOrigin: runtime.config.webOrigin,
    }),
  );

  typed.post(
    `${basePath}/samples`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object(
          {
            comparisonId: Id,
            description: Type.String({ maxLength: 500, minLength: 1 }),
            documentId: Id,
            kind: DocumentKind,
            projectId: Id,
            title: Type.String({ maxLength: 160, minLength: 1 }),
          },
          { additionalProperties: false },
        ),
        headers: MutationHeaders,
        params: OrganizationParams,
        response: { 201: SampleComparison, ...Errors },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      if (!['owner', 'admin'].includes(currentActor.organizationRole)) {
        return sendOnboardingError(
          reply,
          new OnboardingOperationError('denied'),
        );
      }
      try {
        const sample = await runtime.onboardingStore.registerSample({
          actor: currentActor,
          ...request.body,
        });
        await runtime.store.appendAuditEvent({
          action: 'sample.registered',
          actorUserId: currentActor.userId,
          metadata: { kind: sample.kind },
          organizationId: currentActor.organizationId,
          requestId: request.id,
          result: 'succeeded',
          targetId: sample.id,
          targetType: 'version_comparison',
        });
        return reply.code(201).send(sample);
      } catch (error) {
        return sendOnboardingError(reply, error);
      }
    },
  );

  typed.post(
    `${basePath}/feedback`,
    {
      preHandler: mutations,
      schema: {
        body: Type.Object(
          {
            comment: Type.Optional(
              Type.Union([Type.String({ maxLength: 2_000 }), Type.Null()]),
            ),
            productVersion: Type.String({ maxLength: 80, minLength: 1 }),
            rating: Type.Integer({ maximum: 5, minimum: 1 }),
            reason: FeedbackReason,
            resourceType: FeedbackResourceType,
            route: Type.String({ maxLength: 500, minLength: 1 }),
          },
          { additionalProperties: false },
        ),
        headers: MutationHeaders,
        params: OrganizationParams,
        response: { 201: Feedback, ...Errors },
      },
    },
    async (request, reply) => {
      try {
        const feedback = await runtime.onboardingStore.appendFeedback({
          actor: actor(request),
          ...request.body,
          comment: request.body.comment?.trim() || null,
        });
        return reply.code(201).send({
          ...feedback,
          createdAt: feedback.createdAt.toISOString(),
        });
      } catch (error) {
        return sendOnboardingError(reply, error);
      }
    },
  );

  typed.get(
    `${basePath}/feedback`,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        querystring: Type.Object({
          limit: Type.Optional(Type.Integer({ maximum: 500, minimum: 1 })),
        }),
        response: {
          200: Type.Object({ items: Type.Array(Feedback) }),
          ...Errors,
        },
      },
    },
    async (request, reply) => {
      const currentActor = actor(request);
      if (!['owner', 'admin'].includes(currentActor.organizationRole)) {
        return sendOnboardingError(
          reply,
          new OnboardingOperationError('denied'),
        );
      }
      try {
        const items = await runtime.onboardingStore.listFeedback({
          actor: currentActor,
          limit: request.query.limit ?? 500,
        });
        return {
          items: items.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
          })),
        };
      } catch (error) {
        return sendOnboardingError(reply, error);
      }
    },
  );
}
