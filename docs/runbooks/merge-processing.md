# Merge processing runbook

## Readiness

Check each processing boundary before investigating a backlog:

```bash
curl -f http://localhost:3001/health/ready
curl -f http://localhost:3002/health/ready
curl -f http://localhost:3003/health/ready
redis-cli ping
```

Worker readiness requires PostgreSQL, Redis, private object storage, and the document
engine. PostgreSQL remains authoritative if BullMQ delivery data is unavailable.

## Queue and lease state

Inspect metadata without reading or logging document bytes:

```sql
select status, count(*)
from merge_operations
group by status
order by status;

select id, document_id, base_version_id, ours_version_id, theirs_version_id,
       status, attempts, max_attempts, available_at, lease_owner,
       heartbeat_at, lease_expires_at, failure_code, trace_id
from merge_operations
where status not in ('completed', 'manual_resolution_required')
order by created_at;
```

A restarted worker rediscovers queued and retryable rows. Expired running leases move
back to `retryable_failed` until attempts are exhausted, then become
`permanently_failed` with `lease_exhausted`. Do not clear a lease or change attempts
manually.

## Manual resolution

```sql
select id, document_id, failure_code, strategy, warnings, applied_paths,
       analysis->>'automaticMergeEligible' as eligible,
       analysis->>'automaticMergeEnabled' as enabled,
       analysis->'blockers' as blockers,
       candidate_sha256, candidate_byte_size, completed_at, trace_id
from merge_operations
where organization_id = :organization_id
  and status = 'manual_resolution_required'
order by completed_at desc;
```

An overlap or unsupported-change outcome normally has no candidate. A moved branch
head or quota failure may retain one because candidate validation completed before
publication was rejected. Use the authorized API download flow to retrieve it. Do
not expose, move, overwrite, or directly sign `candidate_object_key`.

Resolve the document in Office from the retained exact base, ours, and theirs
versions, then upload the result as a normal new version based on the current head.
Do not update the merge row, rewrite a source version, or attach the candidate to the
branch manually. A `branch_head_changed` outcome is expected concurrency behavior;
re-evaluate against the new head before requesting another merge.

For `merge_quota_exceeded`, remove storage only through an approved retention flow.
The candidate remains retained evidence but does not count as an artifact and cannot
be published until the quota condition is addressed through a future merge request.

## Candidate integrity

For a retained candidate, verify object bytes against `candidate_sha256` and size
against `candidate_byte_size`. The object path is organization-scoped and immutable;
an existing-key hash mismatch is an integrity incident. Preserve the merge ID,
source version IDs and hashes, merge/parser/engine versions, trace ID, failure code,
and relevant service logs. Never replace the object to make a row appear valid.

Completed merges must have one `result_version_id`. That version must identify ours
as `parent_version_id`, theirs as `merge_parent_version_id`, the request base as
`base_version_id`, and `merge` as its source. It enters the standard ingestion queue
and may temporarily be `pending_processing` after the merge itself completes.

## Integrity checks

The following should return no rows:

```sql
select m.id
from merge_operations m
join document_versions b on b.id = m.base_version_id
join document_versions o on o.id = m.ours_version_id
join document_versions t on t.id = m.theirs_version_id
where m.organization_id <> b.organization_id
   or m.organization_id <> o.organization_id
   or m.organization_id <> t.organization_id
   or m.document_id <> b.document_id
   or m.document_id <> o.document_id
   or m.document_id <> t.document_id;

select m.id
from merge_operations m
join document_versions r on r.id = m.result_version_id
where m.status = 'completed'
  and (r.source <> 'merge'
    or r.parent_version_id <> m.ours_version_id
    or r.merge_parent_version_id <> m.theirs_version_id
    or r.base_version_id <> m.base_version_id);
```

Do not delete source artifacts, normalized snapshots, candidate objects, merge rows,
result versions, audits, or outbox events during recovery. Correction must be a new,
authorized, auditable operation.

## PowerPoint pilot controls

Conflict analysis is always recorded for an engine-completed merge. Candidate
generation requires both controls below and remains disabled by default:

```bash
POWERPOINT_AUTOMATIC_MERGE_ENABLED=true
POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS=00000000-0000-4000-8000-000000000000
```

The allowlist is a comma-separated UUID list. Restart the worker after changing either
value. To stop generation immediately, set the global flag to `false` and restart the
worker; eligible analyses will then end in manual resolution with
`powerpoint_automatic_merge_disabled`. Do not alter existing merge rows or candidates.

Before adding a pilot organization, review its fixture evidence and confirm that the
document profile is limited to plain text-shape changes. Layout/master/theme changes,
notes, grouped shapes, charts, media, relationships, macros, signatures, embedded
objects, and unknown package parts remain blockers even when the pilot controls are on.
