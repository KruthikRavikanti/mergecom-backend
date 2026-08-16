# Immutable artifacts and versions

Phase 4 stores every uploaded Office package as immutable object bytes and records an
append-only version graph in PostgreSQL. Semantic Office parsing remains asynchronous;
new versions truthfully remain `pending_processing` until the Phase 5 ingestion worker
updates them.

## Upload protocol

1. An authorized contributor sends filename, size, SHA-256, and the version they
   opened as `baseVersionId`.
2. The API validates document compatibility, extension, size, organization quota,
   and base membership, then reserves an expiring staged upload.
3. Small files receive a short-lived signed `PUT`. Files at or above
   `UPLOAD_MULTIPART_THRESHOLD_BYTES` receive part sizing and one signed grant per
   requested part.
4. The browser uploads directly to private S3-compatible storage. Multipart uploads
   are explicitly completed with ordered part ETags.
5. Finalization streams the staged bytes, computes SHA-256, validates byte size and
   ZIP package magic, and derives the Office media type from validated content and
   extension. The client media type is metadata only.
6. Valid bytes are copied to a new opaque artifact key that was never signed for the
   client. A transaction creates artifact and version rows, updates the branch head
   with compare-and-swap, appends audit/outbox records, and creates the real queued
   processing job reference.

Finalization is idempotent across repeated keys and repeated attempts against the same
upload. A stale base creates a preserved `conflicted` version whose artifact remains
downloadable, but does not advance `main`.

## Download and restore

Download authorization is checked for the exact version before the API issues a
short-lived attachment URL. The response includes the expected SHA-256. Audit rows
record the version grant but never store or log the signed URL.

Restore never rewrites history. Restoring an old node creates a new
`pending_processing` node that reuses the old immutable artifact, points to the current
head as its parent/base, and becomes the new head only if the expected head still
matches.

## Storage lifecycle

- Object keys contain organization and random identifiers, never user filenames.
- Upload staging rows expire. Cleanup lists and aborts expired or orphaned multipart
  operations, and removes unreferenced objects only after an age threshold and a
  fresh database reference check.
- Ordinary cleanup never deletes keys referenced by retained artifacts.
- `artifacts`, `document_versions`, branch head, audit, processing job, and outbox
  writes share one PostgreSQL transaction.
- Metrics at `/metrics` expose finalized bytes, upload duration, finalization
  failures, conflict count, and object-store errors.

## Verification

The real-infrastructure suite requires both PostgreSQL and S3-compatible storage:

```bash
TEST_DATABASE_URL=postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom \
TEST_S3_ENDPOINT=http://localhost:9000 \
TEST_S3_ACCESS_KEY=mergecom-local \
TEST_S3_SECRET_KEY=mergecom-local-only \
pnpm --filter @mergecom/api test:integration
```

It covers duplicate finalization, hash mismatch, interrupted multipart cancellation,
unauthorized download, expired grants, stale and simultaneous pushes, restore, graph
pagination, audit/outbox records, and byte-for-byte download integrity.
