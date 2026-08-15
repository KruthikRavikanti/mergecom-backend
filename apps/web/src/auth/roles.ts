import type { OrganizationRole } from './session';

export const roleLabels: Record<OrganizationRole, string> = {
  admin: 'Administrator',
  contributor: 'Contributor',
  external_reviewer: 'External reviewer',
  owner: 'Organization owner',
  project_lead: 'Project lead',
  reviewer: 'Reviewer',
  viewer: 'Viewer',
};

export function canManageAccess(role: OrganizationRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
