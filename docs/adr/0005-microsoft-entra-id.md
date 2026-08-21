# ADR 0005: Microsoft Entra ID through OIDC

- Status: Accepted
- Date: 2026-08-15

## Context

The frontend prototype stores plain-text demo credentials and allows browser state to determine access. MergeCom targets Microsoft Office users and needs tenant-aware identity without creating an application password store.

## Decision

Use Microsoft Entra ID as the primary identity provider through OIDC authorization code flow with PKCE. The API owns secure sessions and maps verified provider subjects/tenant claims to MergeCom users, organizations, memberships, invitations, and project access.

Provider identity does not by itself grant organization access. Tenant admission, invitations, role assignment, external reviewer scope, and session revocation are server-enforced domain policy.

## Consequences

- No primary-user password column or password administration UI is required.
- Local development and CI need documented non-production identity configuration without committed secrets.
- Account linking, tenant changes, guest identities, and invitation lifecycle require explicit tests.
- The Office add-in and web app share identity policy but may use host-appropriate token/session handoffs.

