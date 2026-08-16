# Review workflow runbook

## Inspect state

Use metadata queries only; do not include comment or decision text in routine logs or
support tickets.

```sql
select r.id, r.document_id, v.display_number, r.status,
       r.created_at, r.closed_at, count(a.id) as assignments,
       count(d.id) as decisions
from review_requests r
join document_versions v on v.id = r.version_id
join review_assignments a on a.review_request_id = r.id
left join review_decisions d on d.review_request_id = r.id
where r.organization_id = :organization_id
group by r.id, v.display_number
order by r.created_at desc;

select b.document_id, b.head_version_id, b.approved_version_id,
       head.sequence as head_sequence, approved.sequence as approved_sequence,
       b.approved_at, b.approved_by_user_id
from document_branches b
left join document_versions head on head.id = b.head_version_id
left join document_versions approved on approved.id = b.approved_version_id
where b.organization_id = :organization_id and b.is_default = true;
```

An approved sequence may be lower than the head sequence. That is expected and means
newer work has not been approved.

## Stalled assignments

An assigned reviewer who loses active organization membership or project-lead/reviewer
scope cannot decide. Do not alter the assignment or insert a decision manually. The
requester or a project lead must cancel the open review and create a new request with
current reviewers. Historical assignment evidence remains intact.

## Pointer investigation

Do not update `approved_version_id`, review status, decisions, or comments directly.
The API locks the branch, requires unanimous decisions, and prevents pointer
regression. A `superseded` review is expected when a concurrent review for a newer
version advanced the pointer first.

For an unexpected pointer, retain the review ID, document ID, version sequences,
closure actor/time, audit event IDs, and request IDs. Verify all referenced versions
belong to the same document. Escalate correction as an append-only administrative
operation; Phase 7 intentionally provides no unaudited repair command.

## Outbox delivery

Review mutations write `review.*` rows to `outbox_events`. Phase 7 retains them but
has no notification consumer. Do not mark them published to simulate notification
delivery. Phase 9 will own retry, channel preference, and publication semantics.

## Integrity checks

The following should return no rows:

```sql
select r.id
from review_requests r
join document_versions v on v.id = r.version_id
where r.organization_id <> v.organization_id
   or r.document_id <> v.document_id;

select r.id
from review_requests r
join document_branches b on b.document_id = r.document_id and b.is_default = true
join document_versions approved on approved.id = b.approved_version_id
join document_versions reviewed on reviewed.id = r.version_id
where r.status = 'approved' and reviewed.sequence > approved.sequence;
```

Database triggers intentionally reject update or delete operations on
`review_decisions` and `review_comments` with SQLSTATE `55000`. Treat a trigger or
composite-foreign-key failure as an integrity signal, not as a reason to bypass the
constraint.
