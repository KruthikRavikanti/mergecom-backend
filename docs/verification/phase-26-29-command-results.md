# Phases 26-29 command results

Date: 2026-08-21

Branch: `phase-29-guided-onboarding` (stacked on the committed Phase 26-28 branches)

## Results

- Migrations `0013_round_sprite.sql` through `0016_famous_psynapse.sql` applied
  successfully. Migration `0016` also applied from an empty isolated integration
  database through the normal Drizzle migrator.
- The idempotent synthetic provision command created one tenant-local `[SAMPLE]`
  project, six exact Office versions, and completed Word, Excel, and PowerPoint
  comparisons through signed MinIO uploads and the live worker/document-engine
  pipeline. An immediate rerun reused the same three comparison identifiers.
- Formatting, all nine workspace lint tasks, and strict TypeScript checks passed.
  The root format gate also normalized the generated Phase 28 migration snapshot.
- JavaScript/TypeScript unit suites passed 166 tests: API 39, web 17, Office add-in
  37, Office core 31, worker 30, rendition engine 11, and UI 1. Coverage includes
  Save and Compare, baseline policy, deterministic explanations, role-adapted
  onboarding, sample naming, feedback payload privacy, setup platform selection,
  tour keyboard/reduced-motion behavior, and comparison navigation.
- The .NET document engine passed 76 tests. The fixture generator compiled and
  generated sanitized Word, Excel, and PowerPoint sample pairs that the live worker
  processed successfully.
- API integration passed 34 tests against an isolated PostgreSQL database and
  dedicated MinIO bucket. Worker integration passed three tests against PostgreSQL,
  MinIO, the live document engine, and live rendition engine. Native rendition
  integration passed 14 tests, including repeated Word/Excel/PowerPoint conversion
  and corrupt/external-link/macro rejection.
- All four deployment configuration tests passed. Production builds passed for all
  nine workspaces and the .NET solution; the production bundle check found no
  development identity material. Vite emitted all three Office manifests at the
  add-in distribution root.
- Word, Excel, and PowerPoint manifests passed `office-addin-manifest validate`.
- Default Playwright coverage passed 87 desktop/tablet/mobile scenarios with 51
  explicitly gated infrastructure scenarios skipped. The Phase 29 live flow passed
  sample access, role adaptation, persisted dismiss/reopen, comparison guide,
  feedback submission, Office setup readiness, manifest selection, and zero document
  overflow in six live desktop/tablet/mobile scenarios.

## Environment

- Node.js: `26.5.1` (repository and CI pin `24.18.1`; commands emitted the expected
  engine warning)
- pnpm: `11.22.0`
- .NET SDK: `10.0.400`
- LibreOffice: `26.2.5.2`
- qpdf: `12.4.0`

Docker Desktop was unavailable for a new Compose/image invocation. Existing local
PostgreSQL, Redis, MinIO, API, worker, document engine, rendition engine, web, and
Office HTTPS services were healthy and backed the live tests. Deployment contract
tests and CI remain the image/topology gates.

A real installed Microsoft Office client was not controllable from this environment.
Manual host acceptance must still sideload each matching manifest, confirm compressed
package access for a named saved file, run Save and Compare, and open an exact old
version in Word, Excel, and PowerPoint. This is a release gate, not a claim made from
browser simulation.

## Commands

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:deployment
TEST_DATABASE_URL=... TEST_S3_ENDPOINT=... pnpm --filter @mergecom/api test:integration
TEST_WORKER_DATABASE_URL=... TEST_S3_ENDPOINT=... TEST_DOCUMENT_ENGINE_URL=... TEST_RENDITION_ENGINE_URL=... pnpm --filter @mergecom/worker test:integration
RUN_RENDITION_ENGINE_INTEGRATION=true pnpm --filter @mergecom/rendition-engine test:integration
pnpm --filter @mergecom/office-addin manifest:validate
pnpm build
pnpm test:e2e
pnpm demo:provision
LIVE_PHASE29_E2E=true pnpm exec playwright test tests/e2e/onboarding.live.spec.ts
git diff --check
```
