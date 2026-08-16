# Notification delivery runbook

## Configuration

The worker requires PostgreSQL and Redis. Production startup also requires
`SMTP_URL` and an HTTPS `WEB_ORIGIN`. `NOTIFICATION_FROM` controls the sender and
`NOTIFICATION_CONCURRENCY` controls delivery workers. Keep SMTP credentials in the
deployment secret store; never place them in repository files or support evidence.

The worker readiness endpoint verifies its database and Redis dependencies but does
not send a probe message. Validate a new SMTP configuration with a synthetic account
before enabling email for users.

## Queue inspection

```sql
select status, count(*)
from notification_dispatches
group by status order by status;

select channel, status, count(*)
from notification_deliveries
group by channel, status order by channel, status;

select event_type, count(*)
from user_notifications
group by event_type order by event_type;
```

For one source event, correlate the outbox and fanout state without selecting event
payload or message content:

```sql
select o.id, o.event_type, o.status as outbox_status,
       d.status as dispatch_status, d.attempts, d.max_attempts,
       d.available_at, d.lease_expires_at, d.failure_code, d.last_error
from outbox_events o
left join notification_dispatches d on d.outbox_event_id = o.id
where o.id = :outbox_event_id;
```

For email, inspect only the minimum needed operational fields. Treat the address and
provider message ID as sensitive identity metadata.

```sql
select id, status, attempts, max_attempts, available_at, lease_expires_at,
       failure_code, last_error, provider_message_id
from notification_deliveries
where id = :delivery_id and channel = 'email';
```

## Automatic recovery

On each dispatch pass, the worker creates missing dispatch rows for pending supported
events and recovers expired leases. A non-exhausted lease becomes retryable
immediately. An exhausted lease becomes permanently failed. Transient fanout and
SMTP failures use bounded exponential delay; terminal rows remain for diagnosis.

Before retrying terminal work, fix the source record, authorization, or SMTP fault.
Then update state in one operator-reviewed transaction. Do not delete notification,
delivery, dispatch, or outbox evidence.

```sql
begin;
update notification_dispatches
set status = 'retryable_failed', attempts = 0, available_at = now(),
    completed_at = null, failure_code = null, last_error = null,
    lease_owner = null, lease_expires_at = null, heartbeat_at = null,
    updated_at = now()
where outbox_event_id = :outbox_event_id
  and status = 'permanently_failed';
update outbox_events
set status = 'pending', published_at = null, last_error = null
where id = :outbox_event_id and status = 'failed';
commit;
```

For an email dead letter, reset only the selected delivery after confirming the
recipient is still active and the stored address is still appropriate:

```sql
update notification_deliveries
set status = 'retryable_failed', attempts = 0, available_at = now(),
    completed_at = null, failure_code = null, last_error = null,
    lease_owner = null, lease_expires_at = null, heartbeat_at = null,
    updated_at = now()
where id = :delivery_id and channel = 'email'
  and status = 'permanently_failed';
```

## Incident rules

- Do not mark an outbox event published to clear an alert; publication proves atomic fanout completion.
- Do not change a suppressed delivery to queued. Suppression records the preference decision made during fanout.
- Do not paste payloads, addresses, provider responses, comments, or document metadata into tickets or chat.
- A repeated email with the same deterministic `Message-ID` can occur at the SMTP/database acknowledgment boundary and is not evidence of duplicate notification rows.
- If queue growth continues after database, Redis, or SMTP recovery, preserve IDs and timestamps, stop manual edits, and escalate with counts and failure codes only.
