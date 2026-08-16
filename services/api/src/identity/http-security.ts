import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ApiConfig } from '../config';
import { hashToken, secureEqual } from '../security/crypto';
import { hasPermission, type Permission } from './authorization';
import type { IdentityStore } from './store';
import type { SessionContext } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    sessionContext?: SessionContext;
  }
}

export interface SecurityRuntime {
  config: ApiConfig;
  store: IdentityStore;
}

export const sessionCookieName = (config: ApiConfig) =>
  config.cookieSecure ? '__Host-mergecom_session' : 'mergecom_session';
export const oidcCookieName = (config: ApiConfig) =>
  config.cookieSecure ? '__Host-mergecom_oidc' : 'mergecom_oidc';

export function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({ code, message });
}

async function auditInvalidSession(
  request: FastifyRequest,
  store: IdentityStore,
): Promise<void> {
  try {
    await store.appendAuditEvent({
      action: 'auth.session_invalid',
      requestId: request.id,
      result: 'failed',
      targetType: 'session',
    });
  } catch (error) {
    request.log.error(
      { error },
      'Could not record invalid session audit event.',
    );
  }
}

export function createSecurityHandlers(runtime: SecurityRuntime) {
  const requireSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const token = request.cookies[sessionCookieName(runtime.config)];
    if (!token) {
      sendApiError(
        reply,
        401,
        'unauthenticated',
        'Authentication is required.',
      );
      return;
    }
    const context = await runtime.store.resolveSession(
      hashToken(token),
      new Date(),
    );
    if (!context) {
      await auditInvalidSession(request, runtime.store);
      sendApiError(
        reply,
        401,
        'unauthenticated',
        'Authentication is required.',
      );
      return;
    }
    request.sessionContext = context;
  };

  const requireCsrf = async (request: FastifyRequest, reply: FastifyReply) => {
    if (reply.sent) return;
    const context = request.sessionContext;
    const csrfToken = request.headers['x-csrf-token'];
    const origin = request.headers.origin;
    const allowedOrigins = new Set([
      runtime.config.webOrigin,
      runtime.config.officeAddinOrigin,
    ]);
    if (
      !context ||
      typeof csrfToken !== 'string' ||
      typeof origin !== 'string' ||
      !allowedOrigins.has(origin) ||
      !secureEqual(csrfToken, context.csrfTokenHash)
    ) {
      sendApiError(
        reply,
        403,
        'csrf_rejected',
        'The request could not be verified.',
      );
    }
  };

  const requireOrganization =
    (permission: Permission) =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (reply.sent) return;
      const context = request.sessionContext;
      const organizationId = (
        request.params as { organizationId?: string } | undefined
      )?.organizationId;
      const active = context?.activeMembership;
      if (!context || !active || active.status !== 'active') {
        sendApiError(
          reply,
          403,
          'workspace_access_denied',
          'Active workspace access is required.',
        );
        return;
      }
      if (organizationId !== active.organizationId) {
        await runtime.store.appendAuditEvent({
          action: 'authorization.cross_tenant_denied',
          actorUserId: context.user.id,
          organizationId: active.organizationId,
          requestId: request.id,
          result: 'denied',
          targetId: organizationId,
          targetType: 'organization',
        });
        sendApiError(reply, 404, 'not_found', 'Resource not found.');
        return;
      }
      if (!hasPermission(active.role, permission)) {
        await runtime.store.appendAuditEvent({
          action: 'authorization.permission_denied',
          actorUserId: context.user.id,
          metadata: { permission },
          organizationId: active.organizationId,
          requestId: request.id,
          result: 'denied',
          targetId: organizationId,
          targetType: 'organization',
        });
        sendApiError(reply, 403, 'forbidden', 'This action is not permitted.');
      }
    };

  return { requireCsrf, requireOrganization, requireSession };
}
