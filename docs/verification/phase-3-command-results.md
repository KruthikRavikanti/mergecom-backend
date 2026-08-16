# Phase 3 command results

Verified on 2026-08-15 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, and PostgreSQL `17.11`.

## Clean database

- Both Phase 3 migrations completed against a newly created empty PostgreSQL
  database.
- The development seed completed twice without duplication.
- The resulting database contained 15 public tables, 2 organizations, 4 active
  projects, 2 active folders, 5 active document records, and 28 active project
  memberships covering all 4 project roles.
- The seed contains no versions or Office artifacts.

## Passing checks

- The root `pnpm verify` gate passed formatting, lint, strict types, unit tests,
  PostgreSQL integration tests, production builds, the production-bundle scan, and
  default Playwright coverage.
- API unit tests passed 13 tests, including project authorization policy checks.
- Real PostgreSQL API integration suites passed 19 tests with no infrastructure
  skips; 9 are Phase 3 project-resource scenarios.
- Web unit tests passed 7 routes, and strict web TypeScript and ESLint checks passed.
- Playwright passed 36 route and workflow checks across desktop and mobile Chromium.
  Coverage includes project creation, direct project/document/folder routes, nested
  breadcrumbs, project metadata updates, project-team access, login return paths,
  and responsive layouts.
- A gated live Playwright scenario passed separately in desktop and mobile Chromium
  against the seeded PostgreSQL database and real API.
- OpenAPI generation and contract type checking passed after adding all project,
  folder, document, archive, and project-team operations.
- `pnpm audit --prod --audit-level high` passed with four moderate advisories below
  the blocking threshold. The document-engine NuGet graph reported no vulnerable
  packages.

## Shared-state and tenant proof

The live Playwright scenario signs in an owner and admin from Organization A in two
independent browser contexts before project creation. The owner creates a project;
after refresh, the admin context reads the shared persisted row. A third context
signs in as Organization B's owner, opens the new project's direct URL, and receives
the same unavailable state as an unknown project. The scenario then soft-deletes its
temporary project.

With the seeded API and web server running, repeat that proof with:

```bash
LIVE_PHASE3_E2E=true pnpm exec playwright test tests/e2e/projects.live.spec.ts
```

The PostgreSQL API test independently repeats the two-session behavior at the HTTP
boundary. The first session creates a project with an idempotency key; replay returns
the same project, and the second session's list reads that persisted row.

An authenticated owner in Organization B requests Organization A's project list and
attempts a project write through Organization A's path. Both receive the same denial
shape as an unknown tenant, and the test verifies that no project row is inserted.

The same suite proves explicit external scope, organization-role caps, simultaneous
rename conflict behavior, folder-cycle rejection, and cross-project move rejection.

## Deferred boundary

Document records truthfully render `No versions yet`. Uploads, artifact bytes,
version graphs, exact-version downloads, and restore-as-new-version remain Phase 4
work and are not simulated by browser fixtures.
