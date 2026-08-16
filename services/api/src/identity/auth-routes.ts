import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance } from 'fastify';

import { safeReturnTo, type ApiConfig } from '../config';
import { hashToken, randomToken } from '../security/crypto';
import { validateIdentityClaims } from './claims';
import {
  createSecurityHandlers,
  oidcCookieName,
  sendApiError,
  sessionCookieName,
} from './http-security';
import type { InvitationMailer } from './invitation-mailer';
import type { OidcClient } from './oidc';
import { createSessionMaterial } from './session';
import type { IdentityStore } from './store';

const ErrorResponse = Type.Object({
  code: Type.String(),
  message: Type.String(),
});

const DevelopmentIdentity = Type.Union([
  Type.Literal('alpha-owner'),
  Type.Literal('alpha-admin'),
  Type.Literal('alpha-project-lead'),
  Type.Literal('alpha-contributor'),
  Type.Literal('alpha-reviewer'),
  Type.Literal('alpha-viewer'),
  Type.Literal('alpha-external-reviewer'),
  Type.Literal('beta-owner'),
]);

const OFFICE_HANDOFF_PREFIX = 'office_handoff_';
const OFFICE_HANDOFF_MILLISECONDS = 2 * 60 * 1000;

export interface IdentityRuntime {
  config: ApiConfig;
  invitationMailer: InvitationMailer | null;
  oidcClient: OidcClient | null;
  store: IdentityStore;
}

function cookieOptions(config: ApiConfig) {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
  };
}

