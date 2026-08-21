# ADR 0002: Fastify API with TypeBox, OpenAPI, Drizzle, and PostgreSQL

- Status: Accepted
- Date: 2026-08-15

## Context

The Express prototype exposes unauthenticated global filesystem overwrites and has no domain, persistence, authorization, idempotency, or contract layer. It is too small and structurally unsafe to evolve into the production API.

## Decision

Build a new TypeScript API in `services/api` using Fastify. Define request/response schemas with TypeBox, publish OpenAPI, and generate clients/contracts rather than hand-maintaining duplicate shapes. Use Drizzle for explicit SQL migrations and PostgreSQL for tenant-owned metadata, version graphs, workflow state, jobs/outbox records, and audit pointers.

`server.js` will not become the production API. There will be no compatibility production endpoints for `/save`, `/load`, `/save-presentation`, or `/load-presentation`.

## Consequences

- Runtime validation, documentation, and generated clients share one contract source.
- Authorization and organization scoping can be tested at the service boundary.
- Binary artifacts remain outside PostgreSQL behind the `BlobStore` interface.
- Legacy behavior must be captured with sanitized tests before the server prototype is removed; it is not ported handler by handler.

