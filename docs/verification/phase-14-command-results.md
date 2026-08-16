# Phase 14 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK
`10.0.400`, PostgreSQL, MinIO, Redis, the document worker/engine, and the repository
dependency lock.

## Office retrieval boundaries

- The Office core passed 31 unit cases, including exact retrieved-package length,
  ZIP signature, descriptor, and SHA-256 verification.
- The Office add-in passed 33 unit cases across signed binary download progress,
  cancellation, wrong-size refusal, grant method validation, Word/Excel/PowerPoint
  separate-file APIs, runtime requirement gates, macro and 50 MiB refusals, capture,
  binding, base context, authentication, and push behavior.
- Word, Excel, and PowerPoint manifests passed Microsoft's
  `office-addin-manifest validate` schema and acceptance checks.

## Live round trip

- Ten HTTPS Playwright cases passed across desktop Chromium and Pixel 7 profiles:
  signed-out state, one-use dialog handoff and replay rejection, unsupported
  Word-on-web refusal, browser preview, and the full exact Word round trip.
- Each full workflow created a real project and Word document, captured and pushed
  the source fixture, reached clean completed processing, selected V1 in the pane,
  retrieved it through the HTTPS `/blob` proxy, verified it, and opened it through
  the Word separate-document API mock.
- The pane's direct `Download` action produced another authorized proxied URL. Bytes
  from both the open-copy path and the direct download were identical to the source
  fixture. Desktop and mobile screenshots were inspected without overlap, clipping,
  blank content, or horizontal overflow.
- Real Microsoft Office clients were not available in this environment; manual
  validation of supported Word, Excel, and PowerPoint builds remains required.

## Repository gate

- The final root `pnpm verify` passed formatting, lint, strict types, JavaScript unit
  suites, all 75 .NET document-engine tests, default integration startup checks,
  production builds, production-auth bundle policy, and 48 default browser cases.
  Thirty gated live scenarios were skipped by the default gate; the ten Phase 14
  Office scenarios were run separately against the live stack.
- `pnpm audit --prod --audit-level moderate` and the transitive NuGet vulnerability
  audit reported no known vulnerable production packages.

## Repeat commands

```bash
pnpm --filter @mergecom/office-core test:unit
pnpm --filter @mergecom/office-addin test:unit
pnpm --filter @mergecom/office-addin manifest:validate
LIVE_PHASE14_E2E=true OFFICE_ADDIN_URL=https://localhost:5176 \
  pnpm exec playwright test tests/e2e/office-addin.live.spec.ts
pnpm verify
pnpm audit --prod --audit-level moderate
dotnet list services/document-engine/MergeCom.DocumentEngine.sln package \
  --vulnerable --include-transitive
```
