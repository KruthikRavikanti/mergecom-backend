import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { hashToken, randomToken } from '../security/crypto';
import {
  createSecurityHandlers,
  sendApiError,
  sessionCookieName,
} from './http-security';
import type { IdentityRuntime } from './auth-routes';
import { IdentityOperationError } from './store';
import type { SessionContext } from './types';

const Role = Type.Union([
  Type.Literal('owner'),
  Type.Literal('admin'),
  Type.Literal('project_lead'),
  Type.Literal('contributor'),
  Type.Literal('reviewer'),
  Type.Literal('viewer'),
  Type.Literal('external_reviewer'),
]);
const ProjectRole = Type.Union([
  Type.Literal('project_lead'),
  Type.Literal('contributor'),
  Type.Literal('reviewer'),
  Type.Literal('viewer'),
]);
const Status = Type.Union([Type.Literal('active'), Type.Literal('suspended')]);
const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});
const Organization = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  role: Role,
});
const CurrentUser = Type.Object({
  activeOrganization: Type.Union([
    Type.Null(),
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      name: Type.String(),
      role: Role,
      status: Status,
    }),
  ]),
  organizations: Type.Array(Organization),
  session: Type.Object({
    csrfToken: Type.String(),
    expiresAt: Type.String({ format: 'date-time' }),
  }),
  user: Type.Object({
    displayName: Type.String(),
    email: Type.String({ format: 'email' }),
    emailVerified: Type.Boolean(),
    id: Type.String({ format: 'uuid' }),
  }),
});
const Membership = Type.Object({
  email: Type.String({ format: 'email' }),
  id: Type.String({ format: 'uuid' }),
  joinedAt: Type.String({ format: 'date-time' }),
  name: Type.String(),
  role: Role,
  status: Status,
  userId: Type.String({ format: 'uuid' }),
});
const OrganizationParams = Type.Object({
  organizationId: Type.String({ format: 'uuid' }),
});
const MembershipParams = Type.Intersect([
  OrganizationParams,
  Type.Object({ membershipId: Type.String({ format: 'uuid' }) }),
]);

function currentUserResponse(context: SessionContext) {
  return {
    activeOrganization: context.activeMembership
      ? {
          id: context.activeMembership.organizationId,
          name: context.activeMembership.organizationName,
          role: context.activeMembership.role,
          status: context.activeMembership.status,
        }
      : null,
    organizations: context.organizations,
    session: {
      csrfToken: context.csrfTokenHash,
      expiresAt: context.expiresAt.toISOString(),
    },
    user: context.user,
  };
}

