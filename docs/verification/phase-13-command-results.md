# Phase 13 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, PostgreSQL, MinIO, Redis, the document worker/engine, and the repository
dependency lock.

## Office and API boundaries

- The Office add-in passed 19 unit cases across host callback adaptation, Mac saved
  file-property fallback, strict dialog-message validation, Settings persistence,
  binding validation, URL-scoped base isolation, local signed-grant rewriting, exact
  single/multipart uploads, `office_addin` provenance, staged cleanup, cancellation,
  and original-error preservation.
- API startup and real PostgreSQL integration passed 24 cases, including exact Office
  CORS/CSRF acceptance, rejection of a lookalike hostile origin, one-use handoff
  exchange, pre-exchange session refusal, and replay rejection. Nine unrelated
  object-storage integration cases were skipped in that focused database-only run.
- Word, Excel, and PowerPoint manifests passed Microsoft's
  `office-addin-manifest validate` schema and acceptance checks with
  `ReadAllDocument` and `CompressedFile`.

## Live workflow

- Ten HTTPS Playwright cases passed across desktop Chromium and Pixel 7 profiles:
  signed-out state, one-use dialog handoff and replay rejection, unsupported
  Word-on-web refusal, browser preview, and the full exact Word push workflow.
- Each full workflow created a real project and Word document, captured every
  synthetic Office slice, persisted a non-secret binding, sent the upload through the
  HTTPS `/blob` proxy, finalized source `office_addin`, reached processing state
  `completed` and version status `ready`, then downloaded bytes identical to the
  source fixture with the same SHA-256.
- The Office file handle closed once during linking and once during push. Desktop and
  mobile screenshots were inspected without overlap, clipping, blank content, or
  horizontal overflow.
- Real Microsoft Office clients were not available in this environment; the manual
  Windows/Mac/web/iPad matrix remains required before a supported-client claim.

## Repository gate

- The final root `pnpm verify` passed formatting, lint, strict types, JavaScript unit
  suites, all 75 .NET document-engine tests, default integration startup checks,
  production builds, production-auth bundle policy, and 48 default browser cases.
  Thirty gated live scenarios were skipped by the default gate; the ten Phase 13
  scenarios were run separately against the live stack.
- `pnpm audit --prod` and the transitive NuGet vulnerability audit reported no known
  vulnerable production packages.

## Repeat commands

```bash
pnpm --filter @mergecom/office-addin test:unit
pnpm --filter @mergecom/office-addin manifest:validate
TEST_DATABASE_URL=postgresql://USER@127.0.0.1:55432/mergecom_phase13_test \
  pnpm --filter @mergecom/api test:integration
LIVE_PHASE13_E2E=true OFFICE_ADDIN_URL=https://localhost:5176 \
  pnpm exec playwright test tests/e2e/office-addin.live.spec.ts
pnpm verify
```
