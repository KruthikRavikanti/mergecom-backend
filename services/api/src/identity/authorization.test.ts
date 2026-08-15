import { describe, expect, it } from 'vitest';

import {
  canInviteAs,
  canManageMembership,
  hasPermission,
} from './authorization';
import { organizationRoles } from './types';

describe('organization authorization policy', () => {
  it('keeps access management with owners and admins', () => {
    for (const role of organizationRoles) {
      expect(hasPermission(role, 'invitation:create')).toBe(
        role === 'owner' || role === 'admin',
      );
    }
  });

  it('does not let an admin grant or manage privileged roles', () => {
    expect(canInviteAs('admin', 'owner')).toBe(false);
    expect(canInviteAs('admin', 'admin')).toBe(false);
    expect(canManageMembership('admin', 'viewer', 'owner')).toBe(false);
    expect(canManageMembership('admin', 'admin', 'viewer')).toBe(false);
  });

  it('lets only owners manage owner memberships', () => {
    expect(canManageMembership('owner', 'owner', 'admin')).toBe(true);
    expect(canManageMembership('admin', 'owner', 'viewer')).toBe(false);
  });
});
