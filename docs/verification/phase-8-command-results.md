# Phase 8 command results

Verified on 2026-08-16 with the pinned Node.js `24.18.1` and pnpm `11.22.0`
toolchain, .NET SDK `10.0.400`, PostgreSQL `17.11`, Redis `8.2.8`, and a live
MinIO-compatible object store.

## Migration and integrity

- Migration `0007_fluffy_photon.sql` completed against the retained Phase 7 database
  and a newly recreated empty `mergecom_phase8_fresh` database.
- The fresh `merge_operations` table has 20 PostgreSQL constraints and eight indexes.
  Composite foreign keys bind its branch, three source versions, and optional result
  to the same organization and document. Checks enforce distinct inputs, hash shape,
  candidate field coherence, tenant-scoped object keys, and terminal outcomes.
- Live integrity queries found zero cross-scope merge edges, zero malformed completed
  two-parent versions, and zero missing or duplicate terminal outbox events across six
  completed and four manual-resolution operations.

## Passing checks

- The final root `pnpm verify` gate passed formatting, ESLint, strict TypeScript,
  JavaScript/TypeScript unit tests, .NET tests, integration startup checks, production
  builds, production-authentication bundle policy, and default Playwright coverage.
- JavaScript/TypeScript unit suites passed 33 tests: API 16, web 7, worker 8, Office
  core 1, and shared UI 1. The document engine passed 36 xUnit tests.
- The .NET release build completed with zero warnings and zero errors.
- Real PostgreSQL/MinIO API integration passed 28 of 28 tests. Merge coverage proved
  a graph-valid request, idempotent replay, tenant hiding, invalid-head denial,
  unavailable-candidate denial, audit evidence, and transactional outbox evidence.
- Real worker integration passed both startup and durable pipeline tests. The pipeline
  proved candidate publication, a two-parent version, normal ingestion to ready,
  duplicate-delivery no-op behavior, and over-quota candidate retention without a
  branch or history advance.
- Default Playwright passed 40 desktop/mobile scenarios; 14 infrastructure-gated
  scenarios were skipped by design.
- The gated Phase 8 workflow passed separately in desktop and mobile Chromium against
  the real API, PostgreSQL, Redis, object store, worker, and document engine.
- Desktop and Pixel 7 automatic/manual screenshots were visually inspected. Long
  document names, version facts, status panels, evidence, warnings, and download
  controls had no overlap, clipping, blank state, or page-level horizontal overflow.
- `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities. Both
  .NET projects reported no vulnerable direct or transitive packages.
- `git diff --check` passed. Current-tree private-key, common access-token, debt-marker,
  and payload-log scans found no new exposure or deferred implementation markers.

## Workflow proof

The live browser flow used two pages with the same authenticated session to create
genuine stale writes. Version 2 changed the first Word paragraph while retained
version 3 changed the second. Their explicit common base was version 1. The merge
published a validated candidate as version 4, recorded version 2 as its primary
parent and version 3 as its merge parent, advanced the branch, and completed normal
semantic ingestion.

Two pages then edited version 4. Version 5 and retained version 6 both changed the
first paragraph. The second merge stopped as `manual_resolution_required`, generated
no candidate, left version 5 as the latest team version, and offered authorized exact
downloads for both retained inputs.

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

TEST_WORKER_DATABASE_URL=<test-database-url> \
TEST_S3_ENDPOINT=<test-s3-endpoint> \
TEST_S3_ACCESS_KEY=<test-access-key> \
TEST_S3_SECRET_KEY=<test-secret-key> \
TEST_S3_BUCKET=<test-bucket> \
TEST_DOCUMENT_ENGINE_URL=<document-engine-url> \
pnpm --filter @mergecom/worker test:integration

pnpm verify

LIVE_PHASE8_E2E=true pnpm exec playwright test \
  tests/e2e/merge.live.spec.ts
```
