# Office document binding and version push

Phase 13 connects exact Office package capture to the existing immutable artifact
and version graph. A pane success now means that the API finalized a version. Merely
reading bytes in the client is not shown as a successful push.

## Identity and origin boundary

- The pane uses the existing opaque HttpOnly session and obtains the CSRF token from
  `GET /v1/me`; it does not store access or refresh tokens.
- Sign-in starts an Office dialog on the add-in origin. After normal API-owned
  authentication, the dialog creates a two-minute handoff and sends it to the pane
  with an exact `targetOrigin`. The pane exchanges that code atomically for its own
  HttpOnly session; expired and replayed codes are rejected.
- API CORS and mutation CSRF accept only `WEB_ORIGIN` and the exact
  `OFFICE_ADDIN_ORIGIN`. Wildcards, suffix matching, and reflected origins are not
  used.
- Hosted web and add-in assets must share the application host used for the session
  proxy. Local development uses `https://localhost:5176/api` and an explicit Office
  origin while the API remains on HTTP behind Vite.
- Handoff values are stored only as hashes in the existing session store, are not
  valid session cookies before exchange, and are never written to Office Settings or
  browser storage. Authentication policy and final session issuance remain owned by
  the API.

## Binding and base rules

The Office `Settings` property bag contains only this versioned non-secret shape:

```json
{
  "schemaVersion": 1,
  "organizationId": "uuid",
  "projectId": "uuid",
  "documentId": "uuid",
  "documentKind": "presentation | spreadsheet | word_document"
}
```

The pane reauthorizes those identifiers and verifies the document kind every time it
starts. It never trusts a saved name, role, organization selection, branch head, or
artifact key.

The last verified base version is stored separately in browser storage under a key
derived from SHA-256 of the binding IDs and Office document URL. This avoids embedding
a changing base identifier into every captured OOXML package. Before use, the base
must still appear in the authorized server version list. The initial link compares
the exact current package hash with authorized version artifact hashes:

- an exact match establishes that version as the base;
- an empty document establishes a null base for its first version;
- an edited copy with no local base remains unbased;
- a copied or Save As file can recover a base only when its exact bytes match an
  authorized version.

An unbased or stale push is still uploaded, but finalization preserves it as an
incoming conflict and does not move the current branch head.

## Push protocol

1. Capture and hash the current compressed package through the bounded Office core.
2. Stop without creating a duplicate if its SHA-256 already belongs to a version.
3. Create an idempotent upload intent with the verified base, size, filename, media
   type, and SHA-256.
4. Upload one signed object or each signed multipart part with progress and abort
   support. Local HTTPS development proxies MinIO grants without changing hosted
   grants.
5. Complete multipart assembly when applicable and finalize with a new idempotency
   key, the user note, and source `office_addin`.
6. Cancel staged storage after capture/upload/finalize failure. Cleanup errors do not
   replace the original client error.
7. Poll the created version until processing completes, is quarantined, or fails.
   The pane shows a stale outcome as preserved, never as the latest version.

The API and object store independently verify byte count, hash, package signature,
tenant/document access, quota, base membership, and branch concurrency. The worker
and document engine continue to own safe OOXML inspection.

## Deliberate limits

- `Open in MergeCom` opens the authorized web history. Pull/open-latest and replacing
  an already open Office package are not implemented.
- The pane does not create projects or documents. Linking is an explicit selection
  among existing accessible records of the matching host type.
- Real Office client validation is still required for supported Windows, Mac, web,
  and iPad versions. Playwright verifies the host callback and network workflow, not
  Microsoft client embedding behavior.
