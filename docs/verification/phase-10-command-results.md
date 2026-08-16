# Phase 10 command results

Verified on 2026-08-16 with the pinned Node.js `24.18.1`, pnpm `11.22.0`,
and .NET SDK `10.0.400` toolchain against live PostgreSQL, Redis, MinIO-compatible
object storage, API, worker, and document-engine services.

## Migration and persistence

- Migration `0009_previous_ken_ellis.sql` completed from an empty database and
  from a retained Phase 8 schema. The fresh schema defaults merge schema and
  engine versions to `1.1.0` and requires non-null analysis for completed and
  manual-resolution outcomes.
- Both retained terminal merges were backfilled with analysis schema `1.0.0`.
  The upgrade check found two of two camelCase API contracts and zero stale
  engine-style backfill keys.
- Real API integration passed 32 of 32 tests against PostgreSQL and object
  storage. Real worker integration passed 3 of 3 tests against PostgreSQL,
  object storage, SMTP, and the document engine.
- Live pilot-on operations persisted `completed` with strategy
  `disjoint_powerpoint_slides`, two non-overlapping findings, no blockers, and
  a normally processed two-parent version 4. Live default-off operations
  persisted `manual_resolution_required` with the same durable eligibility
  analysis and no candidate.

## Engine safety boundary

- The document-engine suite passed 56 of 56 xUnit tests. Fixtures cover
  disjoint slides, disjoint same-slide shapes, compatible and incompatible
  overlap, deletion/edit and reorder/edit ambiguity, grouped shapes, charts,
  media, masters, layouts, themes, notes, relationships, embedded objects,
  macros, signatures, unknown parts, corrupt candidates, semantic-union
  verification, and untouched-part byte preservation.
- Candidate generation remained limited to text-only edits in stable unique
  shape IDs with stable slide and shape order, unchanged text-node structure,
  unchanged non-text markup, and byte-identical supporting package parts.
- Candidate completion required bounded package inspection, Open XML
  validation, semantic exact-union verification, and byte equality for every
  untouched package part. Failed candidates returned no candidate bytes.
- Worker configuration tests prove the global default-off switch, strict
  boolean parsing, canonical UUID allowlist parsing, deduplication, and the
  requirement that both the global switch and organization membership pass.

## Passing checks

- The final root `pnpm verify` gate passed Prettier/.NET formatting, ESLint,
  strict TypeScript, unit suites, integration startup suites, production
  builds, the production-authentication bundle policy, and browser tests. The
  release .NET build completed with zero warnings and zero errors.
- JavaScript/TypeScript unit suites passed: API 16, web 7, worker 16, Office
  core 1, and shared UI 1. The engine passed 56 tests.
- Default Playwright passed 46 desktop/mobile scenarios; 18 infrastructure-gated
  scenarios were skipped by design. The PowerPoint analysis mock scenario
  passed in both default viewports without exposing OOXML paths.
- The separately gated live PowerPoint workflow passed two desktop/mobile
  scenarios with the pilot enabled and two with the default-off gate. The
  enabled path published version 4; the disabled path generated no candidate
  and did not mark findings automatically resolved.
- A follow-up download check uses positioned, explicitly styled text boxes,
  downloads merged version 4 through the web UI, decompresses the returned
  package, and verifies both merged slide strings and nonzero shape dimensions.
- Desktop, Pixel 7, and narrow PowerPoint task-pane screenshots were visually
  inspected. Analysis groups, source download actions, stale-base actions,
  long labels, and status content had no clipping, overlap, blank state, or
  page-level horizontal overflow.
- OpenAPI client regeneration produced the same SHA-256 before and after
  generation. `git diff --check`, changed-file secret-pattern scanning, and
  changed-file debt/debug scanning passed.
- `pnpm audit --prod --audit-level moderate` reported no known vulnerabilities.
  Both .NET projects reported no vulnerable direct or transitive packages.

The Docker CLI was not available in the host shell for a final Compose
configuration-only check. This did not block the real infrastructure suites or
live browser workflows, which exercised the already-running services.

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

pnpm verify

LIVE_PHASE10_E2E=true pnpm exec playwright test \
  tests/e2e/powerpoint-merge.live.spec.ts

LIVE_PHASE10_E2E=true LIVE_PHASE10_AUTOMERGE=true \
pnpm exec playwright test tests/e2e/powerpoint-merge.live.spec.ts
```
