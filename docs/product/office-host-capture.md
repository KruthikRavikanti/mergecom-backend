# Office host exact package capture

Phase 12 replaces the static task-pane shell with a real Office.js capture boundary.
It captures the compressed OOXML package returned by the active Office host. It does
not reconstruct a file from body XML, worksheets, slides, or another semantic model.

## Support matrix

| Host | Windows | Mac | Office on the web | iPad | Android/Universal |
| --- | --- | --- | --- | --- | --- |
| Excel | `.xlsx`, `.xlsm` | `.xlsx`; `.xlsm` refused | Refused | Refused | Refused |
| PowerPoint | `.pptx`, `.pptm` | `.pptx`, `.pptm` | `.pptx`, `.pptm` | `.pptx`, `.pptm` | Refused |
| Word | `.docx`, `.docm` | `.docx`, `.docm` | Refused | `.docx`, `.docm` | Refused |

Every accepted combination also requires Office to report `CompressedFile 1.1`
support and a saved URL whose extension belongs to the active host. Excel `.xlsm` on
Mac is refused because Office omits VBA signature package parts there. Unknown or
new platforms are refused until verified.

## Capture contract

1. `Office.onReady` supplies the host and platform. The task pane does not trust URL
   parameters for a live host identity.
2. The adapter opens `Office.FileType.Compressed` with 64 KiB slices on iPad and 4
   MiB slices elsewhere.
3. The core validates positive safe file size and slice count, enforces the 100 MiB
   default limit before allocation, and requests every slice sequentially.
4. A wrong slice index, empty slice, byte overrun, short total, abort, invalid ZIP
   signature, or host/extension mismatch fails the entire capture.
5. The Office file handle is closed after success or failure. A close failure stops
   an otherwise successful result.
6. The complete byte array receives SHA-256, byte count, filename, media type, and
   source-host metadata. Partial bytes are never emitted as a captured package.

On success the pane emits a `mergecom:office-package-captured` `CustomEvent`. Its
detail is `{ bytes, descriptor }`, where `bytes` is the captured `Uint8Array` and the
descriptor carries `contentLength`, `fileName`, `mediaType`, `sha256`, and
`sourceHost`. The download control writes that same byte array to a local file.

## Deliberate limits

- Capture does not upload to the API, create an immutable version, or associate a
  document/base version. Those actions require an authenticated task-pane session
  and an explicit binding contract.
- Capture does not overwrite, clear, restore, or reopen the active Office document.
- The browser preview has no file provider. Its host query parameter only changes
  preview copy and never enables capture.
- ZIP-signature validation protects this client boundary; accepted API uploads still
  require normal size, hash, storage, and document-engine inspection before they are
  ready.
- The default 100 MiB cap intentionally matches the current artifact upload ceiling.
