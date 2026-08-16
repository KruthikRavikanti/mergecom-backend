# Phase status

## Phase 4: immutable artifact storage and version graph

Status: implementation complete on `phase-4/artifact-versioning`; pending owner review.

- [x] PostgreSQL migrations cover opaque artifacts, default document branches, immutable version graph nodes, staged uploads, processing job references, and transactional outbox events.
- [x] S3-compatible `BlobStore` and MinIO implementation provide private signed upload/download, byte streams, copy-to-immutable keys, multipart grants/completion/abort, object listing, and readiness.
- [x] Upload intents validate extension, document compatibility, maximum size, serialized organization quota reservations, and base membership without trusting client media types.
- [x] Finalization recomputes SHA-256 and size, validates ZIP magic, is idempotent, and atomically writes artifact, version, branch head, audit, processing, and outbox state.
- [x] Branch locking and compare-and-swap preserve stale and simultaneous uploads as explicit conflicts without changing the latest team version.
- [x] Authorized exact-version downloads return the expected SHA-256; restore appends a new node reusing the selected artifact and never mutates intermediate history.
- [x] Expiry and orphan cleanup are reference checked and do not delete retained artifacts. Prometheus metrics cover bytes, duration, failures, conflicts, and storage errors.
- [x] The web history uses the generated contract for direct upload progress, multipart completion, processing/conflict/failure states, exact download, and restore-as-new-version.
- [x] Real PostgreSQL/MinIO tests cover duplicate finalize, mismatch, interrupted multipart, authorization, expiry, stale/simultaneous pushes, restore, and exact bytes. Desktop/mobile Playwright covers history and upload states.

The protocol and lifecycle are documented in
`docs/product/artifact-versioning.md`. Verification evidence is recorded in
`docs/verification/phase-4-command-results.md`.

## Phase 3: projects, teams, folders, and documents

Status: implementation complete on `phase-3/projects-documents`; pending owner review.

- [x] Tenant-linked projects, project memberships, folders, documents, archive state, soft deletion, ordering, and idempotency records are covered by PostgreSQL migrations.
- [x] Composite foreign keys and a recursive database trigger reject cross-project parents and folder cycles.
- [x] Project, folder, document, archive, and team APIs use stable cursor pagination, idempotent creates, input validation, consistent errors, and optimistic concurrency timestamps.
- [x] Project roles are capped by active organization roles; owners/admins have automatic lead access and external reviewers always require explicit project scope.
- [x] Project-scoped invitations atomically establish organization and project memberships on acceptance.
- [x] The web dashboard, project content, nested breadcrumbs, team view, archives, destructive confirmations, and document metadata use the generated API client and query cache.
- [x] Fake project, team, folder, and document adapters were removed. Phase 4 later replaced the truthful empty history state with real immutable versions.
- [x] Audit events cover successful mutations and denied/failed project operations.
- [x] Real PostgreSQL tests cover two-session shared state, tenant denial, role caps, cycle and cross-project rejection, simultaneous rename conflicts, archive/restore/delete, audits, and cursor stability.
- [x] Desktop and mobile Playwright checks cover real project routes, nested folders, project creation, document metadata, and project teams.

The resource contract and lifecycle are documented in
`docs/product/projects-folders.md`. Verification evidence is recorded in
`docs/verification/phase-3-command-results.md`.

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

The synthetic project and version boundary retained at the end of Phase 2 was
removed in Phase 3.

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

The Phase 1 mock identity/member/settings boundary was removed in Phase 2. The
remaining project/version fixture boundary was removed in Phase 3.

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
