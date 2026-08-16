# Phase 11 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, and .NET SDK
`10.0.400` against live PostgreSQL, Redis, MinIO-compatible object storage, API,
worker, document engine, web, and Office task-pane services.

## Migration and persistence

- Migration `0010_lying_morgan_stark.sql` completed from an empty database and a
  retained Phase 10 database. Both resulting schemas contain 11 migrations and use
  merge schema/engine defaults `1.2.0`; two retained historical `1.1.0` terminal rows
  remained unchanged.
- Real API integration passed 32 of 32 tests. Real worker integration passed 3 of 3
  tests against PostgreSQL, object storage, Redis, SMTP, and the current engine.
- Pilot-off live runs persisted `manual_resolution_required` with
  `excel_automatic_merge_disabled`, technical eligibility, no candidate, no applied
  paths, and no result version. Pilot-on runs persisted `completed` with
  `disjoint_excel_cells`, two analyzed changes, one incoming applied path, and a
  normally processed two-parent version 4.

## Engine boundary

- The document-engine suite passed 75 of 75 tests. Excel coverage includes same-cell
  conflicts, compatible overlap, disjoint cells and worksheets, formulas, added
  cells, hidden worksheet structure, changed supporting features, authenticated pilot
  headers, semantic verification, and untouched-part byte preservation.
- Automatic merge accepts modified literal values in existing stable cells only.
  Formula, type, style, cell-set/order, worksheet structure, or supporting package
  changes stop candidate generation.
- Candidates copy ours, apply incoming-only approved cells, pass bounded inspection,
  Open XML validation, exact semantic-union comparison, and preserve every package
  part outside modified worksheets byte for byte.

## Browser and build checks

- Mocked browser routes passed 48 of 48 desktop/mobile scenarios. The Excel analysis
  scenario verifies pilot-disabled copy, cell findings, source actions, and no page
  overflow at a 390-pixel width.
- Separately gated live Excel workflows passed two desktop/mobile scenarios with the
  default-off gate and two with the pilot enabled. The pilot-on browser download was
  decompressed and contained both users' visible cell strings and the retained
  24-character column width. macOS Quick Look rendered those values in separate,
  visible cells from the actual browser-downloaded workbook.
- Desktop, Pixel 7, and narrow Excel task-pane screenshots were visually inspected;
  content wrapped without clipping, overlap, blank state, or horizontal overflow.
- The final root `pnpm verify` gate passed Prettier/.NET formatting, ESLint, strict
  TypeScript, unit suites, default integration startup checks, production builds,
  production-auth bundle policy, and 48 browser scenarios; 20 explicitly gated live
  scenarios were skipped by design. The release .NET build completed with zero
  warnings and zero errors.
- JavaScript unit suites passed API 16, web 7, worker 18, Office core 1, and shared UI
  1 tests. Production dependency audit reported no known npm vulnerabilities, both
  .NET projects reported no vulnerable direct or transitive packages, and
  changed-file secret/debt/debug scans plus `git diff --check` passed.

## Repeat commands

```bash
DATABASE_URL=<fresh-or-upgrade-database-url> \
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

LIVE_PHASE11_E2E=true pnpm exec playwright test \
  tests/e2e/excel-merge.live.spec.ts

LIVE_PHASE11_E2E=true LIVE_PHASE11_AUTOMERGE=true \
pnpm exec playwright test tests/e2e/excel-merge.live.spec.ts
```
