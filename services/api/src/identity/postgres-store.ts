import type { Pool, PoolClient } from 'pg';

import { canInviteAs, canManageMembership } from './authorization';
import {
  IdentityOperationError,
  type IdentityStore,
  type InvitationRecord,
  type OidcTransactionInput,
  type OidcTransactionRecord,
  type SessionMaterial,
} from './store';
import type {
  AuditEventInput,
  MembershipStatus,
  MembershipSummary,
  OrganizationRole,
  SessionContext,
  VerifiedIdentity,
} from './types';

interface SessionRow {
  absolute_expires_at: Date;
  active_organization_id: string | null;
  csrf_token_hash: string;
  display_name: string;
  email_verified: boolean;
  expires_at: Date;
  primary_email: string;
  session_id: string;
  user_id: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  organization_name: string;
  role: OrganizationRole;
  status: MembershipStatus;
}

interface TargetMembershipRow {
  role: OrganizationRole;
  status: MembershipStatus;
  user_id: string;
}

async function inTransaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

function emailDomain(email: string): string {
  return email.split('@').at(-1) ?? '';
}

export class PostgresIdentityStore implements IdentityStore {
  public constructor(
    private readonly pool: Pool,
    private readonly idleSessionMilliseconds: number,
  ) {}

  public async resolveSession(
    tokenHash: string,
    now: Date,
  ): Promise<SessionContext | null> {
    const result = await this.pool.query<SessionRow>(
      `select s.id as session_id, s.active_organization_id,
              s.csrf_token_hash, s.expires_at, s.absolute_expires_at,
              u.id as user_id, u.display_name, u.primary_email, u.email_verified
         from sessions s
         join users u on u.id = s.user_id
        where s.token_hash = $1
          and s.revoked_at is null
          and s.expires_at > $2
          and s.absolute_expires_at > $2
          and u.disabled_at is null`,
      [tokenHash, now],
    );
    const row = result.rows[0];
    if (!row) return null;

    const membershipResult = await this.pool.query<MembershipRow>(
      `select m.id, m.organization_id, o.name as organization_name,
              m.role, m.status
         from memberships m
         join organizations o on o.id = m.organization_id
        where m.user_id = $1 and o.suspended_at is null
        order by o.name, m.created_at`,
      [row.user_id],
    );
    const activeMembershipRow =
      membershipResult.rows.find(
        (membership) =>
          membership.organization_id === row.active_organization_id,
      ) ?? null;
    const activeMembership = activeMembershipRow
      ? {
          id: activeMembershipRow.id,
          organizationId: activeMembershipRow.organization_id,
          organizationName: activeMembershipRow.organization_name,
          role: activeMembershipRow.role,
          status: activeMembershipRow.status,
        }
      : null;
    const nextExpiry = new Date(
      Math.min(
        row.absolute_expires_at.getTime(),
        now.getTime() + this.idleSessionMilliseconds,
      ),
    );
    await this.pool.query(
      `update sessions
          set expires_at = $2, last_seen_at = $3, updated_at = $3
        where id = $1 and revoked_at is null`,
      [row.session_id, nextExpiry, now],
    );

    return {
      activeMembership,
      csrfTokenHash: row.csrf_token_hash,
      expiresAt: nextExpiry,
      organizations: membershipResult.rows
        .filter((membership) => membership.status === 'active')
        .map((membership) => ({
          id: membership.organization_id,
          name: membership.organization_name,
          role: membership.role,
        })),
      sessionId: row.session_id,
      user: {
        displayName: row.display_name,
        email: row.primary_email,
        emailVerified: row.email_verified,
        id: row.user_id,
      },
    };
  }

