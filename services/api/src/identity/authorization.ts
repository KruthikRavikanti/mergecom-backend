import type { OrganizationRole } from './types';

export const permissions = [
  'organization:read',
  'membership:list',
  'invitation:create',
  'membership:change_role',
  'membership:suspend',
  'membership:remove',
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissions: Record<OrganizationRole, ReadonlySet<Permission>> = {
  owner: new Set(permissions),
  admin: new Set(permissions),
  project_lead: new Set(['organization:read', 'membership:list']),
  contributor: new Set(['organization:read', 'membership:list']),
  reviewer: new Set(['organization:read', 'membership:list']),
  viewer: new Set(['organization:read', 'membership:list']),
  external_reviewer: new Set(['organization:read']),
};

export function hasPermission(
  role: OrganizationRole,
  permission: Permission,
): boolean {
  return rolePermissions[role].has(permission);
}

export function canInviteAs(
  actorRole: OrganizationRole,
  invitedRole: OrganizationRole,
): boolean {
  if (!hasPermission(actorRole, 'invitation:create')) return false;
  if (actorRole === 'owner') return true;
  return !['owner', 'admin'].includes(invitedRole);
}

export function canManageMembership(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
  nextRole?: OrganizationRole,
): boolean {
  if (actorRole === 'owner') return true;
  if (actorRole !== 'admin') return false;
  if (targetRole === 'owner' || targetRole === 'admin') return false;
  return nextRole === undefined || !['owner', 'admin'].includes(nextRole);
}
