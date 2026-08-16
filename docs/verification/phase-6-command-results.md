# Phase 6 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, PostgreSQL `17.11`, Redis `8.2.8`, and MinIO
`RELEASE.2025-09-07T16-13-09Z`.

## Migration and durability

- The Phase 6 migration completed against the existing Phase 5 database and a
  newly created empty database. Both contain the `version_comparisons` lifecycle,
  result, typed-change, version-contract, lease, and queue indexes and constraints.
- One authorized request persisted directional base and target versions plus an
  outbox event. An idempotent replay returned the same comparison, while a repeated
  worker delivery did not add a second completion event.
- The live flow completed from PostgreSQL intent through BullMQ, exact-object reads,
  SHA-256 verification, same-parser normalization, engine comparison, immutable
  result storage, transactional completion, API polling, and browser rendering.
- Comparison result keys are deterministic and collision checked. PostgreSQL records
  the result-object SHA-256 and stable hash without replacing either immutable source
  artifact or its historical normalized snapshot.

## Passing checks

- A frozen-lockfile install passed for all nine workspace projects.
- The final root `pnpm verify` gate passed formatting, ESLint, strict TypeScript,
  JavaScript/TypeScript unit tests, .NET tests, integration startup checks,
  production builds, the production-authentication bundle policy, and default
  Playwright coverage.
- JavaScript/TypeScript unit suites passed 31 tests: API 16, web 7, worker 6,
  Office core 1, and shared UI 1. The document engine passed 31 xUnit tests.
- The .NET release build completed with zero warnings and zero errors.
- Real PostgreSQL/MinIO API integration passed 26 of 26 tests. The worker's real
  PostgreSQL/object-storage/document-engine suite passed 2 of 2 tests, including
  comparison completion and duplicate delivery.
- Default Playwright passed 38 scenarios across desktop and mobile Chromium; 10
  infrastructure-gated scenarios were skipped by design.
- The gated Phase 6 comparison passed separately in desktop and mobile Chromium
  against the real API, PostgreSQL, Redis, MinIO, worker, and document engine.
- Desktop and Pixel 7 history/result screenshots were visually inspected. Long
  names, source references, result facts, filters, typed changes, and before/after
  values had no clipping, overlap, or page-level horizontal overflow.
- `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities.
  The complete NuGet graph reported no vulnerable packages.
- `git diff --check` passed, and the repository secret-pattern scan returned no
  private-key, access-token, or assigned-password matches.

## Semantic proof

The engine suite covers deterministic equality and stable hashes; changed PowerPoint
shape text, Excel cell content, Word paragraphs, and nested Word table text; nullable
equality under partial coverage; semantic truncation; current-version input checks;
bounded request input; internal-token denial; and malformed comparison requests.

Inspection remains read only and includes explicit partial coverage for unmodeled
notes, linked visuals, spreadsheet tables/charts/drawings, Word auxiliary stories,
images and tracked changes, custom XML, macros, signatures, external links, embedded
objects, binary parts, validation issues, and bounded semantic truncation.

## Repeat commands

Apply migrations to both the retained database and a fresh empty database:

```bash
DATABASE_URL=<database-url> pnpm --filter @mergecom/api db:migrate
```

Run infrastructure-backed suites with dedicated test database and bucket endpoints:

```bash
TEST_DATABASE_URL=<test-database-url> \
TEST_S3_ENDPOINT=<test-s3-endpoint> \
pnpm --filter @mergecom/api test:integration

TEST_WORKER_DATABASE_URL=<test-database-url> \
TEST_S3_ENDPOINT=<test-s3-endpoint> \
TEST_DOCUMENT_ENGINE_URL=http://127.0.0.1:3003 \
pnpm --filter @mergecom/worker test:integration

LIVE_PHASE6_E2E=true pnpm exec playwright test \
  tests/e2e/comparison.live.spec.ts
```

The live browser test creates two valid synthetic `.docx` packages through the
public upload boundary and waits for both ingestion and comparison to complete.
