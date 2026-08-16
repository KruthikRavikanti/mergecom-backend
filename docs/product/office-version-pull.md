# Office exact version retrieval

Phase 14 implements checkout/pull as retrieval of one explicitly selected immutable
artifact. It never rebuilds an Office file from a normalized snapshot, preview,
worksheet, slide, body XML, or another semantic model.

## Authorization and integrity

The linked pane loads versions only through the tenant- and project-scoped document
API. The current branch head is selected initially, but any listed version can be
chosen without changing the active file's base context.

Each open or download action creates a fresh CSRF-protected version download grant.
The API reauthorizes the exact organization, project, document, and version, records
the download audit, and returns a short-lived signed object URL with the expected
filename and SHA-256. The pane rejects a non-GET, expired, or metadata-mismatched
grant.

`Open exact copy` adds client-side verification before invoking Office:

1. Download the signed response as binary bytes with progress and cancellation.
2. Require the response length to equal the immutable artifact byte count.
3. Require an OOXML ZIP package signature and host-compatible extension/media type.
4. Compute SHA-256 over the complete response and require the artifact hash.
5. Invoke the matching Office API only after every check succeeds.

The direct `Download` action opens the authorized signed URL through the Office
browser boundary. Local development rewrites only the configured MinIO origin
through the task pane's HTTPS `/blob` proxy; hosted storage URLs are unchanged.

## Automatic open support

| Host | Automatically opened package | Requirement set |
| --- | --- | --- |
| Word | `.docx` | WordApi 1.3 |
| Excel | `.xlsx` | ExcelApi 1.8 |
| PowerPoint | `.pptx` | PowerPointApi 1.1 |

Automatic open also requires artifact scan status `clean` and a package no larger
than 50 MiB. The shared cap keeps base64 package transfer within the PowerPoint API
limit while bounding task-pane memory use.

Macro-enabled `.docm`, `.xlsm`, and `.pptm` packages are never converted or stripped;
they remain available through exact download. The same download-only behavior applies
to larger packages, pending/quarantined/failed scans, and Office builds without the
required host API.

## File and base behavior

Word creates and opens a new document, Excel creates a new workbook, and PowerPoint
creates a new presentation from the verified bytes. The currently open file is not
cleared, overwritten, closed, or assigned a different base.

The new Office file is a separate unsaved copy. Saving it establishes a different
document URL, so the original pane cannot safely assign the selected version as that
file's browser-scoped base. Opening a version therefore does not silently write base
state for either file. A later exact link-time hash match may recover a base; without
that proof, a push from the copy remains unbased and is preserved as a conflict.

## Deliberate limits

- Retrieval does not restore or move the branch head. Restore remains creation of a
  new version through the separate API workflow.
- The pane does not bypass package scan state for automatic open. Exact download
  retains the existing API authorization semantics.
- Microsoft client embedding behavior still requires manual validation on supported
  Word, Excel, and PowerPoint builds. Playwright verifies the callback/API protocol,
  exact bytes, and responsive task-pane states.
