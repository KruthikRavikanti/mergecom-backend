# Document processing runbook

## Readiness

Check the boundaries independently:

```bash
curl -f http://localhost:3001/health/ready
curl -f http://localhost:3002/health/ready
curl -f http://localhost:3003/health/ready
redis-cli ping
```

Worker readiness requires PostgreSQL, Redis, the private object bucket, and the
document engine. Liveness alone does not mean jobs can progress.

## Backlog and leases

Inspect durable state without reading document bytes:

```sql
select status, count(*)
from version_processing_jobs
group by status
order by status;

select id, version_id, attempts, max_attempts, available_at,
       lease_owner, heartbeat_at, lease_expires_at, failure_code, trace_id
from version_processing_jobs
where status <> 'completed'
order by created_at;
```

Do not update active rows manually. A restarted worker redispatches eligible
PostgreSQL rows with deterministic BullMQ IDs. Expired leases recover automatically;
after the maximum attempt they become `permanently_failed` with `lease_exhausted`.

## Retry and dead letter

`retryable_failed` rows retain their next `available_at` and are redispatched. A
`permanently_failed` or `quarantined` row is the durable dead-letter record. Preserve
its `trace_id`, `failure_code`, attempts, source artifact SHA-256, and service logs
when investigating. Never download or open a quarantined artifact on an operator
workstation.

There is intentionally no blind retry button. Correct the dependency or parser
problem first. A future controlled reprocessing command must create an auditable new
job/parser version rather than rewriting the terminal record.

## Snapshot integrity

For completed work, compare `normalized_snapshots.snapshot_sha256` with the exact
object bytes and `stable_hash` with a second parse using the same parser/schema
version. A deterministic mismatch or existing-key collision is an integrity incident;
do not overwrite the object or row.

## Redis restart

Redis uses append-only persistence locally. PostgreSQL remains authoritative even if
Redis delivery data is lost: restart Redis, then restart the worker. Eligible queued,
retryable, and expired-lease jobs are redispatched. Verify that terminal job and
snapshot counts do not increase under duplicate delivery.
