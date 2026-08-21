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

The web app's **Office setup** page exposes the same host-specific manifest URLs and
non-secret readiness state. The development server serves each manifest at its root,
for example `https://localhost:5176/manifest.powerpoint.xml`.

### Mac desktop

Create the host-specific `wef` folder if it does not exist, place only the matching
manifest there, and restart the Office application:

| Application | Sideload folder |
| --- | --- |
| Word | `~/Library/Containers/com.microsoft.Word/Data/Documents/wef` |
| Excel | `~/Library/Containers/com.microsoft.Excel/Data/Documents/wef` |
| PowerPoint | `~/Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef` |

Use an add-in-only manifest in these folders; do not place a unified manifest there.

### Windows desktop

Create a local shared folder, add it as a trusted add-in catalog in the Office Trust
Center, place the matching manifest in that folder, and restart the Office host. Open
**Home > Add-ins > Advanced > SHARED FOLDER** and select MergeCom.

### Office on the web

Open the document, choose **Home > Add-ins > More Settings > Upload My Add-in**, and
upload the matching XML manifest. Browser upload is a sideload mechanism; exact
package capture still depends on the Office host/platform capabilities shown in the
task pane.

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
- `Save and compare`: capture and finalize the exact current package, resolve the
  approved or latest eligible baseline, request deterministic comparison, and open
  the web workspace. Existing ready versions are reused; source files are not
  reconstructed.
- `Conflict preserved`: the incoming version exists, but the branch head did not
  move.
- `Version retrieval`: choose an authorized immutable version. The branch head is
  selected initially; changing this selection does not change the current file base.
- `Open exact copy`: the pane downloads and verifies a clean `.docx`, `.xlsx`, or
  `.pptx`, then asks Office to create a separate file. Save that new file before
  linking or pushing it.
- `Download`: the Office browser opens the authorized exact original. This remains
  available when automatic open is refused for macro, size, scan, or API-support
  reasons.

## Verification

Run the deterministic Office callback bridge and browser simulations with:

```bash
pnpm --filter @mergecom/office-core test:unit
pnpm --filter @mergecom/office-addin test:unit
LIVE_PHASE14_E2E=true OFFICE_ADDIN_URL=https://localhost:5176 \
  pnpm exec playwright test tests/e2e/office-addin.live.spec.ts
```

For a manual host check, use a non-confidential saved fixture for the matching host,
link it to a disposable document, push it, wait for processing, select that version
in the pane, and exercise both `Open exact copy` and `Download`. Confirm open creates
a separate file and compare the download SHA-256 with the source. Do not use
production documents.

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
- A scan-status refusal is intentional. Wait for a clean result; do not automatically
  open pending, quarantined, or failed artifacts.
- Macro-enabled `.docm`, `.xlsm`, and `.pptm` versions and packages larger than 50
  MiB must use exact download. Do not strip macros or reconstruct a plain package.
- A byte-count, ZIP-signature, media-type, filename, or SHA-256 mismatch invalidates
  the pull. Do not open the response; inspect the API, object-store proxy, and audit
  records before retrying.
- A host API refusal means the installed Office build does not expose WordApi 1.3,
  ExcelApi 1.8, or PowerPointApi 1.1 as required for separate-file open. Use exact
  download and open the saved file normally.
