import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { IdentityRuntime } from '../identity/auth-routes';
import {
  createSecurityHandlers,
  sendApiError,
} from '../identity/http-security';
import { NotificationOperationError, type NotificationStore } from './store';
import type { UserNotification } from './types';

const Id = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const OrganizationParams = Type.Object({ organizationId: Id });
const NotificationParams = Type.Intersect([
  OrganizationParams,
  Type.Object({ notificationId: Id }),
]);
const MutationHeaders = Type.Object({ 'x-csrf-token': Type.String() });
const Notification = Type.Object({
  body: Type.String(),
  category: Type.Union([
    Type.Literal('review_activity'),
    Type.Literal('document_activity'),
  ]),
  createdAt: DateTime,
  eventType: Type.String(),
  href: Type.String(),
  id: Id,
  readAt: Type.Union([DateTime, Type.Null()]),
  title: Type.String(),
});
const PreferencesBody = Type.Object({
  emailDocumentActivity: Type.Boolean(),
  emailReviewActivity: Type.Boolean(),
  inAppDocumentActivity: Type.Boolean(),
  inAppReviewActivity: Type.Boolean(),
});
const Preferences = Type.Intersect([
  PreferencesBody,
  Type.Object({ emailAvailable: Type.Boolean(), updatedAt: DateTime }),
]);

function serializeNotification(notification: UserNotification) {
  return {
    ...notification,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

function actor(request: {
  sessionContext?: {
    activeMembership?: { organizationId: string } | null;
    user: { id: string };
  };
}) {
  return {
    organizationId: request.sessionContext!.activeMembership!.organizationId,
    userId: request.sessionContext!.user.id,
  };
}

function sendNotificationError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof NotificationOperationError)) throw error;
  if (error.code === 'invalid_cursor') {
    return sendApiError(reply, 400, 'invalid_cursor', 'The cursor is invalid.');
  }
  if (error.code === 'email_unverified') {
    return sendApiError(
      reply,
      409,
      'email_unverified',
      'Email delivery requires a verified email address.',
    );
  }
  return sendApiError(reply, 404, 'not_found', 'Resource not found.');
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  runtime: IdentityRuntime & { notificationStore: NotificationStore },
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);
  const reads = [
    security.requireSession,
    security.requireOrganization('organization:read'),
  ];
  const mutations = [...reads, security.requireCsrf];
  const basePath = '/v1/organizations/:organizationId/notifications';

  typed.get(
    `${basePath}/preferences`,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        response: {
          200: Preferences,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const preferences = await runtime.notificationStore.getPreferences(
          actor(request),
        );
        return {
          ...preferences,
          updatedAt: preferences.updatedAt.toISOString(),
        };
      } catch (error) {
        return sendNotificationError(reply, error);
      }
    },
  );

  typed.put(
    `${basePath}/preferences`,
    {
      preHandler: mutations,
      schema: {
        body: PreferencesBody,
        headers: MutationHeaders,
        params: OrganizationParams,
        response: {
          200: Preferences,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const preferences = await runtime.notificationStore.updatePreferences({
          ...request.body,
          actor: actor(request),
          requestId: request.id,
        });
        return {
          ...preferences,
          updatedAt: preferences.updatedAt.toISOString(),
        };
      } catch (error) {
        return sendNotificationError(reply, error);
      }
    },
  );

  typed.get(
    basePath,
    {
      preHandler: reads,
      schema: {
        params: OrganizationParams,
        querystring: Type.Object({
          cursor: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Integer({ maximum: 100, minimum: 1 })),
          unreadOnly: Type.Optional(Type.Boolean()),
        }),
        response: {
          200: Type.Object({
            items: Type.Array(Notification),
            nextCursor: Type.Union([Type.String(), Type.Null()]),
            unreadCount: Type.Integer({ minimum: 0 }),
          }),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        const page = await runtime.notificationStore.list({
          actor: actor(request),
          cursor: request.query.cursor,
          limit: request.query.limit ?? 50,
          unreadOnly: request.query.unreadOnly ?? false,
        });
        return { ...page, items: page.items.map(serializeNotification) };
      } catch (error) {
        return sendNotificationError(reply, error);
      }
    },
  );

  typed.post(
    `${basePath}/:notificationId/read`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: NotificationParams,
        response: {
          200: Notification,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        return serializeNotification(
          await runtime.notificationStore.markRead({
            actor: actor(request),
            notificationId: request.params.notificationId,
            requestId: request.id,
          }),
        );
      } catch (error) {
        return sendNotificationError(reply, error);
      }
    },
  );

  typed.post(
    `${basePath}/read-all`,
    {
      preHandler: mutations,
      schema: {
        headers: MutationHeaders,
        params: OrganizationParams,
        response: {
          200: Type.Object({ updatedCount: Type.Integer({ minimum: 0 }) }),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request) =>
      runtime.notificationStore.markAllRead({
        actor: actor(request),
        requestId: request.id,
      }),
  );
}
