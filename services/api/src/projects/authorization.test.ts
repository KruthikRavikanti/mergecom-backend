import { describe, expect, it } from 'vitest';

import {
  canCreateProject,
  canManageProject,
  canWriteProjectContent,
  effectiveProjectRole,
  projectRoleAllowed,
} from './authorization';

describe('project authorization', () => {
  it('caps project roles at the organization role', () => {
    expect(projectRoleAllowed('contributor', 'project_lead')).toBe(false);
    expect(projectRoleAllowed('contributor', 'contributor')).toBe(true);
    expect(projectRoleAllowed('reviewer', 'contributor')).toBe(false);
    expect(projectRoleAllowed('external_reviewer', 'reviewer')).toBe(true);
  });

  it('requires explicit project membership except for owner and admin', () => {
    expect(effectiveProjectRole('owner', null)).toBe('project_lead');
    expect(effectiveProjectRole('admin', null)).toBe('project_lead');
    expect(effectiveProjectRole('project_lead', null)).toBeNull();
    expect(effectiveProjectRole('external_reviewer', 'reviewer')).toBe(
      'reviewer',
    );
  });

  it('separates project administration from content contribution', () => {
    expect(canCreateProject('project_lead')).toBe(true);
    expect(canCreateProject('contributor')).toBe(false);
    expect(canManageProject('contributor')).toBe(false);
    expect(canWriteProjectContent('contributor')).toBe(true);
    expect(canWriteProjectContent('reviewer')).toBe(false);
  });
});
