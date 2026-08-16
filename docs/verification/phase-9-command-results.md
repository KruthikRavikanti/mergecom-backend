# Phase 9 command results

Verified on 2026-08-16 with the pinned Node.js `24.18.1` and pnpm `11.22.0`
toolchain, .NET SDK `10.0.400`, PostgreSQL `17.11`, Redis `8.2.8`, and a live
MinIO-compatible object store.

## Migration and integrity

- Migration `0008_fast_sue_storm.sql` completed against the retained Phase 8
  database and a new empty `mergecom_phase9_fresh` database.
- The four fresh notification tables expose 28 constraints and 13 indexes. Composite
  foreign keys bind preferences to membership, dispatches and notifications to the
  same-tenant outbox source, and deliveries to the same-tenant notification.
- Lease, attempt, terminal-state, address, provider-ID, content, and uniqueness checks
  were present in the fresh schema.
- The retained environment completed 112 fanout dispatches and created 125 unique
  recipient notifications. All in-app deliveries completed; email remained
  preference-suppressed for the seeded accounts.
- Retained integrity queries found zero duplicate source/recipient notifications,
  zero supported events without dispatch evidence, and zero cross-tenant delivery
  links.

## Passing checks

- JavaScript/TypeScript unit suites passed: API 16, web 7, worker 13, Office core 1,
  and shared UI 1. The document engine passed 36 xUnit tests.
- Real PostgreSQL/MinIO API integration passed 32 of 32 tests, including notification
  preferences, verified-email enforcement, tenant hiding, recipient ownership,
  cursor pagination, read state, and audit evidence.
- Real worker integration passed 3 of 3 tests. Notification coverage used a real TCP
  SMTP exchange and proved current-scope fanout, actor exclusion, channel suppression,
  generic message content, deterministic provider ID, durable completion, and
  duplicate-delivery no-op behavior.
- Focused desktop and Pixel 7 Playwright passed the mock inbox/settings/read workflow
  and the separately gated live reviewer inbox/deep-link workflow.
- Desktop and mobile inbox screenshots were visually inspected with empty and dense
  retained data. Controls, badges, long rows, and deep links had no clipping, overlap,
  blank state, or page-level horizontal overflow.
- Root Prettier/.NET formatting, ESLint, strict TypeScript, production builds, and the
  production-authentication bundle policy passed. The release .NET build completed
  with zero warnings and zero errors.
- Default Playwright passed 44 desktop/mobile scenarios; 16 infrastructure-gated
  scenarios were skipped by design.
- `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities. Both
  .NET projects reported no vulnerable direct or transitive packages.
- `git diff --check` passed. Current-tree private-key, common access-token,
  debt-marker, debug-log, and payload-log scans found no new exposure or deferred
  implementation markers.

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

LIVE_PHASE9_E2E=true pnpm exec playwright test \
  tests/e2e/notifications.live.spec.ts --workers=1
```