async function sendOperationError(
  reply: FastifyReply,
  error: unknown,
  runtime: IdentityRuntime,
  audit: {
    action: string;
    actorUserId: string;
    organizationId?: string | null | undefined;
    requestId: string;
    targetId?: string | null | undefined;
    targetType: string;
  },
) {
  if (!(error instanceof IdentityOperationError)) throw error;
  await runtime.store.appendAuditEvent({
    ...audit,
    metadata: { reason: error.code },
    result: 'denied',
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
    case 'invalid_invitation':
      return sendApiError(
        reply,
        400,
        'invalid_invitation',
        'The invitation is invalid or unavailable.',
      );
    case 'last_owner':
      return sendApiError(
        reply,
        409,
        'last_owner',
        'An organization must retain an active owner.',
      );
    case 'conflict':
      return sendApiError(
        reply,
        409,
        'conflict',
        'The requested membership change conflicts with existing access.',
      );
  }
}

export function registerIdentityRoutes(
  app: FastifyInstance,
  runtime: IdentityRuntime,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);

  typed.get(
    '/v1/me',
    {
      preHandler: security.requireSession,
      schema: { response: { 200: CurrentUser, 401: ErrorResponse } },
    },
    (request) => currentUserResponse(request.sessionContext!),
  );

  typed.post(
    '/v1/session/organization',
    {
      preHandler: [security.requireSession, security.requireCsrf],
      schema: {
        body: OrganizationParams,
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        response: {
          200: CurrentUser,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext!;
      const switched = await runtime.store.switchOrganization({
        organizationId: request.body.organizationId,
        sessionId: context.sessionId,
        userId: context.user.id,
      });
      if (!switched) {
        await runtime.store.appendAuditEvent({
          action: 'authorization.cross_tenant_denied',
          actorUserId: context.user.id,
          organizationId: context.activeMembership?.organizationId,
          requestId: request.id,
          result: 'denied',
          targetId: request.body.organizationId,
          targetType: 'organization',
        });
        return sendApiError(reply, 404, 'not_found', 'Resource not found.');
      }
      const refreshed = await runtime.store.resolveSession(
        hashToken(request.cookies[sessionCookieName(runtime.config)]!),
        new Date(),
      );
      if (!refreshed) {
        return sendApiError(
          reply,
          401,
          'unauthenticated',
          'Authentication is required.',
        );
      }
      return currentUserResponse(refreshed);
    },
  );

  typed.get(
    '/v1/organizations/:organizationId/memberships',
    {
      preHandler: [
        security.requireSession,
        security.requireOrganization('membership:list'),
      ],
      schema: {
        params: OrganizationParams,
        response: {
          200: Type.Object({ memberships: Type.Array(Membership) }),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request) => ({
      memberships: (
        await runtime.store.listMemberships(request.params.organizationId)
      ).map((membership) => ({
        ...membership,
        joinedAt: membership.joinedAt.toISOString(),
      })),
    }),
  );

  typed.post(
    '/v1/organizations/:organizationId/invitations',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
      preHandler: [
        security.requireSession,
        security.requireCsrf,
        security.requireOrganization('invitation:create'),
      ],
      schema: {
        body: Type.Object({
          email: Type.String({ format: 'email', maxLength: 320 }),
          expiresInDays: Type.Optional(
            Type.Integer({ maximum: 14, minimum: 1 }),
          ),
          projectId: Type.Optional(Type.String({ format: 'uuid' })),
          projectRole: Type.Optional(ProjectRole),
          role: Role,
        }),
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        params: OrganizationParams,
        response: {
          201: Type.Object({
            acceptanceUrl: Type.Optional(Type.String({ format: 'uri' })),
            email: Type.String({ format: 'email' }),
            expiresAt: Type.String({ format: 'date-time' }),
            id: Type.String({ format: 'uuid' }),
            projectId: Type.Optional(Type.String({ format: 'uuid' })),
            projectRole: Type.Optional(ProjectRole),
            role: Role,
          }),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
          503: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext!;
      if (
        Boolean(request.body.projectId) !== Boolean(request.body.projectRole)
      ) {
        return sendApiError(
          reply,
          400,
          'invalid_project_assignment',
          'Project and project role must be provided together.',
        );
      }
      if (!runtime.invitationMailer && !runtime.config.exposeInvitationLinks) {
        return sendApiError(
          reply,
          503,
          'invitation_delivery_unavailable',
          'Invitation delivery is unavailable.',
        );
      }
      const token = randomToken();
      const expiresAt = new Date(
        Date.now() + (request.body.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
      );
      try {
        const invitation = await runtime.store.createInvitation({
          actorRole: context.activeMembership!.role,
          actorUserId: context.user.id,
          email: request.body.email.trim().toLowerCase(),
          expiresAt,
          organizationId: request.params.organizationId,
          projectId: request.body.projectId,
          projectRole: request.body.projectRole,
          requestId: request.id,
          role: request.body.role,
          tokenHash: hashToken(token),
        });
        const acceptanceUrl = new URL(
          `/invite/${encodeURIComponent(token)}`,
          runtime.config.webOrigin,
        ).href;
        if (runtime.invitationMailer) {
          try {
            await runtime.invitationMailer.send({
              acceptanceUrl,
              email: invitation.email,
              expiresAt: invitation.expiresAt,
              organizationName: context.activeMembership!.organizationName,
            });
          } catch (error) {
            request.log.error({ error }, 'Invitation delivery failed.');
            await runtime.store.revokeInvitation({
              actorUserId: context.user.id,
              invitationId: invitation.id,
              organizationId: request.params.organizationId,
              requestId: request.id,
            });
            return sendApiError(
              reply,
              503,
              'invitation_delivery_failed',
              'The invitation could not be delivered.',
            );
          }
        }
        return reply.code(201).send({
          ...(runtime.config.exposeInvitationLinks ? { acceptanceUrl } : {}),
          email: invitation.email,
          expiresAt: invitation.expiresAt.toISOString(),
          id: invitation.id,
          ...(invitation.projectId && invitation.projectRole
            ? {
                projectId: invitation.projectId,
                projectRole: invitation.projectRole,
              }
            : {}),
          role: invitation.role,
        });
      } catch (error) {
        return sendOperationError(reply, error, runtime, {
          action: 'invitation.create_denied',
          actorUserId: context.user.id,
          organizationId: request.params.organizationId,
          requestId: request.id,
          targetType: 'invitation',
        });
      }
    },
  );

  typed.post(
    '/v1/invitations/accept',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
      preHandler: [security.requireSession, security.requireCsrf],
      schema: {
        body: Type.Object({
          token: Type.String({ maxLength: 256, minLength: 20 }),
        }),
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        response: {
          200: Type.Object({ organizationId: Type.String({ format: 'uuid' }) }),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      try {
        return {
          organizationId: await runtime.store.acceptInvitation({
            now: new Date(),
            requestId: request.id,
            tokenHash: hashToken(request.body.token),
            userId: request.sessionContext!.user.id,
          }),
        };
      } catch (error) {
        return sendOperationError(reply, error, runtime, {
          action: 'invitation.accept_denied',
          actorUserId: request.sessionContext!.user.id,
          organizationId:
            request.sessionContext!.activeMembership?.organizationId,
          requestId: request.id,
          targetType: 'invitation',
        });
      }
    },
  );

  typed.patch(
    '/v1/organizations/:organizationId/memberships/:membershipId/role',
    {
      preHandler: [
        security.requireSession,
        security.requireCsrf,
        security.requireOrganization('membership:change_role'),
      ],
      schema: {
        body: Type.Object({ role: Role }),
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        params: MembershipParams,
        response: {
          204: Type.Null(),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext!;
      try {
        await runtime.store.changeMembershipRole({
          actorRole: context.activeMembership!.role,
          actorUserId: context.user.id,
          membershipId: request.params.membershipId,
          organizationId: request.params.organizationId,
          requestId: request.id,
          role: request.body.role,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendOperationError(reply, error, runtime, {
          action: 'membership.role_change_denied',
          actorUserId: context.user.id,
          organizationId: request.params.organizationId,
          requestId: request.id,
          targetId: request.params.membershipId,
          targetType: 'membership',
        });
      }
    },
  );

  typed.patch(
    '/v1/organizations/:organizationId/memberships/:membershipId/status',
    {
      preHandler: [
        security.requireSession,
        security.requireCsrf,
        security.requireOrganization('membership:suspend'),
      ],
      schema: {
        body: Type.Object({ status: Status }),
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        params: MembershipParams,
        response: {
          204: Type.Null(),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext!;
      try {
        await runtime.store.setMembershipStatus({
          actorRole: context.activeMembership!.role,
          actorUserId: context.user.id,
          membershipId: request.params.membershipId,
          organizationId: request.params.organizationId,
          requestId: request.id,
          status: request.body.status,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendOperationError(reply, error, runtime, {
          action: 'membership.status_change_denied',
          actorUserId: context.user.id,
          organizationId: request.params.organizationId,
          requestId: request.id,
          targetId: request.params.membershipId,
          targetType: 'membership',
        });
      }
    },
  );

  typed.delete(
    '/v1/organizations/:organizationId/memberships/:membershipId',
    {
      preHandler: [
        security.requireSession,
        security.requireCsrf,
        security.requireOrganization('membership:remove'),
      ],
      schema: {
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        params: MembershipParams,
        response: {
          204: Type.Null(),
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext!;
      try {
        await runtime.store.removeMembership({
          actorRole: context.activeMembership!.role,
          actorUserId: context.user.id,
          membershipId: request.params.membershipId,
          organizationId: request.params.organizationId,
          requestId: request.id,
        });
        return reply.code(204).send(null);
      } catch (error) {
        return sendOperationError(reply, error, runtime, {
          action: 'membership.remove_denied',
          actorUserId: context.user.id,
          organizationId: request.params.organizationId,
          requestId: request.id,
          targetId: request.params.membershipId,
          targetType: 'membership',
        });
      }
    },
  );
}
