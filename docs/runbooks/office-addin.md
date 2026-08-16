# Office add-in runbook

## Start and validate

Use the pinned repository toolchain, then run:

```bash
pnpm --filter @mergecom/office-addin dev
pnpm --filter @mergecom/office-addin manifest:validate
```

`office-addin-dev-certs` creates and trusts localhost material in the developer's
home directory. No key or certificate belongs in the repository. The task pane must
be reachable at `https://localhost:5176` before sideloading.

## Sideload

Choose the manifest matching the application under test:

| Application | Manifest |
| --- | --- |
| Word | `apps/office-addin/manifest.word.xml` |
| Excel | `apps/office-addin/manifest.excel.xml` |
| PowerPoint | `apps/office-addin/manifest.powerpoint.xml` |

Use the application's normal developer add-in/sideload flow and load only the
matching manifest. The manifests request `ReadDocument`, require `CompressedFile`,
and point their source and icon URLs at the local HTTPS server.

## Expected states

- `Office host`: Office.js initialized with a recognized host and platform.
- `Exact OOXML`: the runtime, platform, extension, and saved-file checks allow
  capture.
- `Unavailable`: capture is disabled and the status line names the refusal reason.
- `Browser preview`: the page was opened outside Office; capture remains disabled.
- `Exact package captured`: all slices were assembled, hashed, and the Office file
  handle closed. This is not evidence of an API version.

## Verification

Run the deterministic Office callback bridge and browser simulations with:

```bash
pnpm --filter @mergecom/office-core test:unit
pnpm --filter @mergecom/office-addin test:unit
LIVE_PHASE12_E2E=true OFFICE_ADDIN_URL=https://127.0.0.1:5176 \
  pnpm exec playwright test tests/e2e/office-addin.live.spec.ts
```

For a manual host check, use a non-confidential saved fixture for the matching host,
capture it, and compare the displayed SHA-256 and downloaded byte count. Do not use
production documents; the task pane upload/session boundary is not implemented.

## Failure handling

- A certificate warning means local trust is incomplete. Regenerate/install with
  `office-addin-dev-certs`; never bypass TLS in Office.
- `Save this ... before capturing it` means Office did not expose a recognized saved
  filename. Save the document with a supported extension and retry.
- A platform or VBA-signature refusal is intentional. Use a supported host/platform;
  do not substitute body OOXML or a reconstructed package.
- Slice, size, ZIP, or close errors invalidate the whole capture. Retry only after the
  Office document is stable; no partial result should be retained.
