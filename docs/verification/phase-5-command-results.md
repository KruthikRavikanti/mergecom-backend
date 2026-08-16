# Phase 5 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, PostgreSQL `17.11`, Redis `8.2.8`, and MinIO
`RELEASE.2025-09-07T16-13-09Z`.

## Migration and durability

- The Phase 5 migration completed against both the existing Phase 4 database and
  a newly created empty database. Legacy processing states migrated to the new
  explicit lifecycle without dropping version jobs.
- A finalized upload completed from durable PostgreSQL intent through BullMQ,
  immutable object retrieval, engine inspection, snapshot object storage, and
  transactional version completion.
- With the worker stopped, a new upload remained `queued` with zero attempts and
  no snapshot. Starting a fresh worker recovered it and completed attempt one.
- Duplicate delivery could not claim a terminal job and did not add another
  normalized snapshot.
- Two independently uploaded copies of the same fixture produced identical stable
  hashes and identical snapshot SHA-256 values for parser/schema `1.0.0`.
- Existing expired leases recovered to retry or durable `lease_exhausted` failure
  according to their attempt bound. PostgreSQL remained authoritative while Redis
  used append-only persistence.

## Passing checks

- A frozen-lockfile install passed for all nine workspace projects.
- The final root `pnpm verify` gate passed formatting, ESLint, strict TypeScript,
  JavaScript/TypeScript unit tests, .NET tests, integration startup checks,
  production builds, the production-authentication bundle policy, and default
  Playwright coverage.
- JavaScript/TypeScript unit suites passed 30 tests: API 16, web 7, worker 5,
  Office core 1, and shared UI 1. The document engine passed 22 xUnit tests.
- The .NET release build completed with zero warnings and zero errors.
- Real PostgreSQL/MinIO API integration passed 25 of 25 tests. The worker's real
  PostgreSQL/object-storage/document-engine suite passed 2 of 2 tests, including
  duplicate delivery.
- Default Playwright passed 38 scenarios across desktop and mobile Chromium; 8
  infrastructure-gated scenarios were skipped by design.
- The gated Phase 5 browser flow passed separately in desktop and mobile Chromium
  against the real API, PostgreSQL, Redis, MinIO, worker, and document engine.
- Desktop `1280x720` and Pixel 7 mobile screenshots were visually inspected after
  completion. Status, parser/schema metadata, hashes, support trace, notification,
  and controls had no clipping, overlap, or horizontal overflow.
- `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities
  after moving React Router to `7.18.2` and BullMQ's transitive `uuid` to `11.1.1`.
  The complete NuGet graph reported no vulnerable packages.

## Package-defense proof

The engine suite covers valid deterministic PowerPoint, Excel, and Word inventory;
internal-token denial; source hashing; temporary-directory cleanup; macro, digital
signature, external-link, binary, and embedded-object detection; literal and encoded
part traversal; unsafe relationship targets; duplicate/excessive parts; compression
bombs; expanded-size and XML-depth limits; DTD/XXE; malformed content types;
encrypted packages; and corrupt ZIP input. Feature content is detected but never
executed, followed, or opened.

The repository commits one minimal synthetic `.docx` fixture. Adversarial packages
are generated during tests so active macros, external resources, and embedded
objects are not retained as source artifacts.

## Repeat commands

Run infrastructure-backed suites with dedicated test database and bucket endpoints:

```bash
TEST_DATABASE_URL=<test-database-url> \
TEST_S3_ENDPOINT=<test-s3-endpoint> \
pnpm --filter @mergecom/api test:integration

TEST_WORKER_DATABASE_URL=<test-database-url> \
TEST_S3_ENDPOINT=<test-s3-endpoint> \
TEST_DOCUMENT_ENGINE_URL=http://127.0.0.1:3003 \
pnpm --filter @mergecom/worker test:integration

LIVE_PHASE5_E2E=true pnpm exec playwright test \
  tests/e2e/ingestion.live.spec.ts --grep "visible versioned snapshot"
```

The offline-worker scenario is additionally gated by
`LIVE_PHASE5_RESTART_E2E=true` and must be run only while an operator intentionally
controls worker shutdown and restart.
