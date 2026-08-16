# Conservative three-way merge

Phase 8 merges one explicit common base, the current branch head (`ours`), and one
retained conflicted version (`theirs`). All three inputs remain immutable. A request
is accepted only when the versions belong to the same organization, document, and
branch; the base is an ancestor of both heads; ours is still the branch head; and all
source artifacts are clean with completed semantic ingestion.

## Automatic support boundary

| Strategy | Word | PowerPoint | Excel | Published bytes |
| --- | --- | --- | --- | --- |
| Ours and theirs byte-identical | Yes | Yes | Yes | Exact ours |
| Ours byte-identical to base | Yes | Yes | Yes | Exact theirs |
| Theirs byte-identical to base | Yes | Yes | Yes | Exact ours |
| Divergent disjoint text changes | Restricted | No | No | Validated Word candidate |

Every exact strategy still requires complete inspection coverage and no validation or
unsupported-feature findings in any input. Divergent Word merge requires both
base-to-head comparisons to contain only modified `content` changes on paragraph or
table-cell paths, with no shared path. Each changed paragraph must retain the same
text-node count and the same non-text markup.

All package entries other than the main Word document and the two root package
metadata entries must have identical decompressed content hashes across base, ours,
and theirs. This rejects changes to headers, footers, relationships, styles, themes,
images, comments, numbering, embedded content, signatures, macros, and other
supporting parts even when the normalized body diff appears disjoint.

The engine copies the exact ours package and replaces only approved disjoint paths
with elements cloned from theirs. It then reopens the candidate, runs Open XML
validation and security inspection, and compares base to candidate. Publication is
allowed only when the candidate's exact typed change set equals the union of the two
input change sets.

## Manual outcomes

The operation ends as `manual_resolution_required` when the format needs manual
resolution, inspection coverage is partial, source validation fails, supporting
parts differ, change shapes are unsupported, paths overlap, Word markup changes, a
candidate path is missing, candidate validation or verification fails, the branch
head moves, or publication would exceed the workspace quota. No fallback text
reconstruction is attempted.

The base, ours, and theirs version IDs always remain available. When a safe candidate
was generated before an operational publication check failed, its immutable object
key, SHA-256, and byte size are retained internally. Authorized users receive only a
short-lived download grant, never the object key.

## Durable publication

PostgreSQL is authoritative for queued, running, retryable, permanent-failure,
manual-resolution, and completed state. BullMQ provides delivery while leases,
attempts, availability, trace IDs, result metadata, and terminal events remain
durable. Requests are idempotent and the source/version contract is unique.

On success, one transaction locks the branch and organization, enforces the storage
quota, creates an artifact, creates a version whose primary parent is ours and merge
parent is theirs, records the declared base, advances the branch with compare-and-
swap, queues normal semantic ingestion, and completes the merge with an outbox event.
Duplicate terminal delivery creates neither another artifact nor another version.

Creating, reading, and downloading a merge rederive organization and project access.
Foreign or unauthorized resources use the normal not-found boundary. Request and
candidate-download actions are audited; lifecycle events use the transactional
outbox.

## Known limitations

Divergent PowerPoint and Excel edits require manual resolution. Word additions,
removals, moves, structural changes, formatting changes, tracked changes, auxiliary
stories, and any changed supporting package part also require manual resolution.
Automatic coverage should expand only when each new edit class has a deterministic
three-way rule, package-preservation proof, candidate validation, and adversarial
fixtures.
