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
| Divergent disjoint text changes | Restricted | Pilot-gated | No | Validated candidate |

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

### PowerPoint pilot allowlist

PowerPoint conflict analysis runs independently of candidate generation. It persists
semantic findings as non-overlapping, compatible overlapping, true conflict,
ambiguous, or unsupported, grouped across slide, shape, text, chart, media, master,
layout, theme, notes, relationship, macro, signature, embedded-object, and unknown
package categories. The public analysis contains labels, confidence, change direction,
and explanations, never raw XML or object keys.

A divergent candidate is eligible only when both sides contain one or more modified
`slide_shape` content changes and every changed target is a plain PowerPoint text
shape found by the same slide part URI and unique non-visual shape ID in all three
inputs. Slide order, shape order, shape sets, text-node count, and all non-text shape
markup must remain unchanged. The two sides may edit shapes on separate slides or
different shapes on the same slide. Identical edits to the same target are compatible;
different edits to the same target are conflicts.

Every package entry outside `ppt/slides/slide*.xml`, including slide relationships,
content types, media, charts, layouts, masters, themes, notes, macros, signatures,
embedded objects, and unknown parts, must have identical decompressed SHA-256 hashes
across base, ours, and theirs. Candidate generation copies ours and replaces only
approved incoming shapes. Security preflight, Open XML validation, relationship and
content-type resolution, exact semantic-union comparison, and byte equality for every
untouched entry must all pass. A failed PowerPoint candidate is discarded while its
analysis and blocker evidence remain durable.

Generation additionally requires both `POWERPOINT_AUTOMATIC_MERGE_ENABLED=true` and
the merge organization UUID in
`POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS`. Analysis still reports whether a
merge is technically eligible when either control is off. Both controls default off.

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

Divergent Excel edits require manual resolution. PowerPoint slide additions,
deletions, moves/reorders, shape additions/removals/reorders, formatting or geometry,
tables/charts, media, grouped shapes, notes, relationships, layouts/masters/themes,
macros/signatures, embedded objects, and unknown parts are manual-only. Word
additions, removals, moves, structural changes, formatting changes, tracked changes,
auxiliary stories, and any changed supporting package part also require manual
resolution. Automatic coverage should expand only when each new edit class has a
deterministic three-way rule, package-preservation proof, candidate validation, and
adversarial fixtures.
