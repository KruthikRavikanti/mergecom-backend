# Review workflow

Phase 7 makes review state durable without changing immutable Office artifacts or the
version graph. A review request belongs to one tenant and document, targets exactly
one version, and may reference one completed directional comparison whose target is
that same version.

## Eligibility and authorization

A target version must be ready, clean, and have completed semantic ingestion. Its
sequence must be newer than the branch's current approved version, and it can have at
most one open review.

Project leads and contributors may request review. Every assignee must be an active
project member with project-lead or reviewer access, and the version author cannot be
assigned. At decision time the API rechecks the assignee's active organization and
project membership. Removing that scope prevents a decision; a requester or project
lead must cancel the stalled review and create a new request with valid assignees.

All reads and mutations rederive project access from the authenticated organization.
Foreign-tenant and unscoped resources use the same not-found boundary as unknown
resources. Viewers can read a review only when they already have project scope; they
cannot create discussion content.

## Decision policy

Assignments are fixed when the request is created. Each assigned reviewer can append
one `approved` or `changes_requested` decision with a required note. Decision rows
cannot be updated or deleted.

- One changes-requested decision closes the request as `changes_requested`.
- Approval is unanimous: every assignment must have an approved decision.
- A unanimous approval advances `document_branches.approved_version_id`,
  `approved_at`, and `approved_by_user_id` in the same transaction.
- Approval never advances `head_version_id` and never edits the reviewed version.
- The branch row is locked for request creation and terminal approval. If another
  approval already points to the same or a later sequence, the older review closes
  as `superseded` and the pointer does not move backward.
- Cancellation closes only an open request and does not affect either branch pointer.

The requester or a project lead may cancel an open request. Closed requests retain
assignments, decisions, threads, comments, and closure metadata.

## Discussion model

A thread starts with its first append-only comment. It is either general or anchored
to one exact change from the review's persisted comparison. An anchored thread stores
the comparison ID, stable change ID, category, label, and normalized path. API checks
and database triggers require all anchor fields to match the completed comparison;
clients cannot manufacture or retarget anchors.

Project members other than viewers may create threads and comments while both the
review and thread are open. The thread creator, requester, or a project lead may
resolve an open thread while the review is open. Resolution preserves every comment
and anchor. Closed reviews reject new comments, threads, and resolution changes.

Requests accept at most 20 reviewers, 100 threads, and 200 comments per thread.
Messages, decision notes, and comments are required, non-whitespace text capped at
2,000 characters.

## Durability and events

Every mutation uses the caller, operation, and hashed idempotency key to return the
same logical review on replay and reject key reuse with a different payload. Review
and branch locks serialize terminal decisions and pointer movement.

Successful requests, decisions, cancellation, thread creation, comments, and
resolution write an audit event and a transactional outbox event. The Phase 9
notification pipeline consumes those rows, rechecks current recipient scope, and
publishes durable in-app and preference-controlled email deliveries.

Composite foreign keys bind reviews, versions, comparisons, assignments, threads,
comments, and the approved pointer to the same organization and document. Database
triggers reject updates or deletes of decision and comment evidence.

## Product surface

Document history lists review requests and marks the current approved version.
Eligible versions can be submitted directly, while a completed comparison can create
a review that supports exact change discussions. The review route polls open state,
shows current assignment validity and immutable decisions, exposes permitted actions,
and retains closed discussion history. Phase 8 separately permits a retained stale
version to enter the conservative merge workflow.
