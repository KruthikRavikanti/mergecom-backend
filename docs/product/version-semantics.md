# Version semantics

This document defines the behavior that storage, API, web, and Office clients must share.

## Terms

| Internal term | Product language |
| --- | --- |
| Commit | Version or Push |
| Commit message | Version note |
| Main branch head | Latest team version |
| Approved commit | Approved version |
| Checkout/pull | Open or download this version |
| Merge conflict | Conflicting changes |
| Revert | Restore as a new version |
| Diff | Changes |

The latest version and approved version are separate pointers. A newly pushed version does not become approved automatically.

## Immutable version

A version is an immutable node in a document branch. It records:

- one exact artifact and its SHA-256;
- a required parent except for the first version;
- an optional merge parent;
- the base version the client believed was current;
- author, source, version note, sequence, and timestamps;
- processing, review, conflict, and quarantine status.

Published version fields and artifact bytes are never overwritten. Corrections create another version or an append-only administrative event.

## Push

1. The client identifies the document, branch, and base version it opened.
2. The API authorizes the user and returns an idempotent upload intent.
3. Exact compressed Office package bytes are uploaded and verified.
4. If the base equals the current branch head, the API creates a child version and atomically advances the head.
5. If the base is stale, the API preserves the uploaded artifact but does not silently advance the branch. It returns a conflict state for comparison or resolution.
6. Processing is asynchronous; the UI reports uploading, processing, ready, conflicted, quarantined, or failed truthfully.

Repeated finalization with the same idempotency key returns the same outcome and never creates duplicate logical versions.

## Pull and download

Pull/open/download retrieves the exact immutable artifact associated with an authorized version. A normalized snapshot, preview, or partial Office.js model cannot satisfy this operation. The delivered bytes must match the recorded SHA-256.

## Restore and rollback

Restoring version `Vn` creates a new version whose artifact is the exact authorized artifact from `Vn` and whose parent is the current branch head. Existing later versions remain reachable and unchanged. Product copy must say that restore creates a new version; it must not imply deletion of intervening history.

## Compare

A comparison is derived from two immutable versions and records engine/parser/schema versions. Typed changes may be regenerated without changing either version. Unknown or unsupported content is reported explicitly. Byte equality and semantic equality are distinct results.

## Review and approval

Review requests target one immutable version. Reviewer decisions are append-only records. Approval advances the document's approved-version pointer only after authorization and policy checks. Rejection does not delete the version. A later push does not revoke historical decisions, but it may make the approved version older than the latest version.

## Branches and stale bases

Each document starts with a default `main` branch. A branch head update is compare-and-swap against the expected current head. The service must reject or conflict a stale update instead of using last-write-wins behavior.

Additional branches are allowed by the model but need not be exposed in the first pilot UI. Their names are unique within a document and their heads reference versions of that document only.

## Merge

Automatic merge requires a common base and a three-way comparison of base/ours/theirs. It is permitted only for disjoint changes the engine can identify with high confidence, when unsupported parts remain intact, the output package validates, and automated opening/smoke checks pass where practical.

Otherwise the result is `manual_resolution_required`. Both input artifacts and any generated candidate remain preserved. A successful merge creates a version with a primary parent and merge parent; it never alters either input.

## Deletion and retention

Normal users archive documents and projects; they do not rewrite version history. Retention or legal deletion is a separately authorized administrative workflow that records audit evidence and respects policy/legal holds. Blob garbage collection occurs only after metadata proves no authorized version or retained record references the artifact.

