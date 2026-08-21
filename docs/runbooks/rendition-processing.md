# Rendition processing runbook

PDF renditions and comparison visualizations are private, derived, and regenerable.
The original Office artifact and semantic comparison remain authoritative. Never use
a PDF or normalized viewer payload to restore, merge, or overwrite a version.

## Readiness

Check each private boundary independently:

```bash
curl -f http://localhost:3001/health/ready
curl -f http://localhost:3002/health/ready
curl -f http://localhost:3004/health/ready
curl -f http://localhost:3004/metrics
```

Worker readiness requires the rendition engine in addition to PostgreSQL, Redis,
object storage, and the semantic document engine. Rendition readiness probes both
LibreOffice and qpdf. Do not enable a pilot organization while either is unavailable.

## Backlog and leases

Inspect metadata only. Do not select object bytes, signed URLs, filenames, formulas,
or normalized payloads into logs or support tickets.

```sql
select status, count(*)
from version_rendition_jobs
group by status
order by status;

select j.id, j.rendition_id, j.status, j.attempts, j.max_attempts,
       j.available_at, j.lease_owner, j.heartbeat_at, j.lease_expires_at,
       j.failure_code, j.trace_id, r.renderer_profile, r.renderer_version,
       r.font_pack_version
from version_rendition_jobs j
join version_renditions r on r.id = j.rendition_id
where j.status <> 'completed'
order by j.created_at;
```

The worker recovers expired leases to `retryable_failed`. Exhausted leases become
`permanently_failed` with `lease_exhausted`; the row remains the dead-letter record.
BullMQ IDs are deterministic and duplicate terminal delivery is a no-op.

## Failure handling

- `rendition_dependency_unavailable` and `rendition_timeout` can retry within the
  persisted attempt budget after service health is restored.
- Package, macro, encryption, archive, integrity, PDF validation, output-size, and
  quota failures are terminal. Do not blindly retry the same renderer identity.
- A renderer crash must not be handled by relaxing isolation. Preserve trace ID,
  renderer/font identity, failure code, attempts, and resource metrics.
- The web workspace must continue to show semantic changes and typed fallback while
  a rendition or visual mapping is unavailable.

## Integrity and cache

For completed rows, recompute the private object SHA-256 and compare it with
`rendition_sha256`, then verify byte/page counts and dimensions. One object can be
referenced by several same-tenant version rows when source SHA-256 and full renderer
identity match. Never delete a cache object until no rendition row references its
key. Cross-tenant cache reuse is prohibited even when source hashes match.

Changing LibreOffice, qpdf behavior, export profile, or fonts requires a new renderer
or font-pack version. Render the fixture corpus, compare page structure and approved
screenshots, then roll the new identity behind the pilot allowlist. Existing rows and
objects remain immutable.

## Quota and cleanup

Organization quota accounting includes each unique completed rendition object once.
A quota failure can leave an unreferenced immutable upload; periodic API cleanup
removes it only after checking all artifact, snapshot, comparison, rendition,
visualization, and merge-candidate references. Alert on cleanup failures and abnormal
output growth.

## Security response

The rendition service receives bytes, extension, source hash, and a trace ID only.
It must not receive organization, user, project, document, or filename data. Its
runtime network is internal with no egress, root filesystem is read-only, temporary
storage is bounded, capabilities are dropped, and it runs non-root. Treat evidence
of external access, host-file reads, macro execution, unsafe PDF actions, or content
logging as a security incident and disable `VISUAL_COMPARISON_ENABLED` immediately.

## Metrics and alerts

Collect private API, worker, and rendition-engine metrics. Alert on sustained queue
age, retry/dead-letter growth, timeouts, renderer restarts, readiness failure, output
size growth, mapping coverage regression, viewer failures, cache-hit collapse, and
cleanup errors. Metrics contain counts and durations only, never artifact identity or
content labels.