export function registerAuthRoutes(
  app: FastifyInstance,
  runtime: IdentityRuntime,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const security = createSecurityHandlers(runtime);

  typed.get(
    '/auth/login',
    {
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
      schema: {
        querystring: Type.Object({ returnTo: Type.Optional(Type.String()) }),
        response: { 503: ErrorResponse },
      },
    },
    async (request, reply) => {
      if (!runtime.oidcClient) {
        return sendApiError(
          reply,
          503,
          'identity_provider_unavailable',
          'Microsoft sign-in is not configured in this environment.',
        );
      }
      const authorization =
        await runtime.oidcClient.createAuthorizationRequest();
      const handle = randomToken();
      await runtime.store.createOidcTransaction({
        codeVerifier: authorization.codeVerifier,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        handleHash: hashToken(handle),
        nonce: authorization.nonce,
        returnTo: safeReturnTo(
          request.query.returnTo,
          runtime.config.officeAddinOrigin,
        ),
        state: authorization.state,
      });
      return reply
        .setCookie(oidcCookieName(runtime.config), handle, {
          ...cookieOptions(runtime.config),
          maxAge: 10 * 60,
        })
        .redirect(authorization.url.href);
    },
  );

  typed.get(
    '/auth/callback',
    {
      config: { rateLimit: { max: 30, timeWindow: '10 minutes' } },
      schema: {
        querystring: Type.Object({}, { additionalProperties: true }),
      },
    },
    async (request, reply) => {
      const loginUrl = new URL('/login', runtime.config.webOrigin);
      const handle = request.cookies[oidcCookieName(runtime.config)];
      let transactionReturnTo: string | null = null;
      try {
        if (!handle || !runtime.oidcClient)
          throw new Error('Missing login state.');
        const transaction = await runtime.store.consumeOidcTransaction(
          hashToken(handle),
          new Date(),
        );
        if (!transaction) throw new Error('Expired or replayed login state.');
        transactionReturnTo = transaction.returnTo;
        const callbackUrl = new URL(
          request.raw.url ?? '/auth/callback',
          runtime.config.apiPublicOrigin,
        );
        const claims = await runtime.oidcClient.consumeCallback(callbackUrl, {
          codeVerifier: transaction.codeVerifier,
          nonce: transaction.nonce,
          state: transaction.state,
        });
        const identity = validateIdentityClaims(
          claims,
          await runtime.oidcClient.issuer(),
        );
        const now = new Date();
        const session = createSessionMaterial(
          now,
          runtime.config.sessionIdleMilliseconds,
          runtime.config.sessionAbsoluteMilliseconds,
        );
        await runtime.store.authenticateIdentity({
          identity,
          now,
          requestId: request.id,
          session: session.material,
        });
        return reply
          .clearCookie(
            oidcCookieName(runtime.config),
            cookieOptions(runtime.config),
          )
          .setCookie(sessionCookieName(runtime.config), session.token, {
            ...cookieOptions(runtime.config),
            maxAge: Math.floor(
              runtime.config.sessionAbsoluteMilliseconds / 1000,
            ),
          })
          .redirect(
            new URL(transaction.returnTo, runtime.config.webOrigin).href,
          );
      } catch (error) {
        request.log.warn({ error }, 'OIDC callback was rejected.');
        await runtime.store.appendAuditEvent({
          action: 'auth.login_failed',
          requestId: request.id,
          result: 'failed',
          targetType: 'identity',
        });
        const errorUrl = officeAuthenticationReturnUrl(
          transactionReturnTo,
          runtime.config.officeAddinOrigin,
        );
        (errorUrl ?? loginUrl).searchParams.set(
          'error',
          'authentication_failed',
        );
        return reply
          .clearCookie(
            oidcCookieName(runtime.config),
            cookieOptions(runtime.config),
          )
          .redirect((errorUrl ?? loginUrl).href);
      }
    },
  );

  typed.post(
    '/auth/office/handoff',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: [security.requireSession, security.requireCsrf],
      schema: {
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        response: {
          200: Type.Object({
            code: Type.String(),
            expiresAt: Type.String({ format: 'date-time' }),
          }),
          401: ErrorResponse,
          403: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext;
      if (!context) return;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + OFFICE_HANDOFF_MILLISECONDS);
      const code = `${OFFICE_HANDOFF_PREFIX}${randomToken()}`;
      const created = await runtime.store.createOfficeSessionHandoff({
        handoff: {
          absoluteExpiresAt: expiresAt,
          csrfTokenHash: hashToken(randomToken()),
          expiresAt,
          tokenHash: hashToken(code),
        },
        now,
        sourceSessionId: context.sessionId,
      });
      if (!created) {
        return sendApiError(
          reply,
          401,
          'unauthenticated',
          'Authentication is required.',
        );
      }
      await runtime.store.appendAuditEvent({
        action: 'auth.office_handoff_created',
        actorUserId: context.user.id,
        organizationId: context.activeMembership?.organizationId,
        requestId: request.id,
        result: 'succeeded',
        targetType: 'session',
      });
      return { code, expiresAt: expiresAt.toISOString() };
    },
  );

  typed.post(
    '/auth/office/exchange',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: Type.Object({
          code: Type.String({ minLength: 50, maxLength: 100 }),
        }),
        response: {
          200: Type.Object({ authenticated: Type.Literal(true) }),
          400: ErrorResponse,
          403: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (request.headers.origin !== runtime.config.officeAddinOrigin) {
        return sendApiError(
          reply,
          403,
          'origin_rejected',
          'The Office session origin was rejected.',
        );
      }
      if (!request.body.code.startsWith(OFFICE_HANDOFF_PREFIX)) {
        await auditRejectedOfficeHandoff(runtime.store, request.id);
        return sendApiError(
          reply,
          400,
          'invalid_office_handoff',
          'The Office session handoff is invalid or expired.',
        );
      }
      const now = new Date();
      const session = createSessionMaterial(
        now,
        runtime.config.sessionIdleMilliseconds,
        runtime.config.sessionAbsoluteMilliseconds,
      );
      const exchange = await runtime.store.consumeOfficeSessionHandoff({
        handoffTokenHash: hashToken(request.body.code),
        now,
        session: session.material,
      });
      if (!exchange) {
        await auditRejectedOfficeHandoff(runtime.store, request.id);
        return sendApiError(
          reply,
          400,
          'invalid_office_handoff',
          'The Office session handoff is invalid or expired.',
        );
      }
      await runtime.store.appendAuditEvent({
        action: 'auth.office_handoff_exchanged',
        actorUserId: exchange.userId,
        organizationId: exchange.organizationId,
        requestId: request.id,
        result: 'succeeded',
        targetId: exchange.sessionId,
        targetType: 'session',
      });
      return reply
        .setCookie(sessionCookieName(runtime.config), session.token, {
          ...cookieOptions(runtime.config),
          maxAge: Math.floor(runtime.config.sessionAbsoluteMilliseconds / 1000),
        })
        .send({ authenticated: true as const });
    },
  );

  typed.post(
    '/auth/development/session',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        body: Type.Object({ identity: DevelopmentIdentity }),
        response: {
          200: Type.Object({ authenticated: Type.Literal(true) }),
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      if (
        runtime.config.authMode !== 'development' ||
        runtime.config.nodeEnv === 'production'
      ) {
        return sendApiError(
          reply,
          403,
          'development_identity_disabled',
          'Development identity is disabled.',
        );
      }
      const now = new Date();
      const session = createSessionMaterial(
        now,
        runtime.config.sessionIdleMilliseconds,
        runtime.config.sessionAbsoluteMilliseconds,
      );
      const context = await runtime.store.createSessionForDevelopmentIdentity({
        now,
        providerSubject: request.body.identity,
        requestId: request.id,
        session: session.material,
      });
      if (!context) {
        return sendApiError(
          reply,
          404,
          'development_identity_not_found',
          'Run the local identity seed command first.',
        );
      }
      return reply
        .setCookie(sessionCookieName(runtime.config), session.token, {
          ...cookieOptions(runtime.config),
          maxAge: Math.floor(runtime.config.sessionAbsoluteMilliseconds / 1000),
        })
        .send({ authenticated: true as const });
    },
  );

  typed.post(
    '/auth/logout',
    {
      preHandler: [security.requireSession, security.requireCsrf],
      schema: {
        headers: Type.Object({ 'x-csrf-token': Type.String() }),
        response: {
          200: Type.Object({ redirectTo: Type.String() }),
          401: ErrorResponse,
          403: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const context = request.sessionContext;
      if (!context) return;
      await runtime.store.revokeSession(context.sessionId, request.id);
      const redirectTo = runtime.oidcClient
        ? (await runtime.oidcClient.logoutUrl()).href
        : `${runtime.config.webOrigin}/login`;
      return reply
        .clearCookie(
          sessionCookieName(runtime.config),
          cookieOptions(runtime.config),
        )
        .send({ redirectTo });
    },
  );
}

function officeAuthenticationReturnUrl(
  returnTo: string | null,
  officeAddinOrigin: string,
): URL | null {
  if (!returnTo) return null;
  try {
    const candidate = new URL(returnTo);
    return candidate.origin === officeAddinOrigin &&
      candidate.pathname === '/office-auth.html' &&
      candidate.searchParams.get('callback') === '1'
      ? candidate
      : null;
  } catch {
    return null;
  }
}

async function auditRejectedOfficeHandoff(
  store: IdentityStore,
  requestId: string,
): Promise<void> {
  await store.appendAuditEvent({
    action: 'auth.office_handoff_rejected',
    requestId,
    result: 'failed',
    targetType: 'session',
  });
}
