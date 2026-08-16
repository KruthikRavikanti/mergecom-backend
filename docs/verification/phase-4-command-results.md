# Phase 4 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, PostgreSQL `17.11`, and MinIO
`RELEASE.2025-09-07T16-13-09Z`.

## Clean database and storage

- The Phase 4 migration completed against a newly created empty PostgreSQL database.
- The development seed completed twice without duplicating records and creates a
  default `main` branch for every seeded document.
- The real-storage suite used a private MinIO bucket, removed test objects between
  scenarios, and completed without infrastructure skips.
- Staged and permanent object keys were inspected through the API behavior; user
  filenames are retained as metadata and do not appear in object keys.

## Passing checks

- The root `pnpm verify` gate passed formatting, lint, strict types, unit tests,
  PostgreSQL/MinIO integration tests, production builds, the production-bundle scan,
  and default Playwright coverage.
- API unit tests passed 16 tests. The web passed 7 tests, the shared UI, Office core,
  and worker each passed 1 test, and the .NET document engine passed 2 tests.
- Real API integration suites passed 25 tests with no infrastructure skips; 6 are
  Phase 4 artifact/version scenarios. The worker integration test also passed.
- Playwright passed 38 route and workflow checks across desktop and mobile Chromium.
  Four opt-in live tests were skipped by the default gate as designed.
- The gated live artifact Playwright scenario passed separately in desktop Chromium
  against the real API, PostgreSQL database, and MinIO bucket.
- OpenAPI generation and contract type checking passed after adding upload,
  multipart, version history, download, and restore operations.
- The .NET release build completed with zero warnings and zero errors, and the
  production bundle contained no development authentication material.
- `pnpm audit --prod --audit-level high` passed with four moderate advisories below
  the blocking threshold. The document-engine NuGet graph reported no vulnerable
  packages.

## Artifact and graph proof

The real API suite uploads Office-package-shaped bytes through signed URLs and then
proves:

- duplicate finalization returns the same immutable version;
- a second upload advances `main`, while stale and simultaneous pushes are preserved
  as conflicted nodes without replacing the current head;
- an exact old-version download matches its recorded SHA-256 and original bytes;
- restoring that old version appends a new node and reproduces the same bytes;
- hash mismatch and invalid package bytes cannot create retained artifacts;
- users without project access cannot receive a signed download grant;
- signed download URLs expire and audit records do not contain signed URLs;
- interrupted multipart uploads can be aborted; and
- expiry/orphan cleanup removes disposable objects while retaining referenced
  artifact objects.

The live browser scenario creates a document, uploads distinct V1 and V2 packages,
downloads V1 byte for byte, restores V1 as V3, and verifies the immutable history in
the rendered UI.

With the API and web server connected to PostgreSQL and MinIO, repeat that proof with:

```bash
LIVE_PHASE4_E2E=true pnpm exec playwright test \
  tests/e2e/versions.live.spec.ts --project=desktop-chromium
```

## Deferred boundary

Version rows intentionally remain `pending_processing`. Office parsing, normalized
semantic extraction, previews, and worker-driven status transitions are Phase 5
work; Phase 4 does not simulate them.
