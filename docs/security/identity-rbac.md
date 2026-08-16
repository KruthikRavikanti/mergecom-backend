# Identity, tenancy, and RBAC

## Security boundary

The API is authoritative for identity mappings, sessions, active organization,
membership status, and role permissions. Browser-supplied organization IDs are used
only for an explicit organization-switch request. Every other organization-scoped
route requires the path organization to equal the authenticated session context.

The application has no password column or password endpoint. Entra users are keyed by
the immutable `(issuer, tid, oid)` tuple; email and display name are mutable profile
claims and never identity keys. Microsoft recommends `tid` and `oid` for authorization
data and warns against using email or username claims for access decisions:
<https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation>.

## Entra application registration

Configure a tenant-specific v2 issuer and a Web redirect URI:

```dotenv
NODE_ENV=production
AUTH_MODE=entra
API_PUBLIC_ORIGIN=https://api.example.com
WEB_ORIGIN=https://app.example.com
OIDC_ISSUER=https://login.microsoftonline.com/TENANT_ID/v2.0
OIDC_CLIENT_ID=APPLICATION_CLIENT_ID
OIDC_CLIENT_SECRET=SECRET_MANAGER_VALUE
COOKIE_SECURE=true
SMTP_URL=smtps://SMTP_CREDENTIALS
INVITATION_FROM=MergeCom <no-reply@example.com>
DATABASE_URL=SECRET_MANAGER_VALUE
```

Register `https://api.example.com/auth/callback` and
`https://app.example.com/login` as the callback and post-logout URIs. Add the `email`
and `xms_edov` optional ID-token claims. `xms_edov` indicates that the email-domain
owner was verified and requires the email claim. See Microsoft's
[optional claims configuration](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims)
and [optional claim reference](https://learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference).

The API uses authorization code flow with PKCE, state, and nonce. `openid-client`
performs OIDC discovery, audience/signature validation, and discovery-key refresh so
Microsoft signing-key rollover does not require hard-coded keys. Microsoft documents
the flow and rollover requirements at
<https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow>
and <https://learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover>.

## Admission and first owner

Provider authentication alone creates no organization access. A new identity is
admitted by one of these controlled paths:

1. An unexpired invitation matching the identity's verified normalized email.
2. An enabled organization identity policy matching issuer, Entra tenant, and optional verified email domain.
3. A one-time operator grant bound to exact issuer, tenant, subject, verified email, organization name, and slug.

Create the first-owner grant outside the HTTP surface:

```bash
ALLOW_OWNER_BOOTSTRAP=true \
BOOTSTRAP_ISSUER=https://login.microsoftonline.com/TENANT_ID/v2.0 \
BOOTSTRAP_TENANT_ID=TENANT_ID \
BOOTSTRAP_SUBJECT=ENTRA_OBJECT_ID \
BOOTSTRAP_EMAIL=owner@example.com \
BOOTSTRAP_ORGANIZATION_NAME='Example Advisory' \
BOOTSTRAP_ORGANIZATION_SLUG=example-advisory \
BOOTSTRAP_CREATED_BY=change-ticket-123 \
DATABASE_URL="$DATABASE_URL" \
pnpm --filter @mergecom/api db:bootstrap-owner
```

There is no endpoint that accepts an organization name or owner role from a new user.

## Authorization matrix

| Role | Read organization | List memberships | Invite | Change role | Suspend/remove |
| --- | --- | --- | --- | --- | --- |
| Owner | yes | yes | any role | any role | any member, last-owner guard |
| Admin | yes | yes | non-owner/admin | non-owner/admin | non-owner/admin |
| Project lead | yes | yes | no | no | no |
| Contributor | yes | yes | no | no | no |
| Reviewer | yes | yes | no | no | no |
| Viewer | yes | yes | no | no | no |
| External reviewer | yes | no | no | no | no |

## Project authorization

Project roles are subordinate to active organization membership. A project role can
reduce access but cannot exceed the organization role's cap.

| Organization role | Allowed project roles | Automatic access |
| --- | --- | --- |
| Owner | Project lead, contributor, reviewer, viewer | Project lead on every project |
| Admin | Project lead, contributor, reviewer, viewer | Project lead on every project |
| Project lead | Project lead, contributor, reviewer, viewer | None; explicit membership except on projects they create |
| Contributor | Contributor, reviewer, viewer | None |
| Reviewer | Reviewer, viewer | None |
| Viewer | Viewer | None |
| External reviewer | Reviewer, viewer | None; always explicitly scoped |

Project leads manage project metadata and team assignments. Project leads and
contributors create, rename, move, archive, restore, and delete folders or document
records. Reviewers and viewers have read-only access. Owners and admins may create a
project-scoped external invitation; acceptance creates both the organization
membership and the capped project membership in one transaction.

UI visibility is convenience only. Organization and project permissions are
rechecked by API middleware and transactional mutations. Cross-tenant project paths
use the same not-found response as unknown resources.

## Session and abuse controls

- The browser receives an opaque HttpOnly, SameSite=Lax session cookie. Secure
  `__Host-` cookies are mandatory in production.
- Sessions have configurable idle and absolute expiry, are revoked on logout, and are
  revoked when the active membership is suspended or removed.
- Mutations require the session-bound CSRF token returned by `/v1/me` and an exact
  configured web origin.
- Login, callback, local identity, invitation creation, and invitation acceptance have
  endpoint rate limits.
- Invitation and OIDC transaction values are stored only as SHA-256 hashes and are
  consumed atomically to reject replay.
- Production requires SMTP delivery and refuses to return invitation tokens. Local
  development may expose a one-time link for testing.

## Audit events

Audit records contain actor, organization, action, target identifier/type, result,
request ID, timestamp, and low-risk policy metadata. They do not contain tokens,
  document contents, or invitation email bodies. Events cover organization creation,
  login/logout/failure, invitation creation/acceptance/delivery failure, role changes,
  suspension/reactivation/removal, project/folder/document mutations, project-team
  changes, permission denial, and cross-tenant denial.
