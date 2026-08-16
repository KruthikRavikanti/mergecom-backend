import type { OrganizationRole } from '../identity/types';
import type { ProjectRole } from './types';

const allowedRoles: Record<OrganizationRole, ReadonlySet<ProjectRole>> = {
  owner: new Set(['project_lead', 'contributor', 'reviewer', 'viewer']),
  admin: new Set(['project_lead', 'contributor', 'reviewer', 'viewer']),
  project_lead: new Set(['project_lead', 'contributor', 'reviewer', 'viewer']),
  contributor: new Set(['contributor', 'reviewer', 'viewer']),
  reviewer: new Set(['reviewer', 'viewer']),
  viewer: new Set(['viewer']),
  external_reviewer: new Set(['reviewer', 'viewer']),
};

export function canCreateProject(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'project_lead';
}

export function projectRoleAllowed(
  organizationRole: OrganizationRole,
  projectRole: ProjectRole,
): boolean {
  return allowedRoles[organizationRole].has(projectRole);
}

export function hasAutomaticProjectAccess(role: OrganizationRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function effectiveProjectRole(
  organizationRole: OrganizationRole,
  assignedRole: ProjectRole | null,
): ProjectRole | null {
  if (hasAutomaticProjectAccess(organizationRole)) return 'project_lead';
  if (!assignedRole || !projectRoleAllowed(organizationRole, assignedRole)) {
    return null;
  }
  return assignedRole;
}

export function canManageProject(role: ProjectRole): boolean {
  return role === 'project_lead';
}

export function canManageProjectTeam(role: ProjectRole): boolean {
  return role === 'project_lead';
}

export function canWriteProjectContent(role: ProjectRole): boolean {
  return role === 'project_lead' || role === 'contributor';
}
