import type {
  AuditEventInput,
  MembershipStatus,
  MembershipSummary,
  OrganizationRole,
  SessionContext,
  VerifiedIdentity,
} from './types';

export interface SessionMaterial {
  absoluteExpiresAt: Date;
  csrfTokenHash: string;
  expiresAt: Date;
  tokenHash: string;
}

export interface OidcTransactionInput {
  codeVerifier: string;
  expiresAt: Date;
  handleHash: string;
  nonce: string;
  returnTo: string;
  state: string;
}

export interface OidcTransactionRecord {
  codeVerifier: string;
  nonce: string;
  returnTo: string;
  state: string;
}

export interface InvitationRecord {
  email: string;
  expiresAt: Date;
  id: string;
  role: OrganizationRole;
}

export class IdentityOperationError extends Error {
  public constructor(
    public readonly code:
      'conflict' | 'denied' | 'invalid_invitation' | 'last_owner' | 'not_found',
  ) {
    super(code);
  }
}

export interface IdentityStore {
  acceptInvitation(input: {
    now: Date;
    requestId: string;
    tokenHash: string;
    userId: string;
  }): Promise<string>;
  appendAuditEvent(event: AuditEventInput): Promise<void>;
  authenticateIdentity(input: {
    identity: VerifiedIdentity;
    now: Date;
    requestId: string;
    session: SessionMaterial;
  }): Promise<SessionContext>;
  changeMembershipRole(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    membershipId: string;
    organizationId: string;
    requestId: string;
    role: OrganizationRole;
  }): Promise<void>;
  consumeOidcTransaction(
    handleHash: string,
    now: Date,
  ): Promise<OidcTransactionRecord | null>;
  createInvitation(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    email: string;
    expiresAt: Date;
    organizationId: string;
    requestId: string;
    role: OrganizationRole;
    tokenHash: string;
  }): Promise<InvitationRecord>;
  createOidcTransaction(input: OidcTransactionInput): Promise<void>;
  createSessionForDevelopmentIdentity(input: {
    now: Date;
    providerSubject: string;
    requestId: string;
    session: SessionMaterial;
  }): Promise<SessionContext | null>;
  listMemberships(organizationId: string): Promise<MembershipSummary[]>;
  removeMembership(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    membershipId: string;
    organizationId: string;
    requestId: string;
  }): Promise<void>;
  revokeInvitation(input: {
    actorUserId: string;
    invitationId: string;
    organizationId: string;
    requestId: string;
  }): Promise<void>;
  resolveSession(tokenHash: string, now: Date): Promise<SessionContext | null>;
  revokeSession(sessionId: string, requestId: string): Promise<void>;
  setMembershipStatus(input: {
    actorRole: OrganizationRole;
    actorUserId: string;
    membershipId: string;
    organizationId: string;
    requestId: string;
    status: MembershipStatus;
  }): Promise<void>;
  switchOrganization(input: {
    organizationId: string;
    sessionId: string;
    userId: string;
  }): Promise<boolean>;
}
