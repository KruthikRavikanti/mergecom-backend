# Durable notifications

Phase 9 turns retained workflow events into recipient-owned in-app and email
deliveries. PostgreSQL is authoritative; BullMQ only wakes processors and SMTP is an
external delivery boundary.

## Event and recipient model

The notification worker consumes these terminal outbox families:

- review request, decision, cancellation, discussion, comment, and resolution;
- version processing completion;
- comparison completion;
- merge completion, including manual-resolution and failure outcomes.

Review requests target their fixed reviewers. Decisions and discussions target the
requester and assigned reviewers. Cancellation targets assigned reviewers. The actor
is excluded from social review fanout. Document-processing completion targets the
version author; comparison and merge completion target the requester.

Fanout rechecks an active organization membership, an enabled user, and current
project access. Owners and administrators have implicit project scope; every other
recipient must have an active project membership. Losing access before fanout means
no notification is created.

## Transaction and delivery guarantees

`notification_dispatches` gives each supported outbox event one durable fanout job.
A leased fanout transaction locks the source event, resolves source records and
recipients, creates at most one `user_notifications` row per source/recipient, creates
one delivery per channel, completes the dispatch, and marks the outbox event
published. Any failure rolls back the whole fanout transaction.

`notification_deliveries` independently tracks in-app and email status. In-app
delivery completes during fanout. Email is leased and sent later. Expired leases are
recovered, retry delay grows exponentially, and exhausted or permanent work retains
a failure code and error for operators. Deterministic BullMQ IDs and database unique
keys make duplicate queue delivery a no-op.

SMTP is at least once: a provider can accept a message immediately before the worker
loses its database connection. A retry can therefore produce a duplicate. Every
message uses a deterministic `Message-ID` based on the delivery ID so providers can
deduplicate where supported.

## Preferences and privacy

Each user has four organization-scoped switches: in-app and email delivery for review
activity and document activity. In-app defaults on and email defaults off. Enabling
either email category requires a verified identity email. Preferences are sampled
when fanout occurs; changing them does not rewrite an existing delivery.

Suppressed channels are terminal records, which preserves an explanation without
storing an address for suppressed email. Delivered email contains a generic title,
generic body, and app deep link. It does not contain document names, review messages,
comments, decision notes, comparison content, Office bytes, or delivery errors.

The public API never returns source event IDs, recipient addresses, SMTP provider
IDs, attempts, leases, or failure details. Inbox and read operations are constrained
to the active organization and authenticated recipient. Preference and read-state
mutations require CSRF protection; preference changes and read actions are audited.

## Product surface

`/app/notifications` polls a cursor-paginated inbox, shows the total unread count,
supports all/unread views, marks one item before following its deep link, and marks
all visible recipient notifications read. The application header exposes a capped
unread badge. Settings persists the four channel switches and disables email controls
when the identity address is unverified.

Web push, SMS, digests, per-event switches, document-content email, and administrative
impersonation are not Phase 9 behavior.