  public async createOidcTransaction(
    input: OidcTransactionInput,
  ): Promise<void> {
    await this.pool.query(
      `insert into oidc_transactions
        (handle_hash, code_verifier, state, nonce, return_to, expires_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        input.handleHash,
        input.codeVerifier,
        input.state,
        input.nonce,
        input.returnTo,
        input.expiresAt,
      ],
    );
  }

  public async consumeOidcTransaction(
    handleHash: string,
    now: Date,
  ): Promise<OidcTransactionRecord | null> {
    const result = await this.pool.query<OidcTransactionRecord>(
      `update oidc_transactions
          set consumed_at = $2
        where handle_hash = $1 and consumed_at is null and expires_at > $2
      returning code_verifier as "codeVerifier", nonce, return_to as "returnTo", state`,
      [handleHash, now],
    );
    return result.rows[0] ?? null;
  }

  public async authenticateIdentity(input: {
    identity: VerifiedIdentity;
    now: Date;
    requestId: string;
    session: SessionMaterial;
  }): Promise<SessionContext> {
    const tokenHash = input.session.tokenHash;
    await inTransaction(this.pool, async (client) => {
      const mapping = await client.query<{ user_id: string }>(
        `select user_id from identity_mappings
          where issuer = $1 and provider_tenant_id = $2 and provider_subject = $3
          for update`,
        [
          input.identity.issuer,
          input.identity.providerTenantId,
          input.identity.providerSubject,
        ],
      );
      let userId = mapping.rows[0]?.user_id;
      if (userId) {
        const updatedUser = await client.query(
          `update users
              set display_name = $2, primary_email = $3,
                  email_verified = true, updated_at = $4
            where id = $1 and disabled_at is null`,
          [userId, input.identity.displayName, input.identity.email, input.now],
        );
        if (updatedUser.rowCount !== 1) {
          throw new IdentityOperationError('denied');
        }
        await client.query(
          `update identity_mappings
              set email_claim = $2, email_verified = true,
                  last_login_at = $3, updated_at = $3
            where user_id = $1 and issuer = $4
              and provider_tenant_id = $5 and provider_subject = $6`,
          [
            userId,
            input.identity.email,
            input.now,
            input.identity.issuer,
            input.identity.providerTenantId,
            input.identity.providerSubject,
          ],
        );
      } else {
        const insertedUser = await client.query<{ id: string }>(
          `insert into users (display_name, primary_email, email_verified)
           values ($1, $2, true) returning id`,
          [input.identity.displayName, input.identity.email],
        );
        userId = insertedUser.rows[0]?.id;
        if (!userId) throw new Error('Identity user creation failed.');
        await client.query(
          `insert into identity_mappings
            (user_id, issuer, provider_tenant_id, provider_subject,
             email_claim, email_verified, last_login_at)
           values ($1, $2, $3, $4, $5, true, $6)`,
          [
            userId,
            input.identity.issuer,
            input.identity.providerTenantId,
            input.identity.providerSubject,
            input.identity.email,
            input.now,
          ],
        );

        const grant = await client.query<{
          id: string;
          organization_name: string;
          organization_slug: string;
        }>(
          `select id, organization_name, organization_slug
             from organization_bootstrap_grants
            where issuer = $1 and provider_tenant_id = $2
              and provider_subject = $3 and verified_email = $4
              and consumed_at is null and expires_at > $5
            for update`,
          [
            input.identity.issuer,
            input.identity.providerTenantId,
            input.identity.providerSubject,
            input.identity.email,
            input.now,
          ],
        );
        const bootstrap = grant.rows[0];
        if (bootstrap) {
          const organization = await client.query<{ id: string }>(
            `insert into organizations (name, slug) values ($1, $2) returning id`,
            [bootstrap.organization_name, bootstrap.organization_slug],
          );
          const organizationId = organization.rows[0]?.id;
          if (!organizationId) throw new Error('Organization creation failed.');
          await client.query(
            `insert into memberships (organization_id, user_id, role)
             values ($1, $2, 'owner')`,
            [organizationId, userId],
          );
          await client.query(
            `update organization_bootstrap_grants
                set consumed_at = $2, consumed_by_user_id = $3
              where id = $1`,
            [bootstrap.id, input.now, userId],
          );
          await this.insertAudit(client, {
            action: 'organization.created',
            actorUserId: userId,
            organizationId,
            requestId: input.requestId,
            result: 'succeeded',
            targetId: organizationId,
            targetType: 'organization',
          });
        }

        const policies = await client.query<{
          default_role: OrganizationRole;
          organization_id: string;
        }>(
          `select organization_id, default_role
             from organization_identity_policies
            where issuer = $1 and provider_tenant_id = $2 and enabled = true
              and (verified_email_domain is null or verified_email_domain = $3)`,
          [
            input.identity.issuer,
            input.identity.providerTenantId,
            emailDomain(input.identity.email),
          ],
        );
        for (const policy of policies.rows) {
          await client.query(
            `insert into memberships (organization_id, user_id, role)
             values ($1, $2, $3)
             on conflict (organization_id, user_id) do nothing`,
            [policy.organization_id, userId, policy.default_role],
          );
        }
      }

      const activeOrganization = await client.query<{
        organization_id: string;
      }>(
        `select organization_id from memberships
          where user_id = $1
          order by (status = 'active') desc, created_at
          limit 1`,
        [userId],
      );
      await this.insertSession(
        client,
        userId,
        activeOrganization.rows[0]?.organization_id ?? null,
        input.session,
        input.identity.providerSessionId,
      );
      await this.insertAudit(client, {
        action: 'auth.login',
        actorUserId: userId,
        organizationId: activeOrganization.rows[0]?.organization_id,
        requestId: input.requestId,
        result: 'succeeded',
        targetId: userId,
        targetType: 'user',
      });
    });
    const context = await this.resolveSession(tokenHash, input.now);
    if (!context) throw new Error('The new session could not be resolved.');
    return context;
  }

  public async createSessionForDevelopmentIdentity(input: {
    now: Date;
    providerSubject: string;
    requestId: string;
    session: SessionMaterial;
  }): Promise<SessionContext | null> {
    const identity = await this.pool.query<{
      provider_session_id: string | null;
      user_id: string;
    }>(
      `select user_id, null::text as provider_session_id
         from identity_mappings
        where issuer = 'https://identity.local.mergecom'
          and provider_tenant_id = 'local-development'
          and provider_subject = $1`,
      [input.providerSubject],
    );
    const userId = identity.rows[0]?.user_id;
    if (!userId) return null;
    await inTransaction(this.pool, async (client) => {
      const organization = await client.query<{ organization_id: string }>(
        `select organization_id from memberships
          where user_id = $1
          order by (status = 'active') desc, created_at limit 1`,
        [userId],
      );
      await this.insertSession(
        client,
        userId,
        organization.rows[0]?.organization_id ?? null,
        input.session,
      );
      await this.insertAudit(client, {
        action: 'auth.login',
        actorUserId: userId,
        organizationId: organization.rows[0]?.organization_id,
        metadata: { mode: 'development' },
        requestId: input.requestId,
        result: 'succeeded',
        targetId: userId,
        targetType: 'user',
      });
    });
    return this.resolveSession(input.session.tokenHash, input.now);
  }

  public async switchOrganization(input: {
    organizationId: string;
    sessionId: string;
    userId: string;
  }): Promise<boolean> {
    const result = await this.pool.query(
      `update sessions s
          set active_organization_id = $1, updated_at = now()
        where s.id = $2 and s.user_id = $3 and s.revoked_at is null
          and exists (
            select 1 from memberships m join organizations o on o.id = m.organization_id
             where m.organization_id = $1 and m.user_id = $3
               and m.status = 'active' and o.suspended_at is null
          )`,
      [input.organizationId, input.sessionId, input.userId],
    );
    return result.rowCount === 1;
  }

  public async revokeSession(
    sessionId: string,
    requestId: string,
  ): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const session = await client.query<{
        active_organization_id: string | null;
        user_id: string;
      }>(
        `update sessions set revoked_at = now(), updated_at = now()
          where id = $1 and revoked_at is null
          returning user_id, active_organization_id`,
        [sessionId],
      );
      const row = session.rows[0];
      if (row) {
        await this.insertAudit(client, {
          action: 'auth.logout',
          actorUserId: row.user_id,
          organizationId: row.active_organization_id,
          requestId,
          result: 'succeeded',
          targetId: sessionId,
          targetType: 'session',
        });
      }
    });
  }

  public async listMemberships(
    organizationId: string,
  ): Promise<MembershipSummary[]> {
    const result = await this.pool.query<{
      created_at: Date;
      display_name: string;
      id: string;
      primary_email: string;
      role: OrganizationRole;
      status: MembershipStatus;
      user_id: string;
    }>(
      `select m.id, m.user_id, m.role, m.status, m.created_at,
              u.display_name, u.primary_email
         from memberships m join users u on u.id = m.user_id
        where m.organization_id = $1
        order by u.display_name, u.primary_email`,
      [organizationId],
    );
    return result.rows.map((row) => ({
      email: row.primary_email,
      id: row.id,
      joinedAt: row.created_at,
      name: row.display_name,
      role: row.role,
      status: row.status,
      userId: row.user_id,
    }));
  }

  public async createInvitation(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    email: string;
    expiresAt: Date;
    organizationId: string;
    requestId: string;
    role: OrganizationRole;
    tokenHash: string;
  }): Promise<InvitationRecord> {
    if (!canInviteAs(input.actorRole, input.role)) {
      throw new IdentityOperationError('denied');
    }
    return inTransaction(this.pool, async (client) => {
      const existing = await client.query(
        `select 1
           from invitations i
          where i.organization_id = $1 and i.email = $2
            and i.accepted_at is null and i.revoked_at is null
            and i.expires_at > now()
          union all
         select 1
           from memberships m join users u on u.id = m.user_id
          where m.organization_id = $1 and u.primary_email = $2
          limit 1`,
        [input.organizationId, input.email],
      );
      if (existing.rowCount) throw new IdentityOperationError('conflict');
      const result = await client.query<{
        email: string;
        expires_at: Date;
        id: string;
        role: OrganizationRole;
      }>(
        `insert into invitations
          (organization_id, email, role, token_hash, invited_by_user_id, expires_at)
         values ($1, $2, $3, $4, $5, $6)
         returning id, email, role, expires_at`,
        [
          input.organizationId,
          input.email,
          input.role,
          input.tokenHash,
          input.actorUserId,
          input.expiresAt,
        ],
      );
      const invitation = result.rows[0];
      if (!invitation) throw new Error('Invitation creation failed.');
      await this.insertAudit(client, {
        action: 'invitation.created',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        metadata: { invitedRole: input.role },
        requestId: input.requestId,
        result: 'succeeded',
        targetId: invitation.id,
        targetType: 'invitation',
      });
      return {
        email: invitation.email,
        expiresAt: invitation.expires_at,
        id: invitation.id,
        role: invitation.role,
      };
    });
  }

  public async acceptInvitation(input: {
    now: Date;
    requestId: string;
    tokenHash: string;
    userId: string;
  }): Promise<string> {
    return inTransaction(this.pool, async (client) => {
      const user = await client.query<{
        email_verified: boolean;
        primary_email: string;
      }>(
        `select primary_email, email_verified from users
          where id = $1 and disabled_at is null`,
        [input.userId],
      );
      const invitation = await client.query<{
        email: string;
        id: string;
        invited_by_user_id: string;
        organization_id: string;
        role: OrganizationRole;
      }>(
        `select id, organization_id, email, role, invited_by_user_id
           from invitations
          where token_hash = $1 and accepted_at is null and revoked_at is null
            and expires_at > $2
          for update`,
        [input.tokenHash, input.now],
      );
      const person = user.rows[0];
      const invite = invitation.rows[0];
      if (
        !person?.email_verified ||
        !invite ||
        person.primary_email !== invite.email
      ) {
        throw new IdentityOperationError('invalid_invitation');
      }
      const membership = await client.query<{ id: string }>(
        `insert into memberships
          (organization_id, user_id, role, invited_by_user_id)
         values ($1, $2, $3, $4)
         on conflict (organization_id, user_id) do nothing
         returning id`,
        [
          invite.organization_id,
          input.userId,
          invite.role,
          invite.invited_by_user_id,
        ],
      );
      if (!membership.rows[0]) throw new IdentityOperationError('conflict');
      await client.query(
        `update invitations
            set accepted_at = $2, accepted_by_user_id = $3, updated_at = $2
          where id = $1`,
        [invite.id, input.now, input.userId],
      );
      await client.query(
        `update sessions set active_organization_id = $2, updated_at = $3
          where user_id = $1 and active_organization_id is null
            and revoked_at is null`,
        [input.userId, invite.organization_id, input.now],
      );
      await this.insertAudit(client, {
        action: 'invitation.accepted',
        actorUserId: input.userId,
        organizationId: invite.organization_id,
        requestId: input.requestId,
        result: 'succeeded',
        targetId: invite.id,
        targetType: 'invitation',
      });
      return invite.organization_id;
    });
  }

  public async revokeInvitation(input: {
    actorUserId: string;
    invitationId: string;
    organizationId: string;
    requestId: string;
  }): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      await client.query(
        `update invitations set revoked_at = now(), updated_at = now()
          where id = $1 and organization_id = $2 and accepted_at is null`,
        [input.invitationId, input.organizationId],
      );
      await this.insertAudit(client, {
        action: 'invitation.delivery_failed',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        requestId: input.requestId,
        result: 'failed',
        targetId: input.invitationId,
        targetType: 'invitation',
      });
    });
  }

  public async changeMembershipRole(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    membershipId: string;
    organizationId: string;
    requestId: string;
    role: OrganizationRole;
  }): Promise<void> {
    await this.mutateMembership(input, async (client, target) => {
      if (!canManageMembership(input.actorRole, target.role, input.role)) {
        throw new IdentityOperationError('denied');
      }
      if (target.role === 'owner' && input.role !== 'owner') {
        await this.assertAnotherOwner(
          client,
          input.organizationId,
          input.membershipId,
        );
      }
      await client.query(
        `update memberships set role = $3, updated_at = now()
          where id = $1 and organization_id = $2`,
        [input.membershipId, input.organizationId, input.role],
      );
      await this.insertAudit(client, {
        action: 'membership.role_changed',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        metadata: { fromRole: target.role, toRole: input.role },
        requestId: input.requestId,
        result: 'succeeded',
        targetId: input.membershipId,
        targetType: 'membership',
      });
    });
  }

  public async setMembershipStatus(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    membershipId: string;
    organizationId: string;
    requestId: string;
    status: MembershipStatus;
  }): Promise<void> {
    await this.mutateMembership(input, async (client, target) => {
      if (!canManageMembership(input.actorRole, target.role)) {
        throw new IdentityOperationError('denied');
      }
      if (target.role === 'owner' && input.status === 'suspended') {
        await this.assertAnotherOwner(
          client,
          input.organizationId,
          input.membershipId,
        );
      }
      await client.query(
        `update memberships
            set status = $3::membership_status,
                suspended_at = case when $3::membership_status = 'suspended' then now() else null end,
                suspended_by_user_id = case when $3::membership_status = 'suspended' then $4::uuid else null end,
                updated_at = now()
          where id = $1 and organization_id = $2`,
        [
          input.membershipId,
          input.organizationId,
          input.status,
          input.actorUserId,
        ],
      );
      if (input.status === 'suspended') {
        await client.query(
          `update sessions set revoked_at = now(), updated_at = now()
            where user_id = $1 and active_organization_id = $2
              and revoked_at is null`,
          [target.user_id, input.organizationId],
        );
      }
      await this.insertAudit(client, {
        action:
          input.status === 'suspended'
            ? 'membership.suspended'
            : 'membership.reactivated',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        requestId: input.requestId,
        result: 'succeeded',
        targetId: input.membershipId,
        targetType: 'membership',
      });
    });
  }

  public async removeMembership(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    membershipId: string;
    organizationId: string;
    requestId: string;
  }): Promise<void> {
    await this.mutateMembership(input, async (client, target) => {
      if (!canManageMembership(input.actorRole, target.role)) {
        throw new IdentityOperationError('denied');
      }
      if (target.role === 'owner') {
        await this.assertAnotherOwner(
          client,
          input.organizationId,
          input.membershipId,
        );
      }
      await client.query(
        `delete from memberships where id = $1 and organization_id = $2`,
        [input.membershipId, input.organizationId],
      );
      await client.query(
        `update sessions set revoked_at = now(), updated_at = now()
          where user_id = $1 and active_organization_id = $2
            and revoked_at is null`,
        [target.user_id, input.organizationId],
      );
      await this.insertAudit(client, {
        action: 'membership.removed',
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        requestId: input.requestId,
        result: 'succeeded',
        targetId: input.membershipId,
        targetType: 'membership',
      });
    });
  }

  public async appendAuditEvent(event: AuditEventInput): Promise<void> {
    await this.insertAudit(this.pool, event);
  }

  private async mutateMembership(
    input: { membershipId: string; organizationId: string },
    operation: (
      client: PoolClient,
      target: TargetMembershipRow,
    ) => Promise<void>,
  ): Promise<void> {
    await inTransaction(this.pool, async (client) => {
      const result = await client.query<TargetMembershipRow>(
        `select user_id, role, status from memberships
          where id = $1 and organization_id = $2 for update`,
        [input.membershipId, input.organizationId],
      );
      const target = result.rows[0];
      if (!target) throw new IdentityOperationError('not_found');
      await operation(client, target);
    });
  }

  private async assertAnotherOwner(
    client: PoolClient,
    organizationId: string,
    excludedMembershipId: string,
  ): Promise<void> {
    const result = await client.query(
      `select 1 from memberships
        where organization_id = $1 and id <> $2
          and role = 'owner' and status = 'active'
        limit 1 for update`,
      [organizationId, excludedMembershipId],
    );
    if (!result.rowCount) throw new IdentityOperationError('last_owner');
  }

  private async insertSession(
    client: PoolClient,
    userId: string,
    activeOrganizationId: string | null,
    session: SessionMaterial,
    providerSessionId?: string,
  ): Promise<void> {
    await client.query(
      `insert into sessions
        (user_id, active_organization_id, token_hash, csrf_token_hash,
         provider_session_id, expires_at, absolute_expires_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        activeOrganizationId,
        session.tokenHash,
        session.csrfTokenHash,
        providerSessionId ?? null,
        session.expiresAt,
        session.absoluteExpiresAt,
      ],
    );
  }

  private async insertAudit(
    client: Pick<Pool | PoolClient, 'query'>,
    event: AuditEventInput,
  ): Promise<void> {
    await client.query(
      `insert into audit_events
        (organization_id, actor_user_id, action, target_type, target_id,
         result, request_id, metadata)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.organizationId ?? null,
        event.actorUserId ?? null,
        event.action,
        event.targetType,
        event.targetId ?? null,
        event.result,
        event.requestId,
        event.metadata ?? {},
      ],
    );
  }
}
