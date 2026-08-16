# Secure OOXML ingestion

Phase 5 inspects immutable `.pptx`, `.pptm`, `.xlsx`, `.xlsm`, `.docx`, and
`.docm` artifacts asynchronously. PostgreSQL is the durable source of job intent,
BullMQ/Redis provides delivery and retry scheduling, and the internal ASP.NET Core
engine uses Open XML SDK `3.5.1` in read-only mode.

## Durable lifecycle

Finalizing or restoring a version creates one `semantic_ingestion` job in the same
transaction as the version and outbox event. The worker dispatches that row with its
UUID as the BullMQ job ID. A delivery must claim the PostgreSQL row before reading
the object. Duplicate or terminal deliveries cannot claim it and are no-ops.

States are `queued`, `running`, `retryable_failed`, `permanently_failed`,
`quarantined`, and `completed`. Jobs receive at most three attempts with exponential
backoff. A running job heartbeats its lease; expired leases are returned to retry or
moved to `permanently_failed` with `lease_exhausted` after the final attempt. Terminal
failures are the dead-letter record and are not deleted from PostgreSQL or Redis.

Successful inspection writes one immutable snapshot object and one compact
`normalized_snapshots` row per version. The object key is derived from organization,
version, schema version, and parser version. An existing object must match the same
SHA-256. PostgreSQL completion, version/artifact status, and the completion outbox
event share one transaction.

## Snapshot envelope

The `1.0.0` schema contains:

- `schema_version`, `parser_version`, `file_type`, and source SHA-256;
- deterministic package counts and detected feature flags;
- structured warnings, unsupported feature codes, and bounded SDK validation errors;
- a format-specific inventory; and
- a stable SHA-256 over the deterministic envelope fields.

PowerPoint inventory includes slide order, slide relationships, layout/master parts,
shape counts, and notes. Excel includes sheet order/name/visibility/dimensions,
defined names, tables, and charts. Word includes sections, paragraphs, headings,
tables, headers, footers, footnotes, endnotes, comments, and tracked changes.

Timestamps, worker IDs, lease data, temporary paths, and database IDs are excluded
from stable content hashing. Processing the same immutable bytes with the same parser
and schema versions therefore produces the same stable hash and snapshot bytes.

## Security limits

The engine authenticates `POST /internal/v1/inspections` with a worker-only token of
at least 32 characters. Inputs are copied into a random per-request directory, read
only, and deleted in `finally`. The service never executes macros, follows external
relationships, opens embedded objects, or mutates the package.

Default limits are:

| Limit | Default |
| --- | ---: |
| Input artifact | 100 MiB |
| ZIP entries | 5,000 |
| Expanded part | 64 MiB |
| Total expanded package | 512 MiB |
| Compression ratio per part | 200:1 |
| XML characters per part | 16 MiB |
| XML nesting depth | 128 |
| Recorded validation errors | 100 |

Preflight rejects absolute/traversing or duplicate part names, unsafe relationship
targets, encrypted content, unsafe expansion, malformed relationships/content types,
DTD/XXE input, excessive XML depth, and corrupt ZIP content before SDK inventory.

## Warnings and failures

Non-executed features produce structured warnings and unsupported codes:
`vba_macros`, `digital_signatures`, `external_links`, `embedded_objects`, and
`binary_part`. Open XML schema errors are retained as validation results and do not
change source bytes.

Security-limit, traversal, DTD, and encrypted-package codes quarantine the version.
Malformed/corrupt packages and document-type mismatch fail permanently. Storage,
database, network, and engine availability failures retry within the attempt bound.
Source/object hash or size mismatch fails immediately as an integrity error.

The web history polls active jobs and shows queue/running attempts, scheduled retry,
failure or quarantine code, warnings, parser/schema versions, stable hash, and the
job trace UUID used for support correlation.
