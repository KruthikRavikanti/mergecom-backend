# ADR 0003: BullMQ and Redis for durable jobs

- Status: Accepted
- Date: 2026-08-15

## Context

Malware scanning, Office normalization, diffing, previews, merge validation, and notifications are long-running or failure-prone work. Running them inside API requests would couple latency, retries, and resource limits to public traffic.

## Decision

Use BullMQ backed by Redis for local and pilot durable orchestration. Workers implement explicit queued, leased/running, retryable-failed, permanently-failed, quarantined, and completed states with bounded retries, lease/visibility timeout, heartbeat where required, idempotency, and dead-letter handling.

The API persists command/job intent transactionally before dispatch. Workers call the internal document engine and update durable metadata; clients poll or subscribe to honest status.

## Consequences

- API requests remain bounded and retry-safe.
- Operations must monitor queue lag, retries, dead letters, and lease expiry.
- Job handlers must tolerate duplicate delivery and make output publication atomic.
- A future queue provider change remains possible behind application job interfaces, but is not needed for the first pilot.

