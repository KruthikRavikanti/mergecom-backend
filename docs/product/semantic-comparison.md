# Semantic comparison

Phase 6 compares two immutable versions of one document. A comparison is directional:
the older selected version is the base and the newer selected version is the target.
Creating or completing a comparison never mutates either version or its exact Office
artifact.

## Durable lifecycle

`POST /v1/organizations/{organizationId}/projects/{projectId}/documents/{documentId}/comparisons`
authorizes both versions, requires completed clean ingestion, rejects identical or
foreign-document inputs, and persists one idempotent `version_comparisons` row plus
an outbox event. The unique identity is base version, target version, comparison
schema, and parser version.

The worker dispatches the comparison through BullMQ, claims a PostgreSQL lease, and
hash-verifies both exact S3 artifacts. It regenerates normalized snapshots for both
inputs with parser/schema `1.1.0`, then calls the authenticated engine comparison
boundary. This allows old immutable artifacts to be compared under a current common
parser without rewriting their historical Phase 5 snapshots.

The immutable result object is written before one PostgreSQL transaction persists
the result and completion outbox event. Existing result keys must contain the same
SHA-256. Duplicate terminal deliveries cannot claim the row and are no-ops. Expired
leases, bounded retries, and terminal failure use the same lifecycle as ingestion.

## Result contract

Comparison schema `1.0.0` and engine `1.0.0` return:

- source hashes, Office file type, parser and schema versions, and a stable result hash;
- independent `byte_equal` and nullable `semantic_equal` values;
- `complete` or `partial` coverage with warnings;
- deterministic summary counts; and
- typed changes with stable ID, change type, category, impact, entity type, label,
  normalized path, and nullable before/after values.

Changes are `added`, `modified`, `moved`, or `removed`. Categories are `content`,
`structure`, `feature`, and `validation`. Result and change arrays are sorted before
hashing, and runtime values such as timestamps, leases, workers, or database IDs are
excluded from the stable basis.

## Equality and coverage

Byte equality means the two immutable artifact SHA-256 values match. Semantic
equality means no difference exists in the modeled normalized content. Different
bytes may be semantically equal when package metadata changes without a modeled
content change.

A partial comparison with no detected change returns `semantic_equal: null`, never
`true`. A detected modeled change returns `false` even when coverage is partial.
Unsupported features and validation issues remain visible in warnings and typed
feature/validation changes.

Current partial-coverage codes include semantic truncation, PowerPoint notes and
linked visual content, Excel table/chart/drawing content, Word auxiliary stories,
images and tracked-change semantics, custom XML, VBA macros, digital signatures,
external links, embedded objects, and unsupported binary parts.

## Product boundary

The history UI permits comparison only for clean versions whose ingestion completed.
The result UI reports processing attempts, failures, equality, coverage, stable hash,
warnings, and category-filtered persisted changes. Phase 6 does not add review
requests, comments, approval decisions, merge generation, or automatic conflict
resolution; those remain later phases.
