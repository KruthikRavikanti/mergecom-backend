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
matching manifest. The manifests request `ReadAllDocument`, require `CompressedFile`,
and point their source and icon URLs at the local HTTPS server.

## Expected states

- `Office host`: Office.js initialized with a recognized host and platform.
- `Sign in`: no API session is available to the task pane.
- `Opening secure sign-in`: the pane has opened the same-origin Office dialog and is
  waiting for its one-use API session handoff.
- `Link document`: select an existing accessible MergeCom document of the matching
  Word, Excel, or PowerPoint type.
- `Based on latest`: the per-file base is the current branch head.
- `Base unverified` or `Behind latest`: the next push is expected to be preserved as
  a conflict rather than replacing latest.
- `Unavailable`: capture is disabled and the status line names the refusal reason.
- `Browser preview`: the page was opened outside Office; capture remains disabled.
- `Version finalized`: exact bytes reached immutable storage and the API created the
  version. Processing may still be queued or running.
- `Conflict preserved`: the incoming version exists, but the branch head did not
  move.

## Verification

Run the deterministic Office callback bridge and browser simulations with:

```bash
pnpm --filter @mergecom/office-core test:unit
pnpm --filter @mergecom/office-addin test:unit
LIVE_PHASE13_E2E=true OFFICE_ADDIN_URL=https://localhost:5176 \
  pnpm exec playwright test tests/e2e/office-addin.live.spec.ts
```

For a manual host check, use a non-confidential saved fixture for the matching host,
link it to a disposable document, push it, wait for processing, then download the
exact version from web history and compare SHA-256. Do not use production documents.

## Failure handling

- A certificate warning means local trust is incomplete. Regenerate/install with
  `office-addin-dev-certs`; never bypass TLS in Office.
- `Save this ... before linking it` means Office did not expose a recognized saved
  filename. Save the document with a supported extension and retry.
- A platform or VBA-signature refusal is intentional. Use a supported host/platform;
  do not substitute body OOXML or a reconstructed package.
- Slice, size, ZIP, or close errors invalidate the whole capture. Retry only after the
  Office document is stable; no partial result should be retained.
- `CSRF rejected` means the pane origin does not exactly match
  `OFFICE_ADDIN_ORIGIN`, or the API session is stale. Correct configuration and sign
  in again; do not broaden the origin policy.
- A sign-in dialog that closes before completion, returns an invalid message, or
  reports an expired handoff leaves the pane signed out. Retry sign-in; do not pass
  session cookies or handoff codes through document settings or query logs.
- A storage error in local HTTPS development usually means MinIO is unavailable or
  the `/blob` proxy target does not match `VITE_LOCAL_BLOB_ORIGIN`.
