export const organizationRoles = [
  'owner',
  'admin',
  'project_lead',
  'contributor',
  'reviewer',
  'viewer',
  'external_reviewer',
] as const;

export type OrganizationRole = (typeof organizationRoles)[number];
export type MembershipStatus = 'active' | 'suspended';

export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface MembershipSummary {
  email: string;
  id: string;
  joinedAt: Date;
  name: string;
  role: OrganizationRole;
  status: MembershipStatus;
  userId: string;
}

export interface SessionContext {
  activeMembership: {
    id: string;
    organizationId: string;
    organizationName: string;
    role: OrganizationRole;
    status: MembershipStatus;
  } | null;
  csrfTokenHash: string;
  expiresAt: Date;
  organizations: OrganizationSummary[];
  sessionId: string;
  user: {
    displayName: string;
    email: string;
    emailVerified: boolean;
    id: string;
  };
}

export interface VerifiedIdentity {
  displayName: string;
  email: string;
  emailVerified: true;
  issuer: string;
  providerSessionId?: string | undefined;
  providerSubject: string;
  providerTenantId: string;
}

export interface AuditEventInput {
  action: string;
  actorUserId?: string | null | undefined;
  metadata?: Record<string, string | number | boolean | null>;
  organizationId?: string | null | undefined;
  requestId: string;
  result: 'succeeded' | 'denied' | 'failed';
  targetId?: string | null | undefined;
  targetType: string;
}
