# Phase 7 command results

Verified on 2026-08-16 with the pinned Node.js `24.18.1` and pnpm `11.22.0`
toolchain, .NET SDK `10.0.400`, PostgreSQL `17.11`, Redis `8.2.8`, and a live
MinIO-compatible object store.

## Migration and integrity

- Migration `0006_bored_james_howlett.sql` completed against the retained Phase 6
  database and a newly recreated empty `mergecom_phase7_fresh` database.
- The fresh database contains all five review tables and four database triggers for
  comparison/anchor integrity plus append-only decisions/comments.
- Composite foreign keys bind the approved pointer and every review aggregate edge to
  the same organization, document, request, version, comparison, assignment, or
  thread as applicable.
- Direct decision mutation was rejected with SQLSTATE `55000`. Exact comparison
  anchors are checked by both API queries and database triggers.

## Passing checks

- The final root `pnpm verify` gate passed formatting, ESLint, strict TypeScript,
  JavaScript/TypeScript unit tests, .NET tests, integration startup checks,
  production builds, production-authentication bundle policy, and default
  Playwright coverage.
- JavaScript/TypeScript unit suites passed 31 tests: API 16, web 7, worker 6,
  Office core 1, and shared UI 1. The document engine passed 31 xUnit tests.
- The .NET release build completed with zero warnings and zero errors.
- Real PostgreSQL/MinIO API integration passed 27 of 27 tests. The review scenario
  exercised idempotent request replay, tenant hiding, role denial, exact anchors,
  comments, resolution, append-only enforcement, approval, changes requested,
  closed-review rejection, audit events, and a monotonic approved pointer.
- Default Playwright passed 40 desktop/mobile scenarios; 12 infrastructure-gated
  scenarios were skipped by design.
- The gated Phase 7 workflow passed separately in desktop and mobile Chromium against
  the real API, PostgreSQL, Redis, MinIO, worker, and document engine.
- Desktop and Pixel 7 screenshots were visually inspected for owner and reviewer
  states plus approved history. Long document names, facts, decisions, discussions,
  comments, controls, and exact change paths had no overlap, clipping, blank state,
  or page-level horizontal overflow.
- `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities. The
  complete NuGet graph reported no vulnerable packages.
- `git diff --check` passed, and the current-tree secret-pattern scan found no private
  key or common access-token signature.

## Workflow proof

The live browser flow created a document, uploaded two synthetic valid `.docx`
packages, waited for clean ingestion, produced a persisted semantic comparison, and
requested review of the target version. It then changed identity from owner to the
assigned reviewer, created an exact change discussion, appended a reply, approved the
version, and changed back to the owner to verify the approved marker in history.

Approval retained the version and branch head, appended the reviewer decision, closed
the review, disabled further discussion changes, and advanced only the separate
approved-version pointer. A later review ending in changes requested left that pointer
unchanged.

## Repeat commands

```bash
DATABASE_URL=<retained-or-fresh-database-url> \
pnpm --filter @mergecom/api db:migrate

TEST_DATABASE_URL=<test-database-url> \
TEST_S3_ENDPOINT=<test-s3-endpoint> \
TEST_S3_ACCESS_KEY=<test-access-key> \
TEST_S3_SECRET_KEY=<test-secret-key> \
TEST_S3_BUCKET=<test-bucket> \
pnpm --filter @mergecom/api test:integration

pnpm verify

LIVE_PHASE7_E2E=true pnpm exec playwright test \
  tests/e2e/reviews.live.spec.ts
```
