# Phases 16-25 command results

Date: 2026-08-21

Branch: `main`

## Results

- PostgreSQL migrations `0011_famous_oracle.sql` and `0012_wooden_madrox.sql`
  applied to the local development database. API readiness reported PostgreSQL and
  object storage ready; worker readiness reported PostgreSQL, Redis, object storage,
  document engine, and rendition engine ready.
- The native LibreOffice/qpdf spike rendered the sanitized Word fixture in 5.835
  seconds to 18,124 bytes and one page, Excel in 1.671 seconds to 20,743 bytes and
  two pages, and PowerPoint in 1.650 seconds to 18,814 bytes and three pages. Repeat
  renders preserved page counts and dimensions. PDF bytes may differ because of
  generated metadata and are not used as the cache identity.
- The rendition-engine suite passed 11 unit tests and 14 real integration tests.
  The integration suite rendered Word, Excel, and PowerPoint twice through the
  installed toolchain and rejected corrupt, external-relationship, and macro-enabled
  packages. Additional unit coverage rejects encryption, traversal, archive limits,
  malformed relationships, invalid PDF actions, and output-integrity failures.
- API integration passed six files and 34 tests against isolated PostgreSQL and
  MinIO state. Coverage includes ingestion gating, idempotency, tenant-private cache
  reuse, one outbox dispatch, private inline grants, project denial, reference-safe
  cleanup, and authenticated viewer telemetry.
- Worker integration passed three files and three tests against PostgreSQL, MinIO,
  the document engine, and the real rendition engine. Coverage includes durable
  completion, duplicate delivery, expired-lease recovery, output verification, and
  terminal rendition quota failure.
- The root unit command passed 140 JavaScript/TypeScript tests and 76 .NET document
  engine tests. Formatting, lint, strict TypeScript, four deployment contract tests,
  the release build, and the production-auth bundle policy passed.
- Default Playwright coverage passed 72 desktop, tablet, and mobile Chromium
  scenarios; 45 explicitly gated infrastructure scenarios were skipped. The live
  visual-comparison scenario separately passed on all three profiles using real
  upload, inspection, comparison, rendition, private grants, PDF.js canvases,
  structured views, stable change links, screenshots, and `204` viewer telemetry.
  Browser checks found no horizontal overflow.
- The production pnpm audit and direct/transitive .NET audit reported no known
  vulnerable packages. The renderer XML parser was raised to the patched pinned
  `5.7.0` release after the audit identified entity-processing advisories in the
  initial spike version.

## Environment

- Node.js: `26.5.1` (the repository and CI pin `24.18.1`)
- pnpm: `11.22.0`
- .NET SDK: `10.0.400`
- LibreOffice: `26.2.5.2`
- qpdf: `12.4.0`

The local Node version produced the expected engine warning. Docker is not installed
on this machine, so local rendition-image construction and `docker compose config`
could not run. Deployment contract tests validate the six-image topology, and CI
owns Compose expansion and Dockerfile build checks. A real pilot organization,
external alert routing, backup drill, Office-host smoke test, and operator sign-off
remain release gates; visual comparison is disabled by default in production.

## Commands

```text
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:deployment
pnpm test:unit
TEST_DATABASE_URL=... TEST_S3_ENDPOINT=... pnpm --filter @mergecom/api test:integration
TEST_WORKER_DATABASE_URL=... TEST_S3_ENDPOINT=... TEST_DOCUMENT_ENGINE_URL=... TEST_RENDITION_ENGINE_URL=... pnpm --filter @mergecom/worker test:integration
RUN_RENDITION_ENGINE_INTEGRATION=true pnpm --filter @mergecom/rendition-engine test:integration
pnpm build
pnpm test:e2e
LIVE_PHASE6_E2E=true pnpm exec playwright test tests/e2e/comparison.live.spec.ts
pnpm audit --prod
dotnet list services/document-engine/MergeCom.DocumentEngine.sln package --vulnerable --include-transitive
git diff --check
```
