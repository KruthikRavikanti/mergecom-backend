# Phase status

## Phase 2: identity, tenancy, and organization RBAC

Status: implementation complete on `phase-2/identity-rbac`; pending owner review.

- [x] Drizzle schema and PostgreSQL migration cover users, immutable identity mappings, organizations, memberships, invitations, sessions, OIDC transactions, controlled owner grants, admission policies, and audit events.
- [x] Entra OIDC authorization code flow uses discovery, PKCE, state, nonce, issuer/audience/signature validation, verified email-domain claims, and automatic signing-key discovery.
- [x] Opaque HttpOnly sessions enforce idle/absolute expiry, logout revocation, origin-checked CSRF tokens, and suspended membership denial.
- [x] First-owner creation requires an operator-created, time-limited grant bound to exact issuer, tenant, subject, and verified email. Public self-service organization creation does not exist.
- [x] Owner, admin, project lead, contributor, reviewer, viewer, and external reviewer permissions are centralized in one policy module and rechecked by transactional mutations.
- [x] Current-user, organization switch, invitation create/accept, membership list, role change, suspension/reactivation, and removal endpoints are generated into the shared client.
- [x] Cross-tenant paths return the same not-found response as unknown resources and create denial audit events without querying or returning the foreign tenant.
- [x] Login-adjacent, development identity, invitation creation, and invitation acceptance endpoints are rate limited.
- [x] The web app uses a protected route loader and real session client with loading, error, logout, organization, invitation, team, settings, and administration states.
- [x] Local development seeds two organizations and every role without passwords or production secrets.

The remaining `apps/web/src/demo/` boundary contains only synthetic project and
version fixtures scheduled for Phase 3. It no longer supplies identity, memberships,
or current-user settings.

Configuration and the authorization matrix are documented in
`docs/security/identity-rbac.md`. Verification evidence is recorded in
`docs/verification/phase-2-command-results.md`.

## Phase 1: monorepo foundation and frontend migration

Status: implementation complete on `phase-1/monorepo-foundation`; pending owner review.

- [x] pnpm/Turborepo workspace and one root lockfile established.
- [x] Node.js 24.18.1, pnpm 11.22.0, and .NET SDK 10.0.400 pinned.
- [x] Word, PowerPoint, Excel, and Express prototypes moved under `legacy/` and excluded from active builds.
- [x] Web, shared Office add-in, API, worker, document engine, contracts, UI, Office core, and fixtures are buildable.
- [x] PostgreSQL, Redis, MinIO, bucket initialization, and Mailpit Compose services include health checks.
- [x] Web navigation uses real routes, protected deep links, explicit development demo auth, and generated health API types.
- [x] Prototype mock database, settings, control, project, and document-history modules were replaced by smaller feature boundaries.
- [x] Error boundary, route error, not-found, loading, toast, and accessible dialog states are present.
- [x] Vitest, xUnit, Testcontainers, and Playwright scaffolding is active; public and authenticated routes have desktop/mobile smoke tests.
- [x] CI covers formatting, lint, types, tests, builds, generated contracts, Compose configuration, and dependency scans.

The Phase 1 mock identity/member/settings boundary was removed in Phase 2. Only
synthetic project/version fixtures remain pending Phase 3.

Local verification evidence and known environment limits are recorded in
`docs/verification/phase-1-command-results.md`.

## Phase 0: security containment, repository normalization, architecture record

Status: current-tree containment and architecture record complete on `phase-0/security-normalization`; history rewrite intentionally deferred pending explicit owner approval.

Safety point:

- Original commit: `fb00ed1860a9ffcbda293e2e58818aa10ca288a3`
- Original/default branch: `main`
- Remote: `origin` at `https://github.com/KruthikRavikanti/Mergecom.git`
- Local annotated tag: `prototype-pre-rebuild-2026-08-15`
- The tag and Phase 0 branch have not been pushed.
- A pre-existing local edit to generated `saved_presentation.json` was preserved in a local stash named `phase0-local-backup-saved-presentation-2026-08-15`; it must not be pushed and may contain document data.

## Gate checklist

- [x] Dedicated branch and annotated local safety tag created before deletions.
- [x] Current-tree private key/certificate and generated Office JSON removed from tracking.
- [x] All 49,243 tracked `node_modules` files removed from the index.
- [x] Repository-wide ignore rules added.
- [x] Full document payload logging removed from server and add-in spike paths identified by the audit.
- [x] Legacy server requires explicit startup, uses generated certificates, and restricts development CORS in code.
- [x] As-is, gaps, target, version semantics, migration, exposure, and architecture decisions documented.
- [x] History-cleaning procedure prepared but not executed.
- [x] Generated localhost certificate chain and contained server behavior verified over HTTPS.
- [x] Final builds and acceptance scans recorded.

## Historical exposure

Current-tree deletion does not remove blobs from existing commits, the local safety tag, remote `main`, or the local backup stash. The old private key is treated as compromised and must never be reused. History cleaning requires owner approval immediately before rewrite/force-push; see `docs/runbooks/history-cleaning.md`.

## Manual/external follow-up

- Confirm the interactive macOS Keychain trust prompt before Office sideload testing. The generated chain and server were verified directly, but system trust was not claimed.
- Configure a monitored project-controlled private security reporting channel before any pilot.
- Review and accept the Phase 0 branch before committing/pushing it. Do not publish the local safety tag or generated-data stash.
- Coordinate history cleaning separately if the owner chooses to replace public history.

## Phase 1 entry gate

Phase 1 may begin after the owner accepts the ADRs and the Phase 0 branch. History rewrite may remain pending if its public exposure and coordination requirements are explicitly tracked; it is not permission to reuse historical material.

The owner's request to proceed with Phase 1 was treated as acceptance of this gate.
