# Phase 12 command results

Verified on 2026-08-16 with Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK `10.0.400`,
and the repository dependency lock.

## Capture boundary

- Office core passed 27 unit cases for platform capability, descriptors, deterministic
  slice assembly, progress, SHA-256, size limits, wrong indexes, short/invalid data,
  abort, host/extension mismatch, closure, and `.xlsm` Mac refusal.
- The task-pane adapter passed six unit cases for host mapping, filename recovery,
  callback-to-promise bridging, exact capture, unsupported hosts, and Office errors.
- Word, Excel, and PowerPoint XML manifests each passed Microsoft
  `office-addin-manifest validate` schema and acceptance checks.

## Browser and build checks

- The HTTPS Office simulation passed eight desktop/mobile scenarios: exact Excel
  capture and download, Word-on-web refusal, `.xlsm`-on-Mac refusal, and an explicitly
  disabled browser preview.
- Successful browser capture requested every synthetic slice, closed the Office file
  once, emitted the exact SHA-256/size descriptor, and downloaded the source filename.
- Desktop and Pixel 7 screenshots were inspected without clipping, overlap, blank
  content, or horizontal overflow.
- The final root `pnpm verify` passed formatting, lint, strict types, JavaScript and
  75-case .NET unit suites, default integration startup checks, production builds,
  production-auth bundle policy, and 48 browser scenarios. Twenty-eight gated live
  scenarios, including Phase 12, were skipped by the default gate and run separately.
- The production pnpm audit and direct/transitive .NET audit reported no known
  vulnerabilities. Changed-file secret, debug/debt, manifest-permission, and
  whitespace scans passed.

## Repeat commands

```bash
pnpm --filter @mergecom/office-core test:unit
pnpm --filter @mergecom/office-addin test:unit
pnpm --filter @mergecom/office-addin manifest:validate
LIVE_PHASE12_E2E=true OFFICE_ADDIN_URL=https://127.0.0.1:5176 \
  pnpm exec playwright test tests/e2e/office-addin.live.spec.ts
pnpm verify
```
