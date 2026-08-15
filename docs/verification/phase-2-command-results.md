# Phase 2 command results

Verified on 2026-08-15 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, and PostgreSQL `17.11`.

## Clean database

- `db:migrate` completed against a newly created empty PostgreSQL database.
- `db:seed` created two development organizations and users covering all seven
  organization roles.
- The resulting database contained 10 public Phase 2 tables, 2 organizations,
  and 7 distinct seeded roles.

## Passing checks

- The root formatting, ESLint, strict TypeScript, unit test, integration test,
  production build, production-bundle scan, and Playwright workflow passed.
- JavaScript/TypeScript unit suites passed 20 tests across the API, web app,
  worker, Office core, and shared UI. The document engine passed 2 xUnit tests.
- Real PostgreSQL integration suites passed 10 API tests and 1 worker startup
  test with no infrastructure skips.
- The identity integration suite covered tenant-scoped reads and writes,
  suspended access, expired and replayed invitations, role escalation, CSRF,
  role and status transitions, session revocation and expiry, and disabled
  identities.
- Claim validation tests rejected an altered issuer, a missing immutable subject,
  and an unverified email claim.
- Playwright passed 28 public and authenticated route checks across desktop and
  mobile Chromium, including login return paths and the admin experience.
- Screenshots at `1440x900` and `390x844` showed no page-level horizontal
  overflow or incoherent overlap on login and organization administration.
- `pnpm audit --prod --audit-level high` passed after upgrading Nodemailer; four
  moderate advisories remain below the repository's blocking threshold.
- The document-engine NuGet graph reported no vulnerable packages.
- The production scan confirmed that development identity names and local login
  behavior are absent from the production web bundle.

## Tenant denial proof

An authenticated owner in Organization A requested Organization B's membership
list and attempted to create an invitation in Organization B. Both paths returned
the same `404` response shape used for an unknown organization:

```json
{"code":"not_found","message":"Resource not found."}
```

The write test also verified that no invitation row was inserted. Denied requests
are written to the security audit log without exposing whether the target tenant
exists.

## Remaining fixtures

Deferred project and version data remains behind the explicit
`VITE_ENABLE_DEMO_DATA` development adapter. Authentication, current-user,
organization, membership, invitation, profile, team, and administration data no
longer use browser storage or mock identity state. Project, folder, document, and
version persistence moves to the Phase 3 and Phase 4 APIs.
