# Local development troubleshooting

## Install rejects the Node version

Activate the repository's `.nvmrc` or `.node-version`. The supported version is
`24.18.1`; using a newer system Node does not override the pin.

## Corepack cannot verify pnpm

Update Corepack or install the pinned pnpm directly:

```bash
npm install --global pnpm@11.22.0
```

## Readiness returns 503

This is expected when a required dependency is absent. Run `pnpm infra:up`, inspect
`docker compose --env-file infra/compose/.env -f infra/compose/compose.yaml ps`, and
retry the endpoint. Liveness may still return 200 because the process itself is alive.

## Ports are already in use

The default ports are `5173`, `5176`, `3001`, `3002`, `3003`, `5432`, `6379`, `9000`,
`9001`, `1025`, and `8025`. Stop the conflicting process or update the corresponding
service environment value and Compose mapping together.

## Infrastructure tests are skipped

The PostgreSQL checks require `TEST_DATABASE_URL` or Testcontainers. The artifact
suite also requires a real S3-compatible endpoint and initialized bucket. With local
Compose running:

```bash
TEST_DATABASE_URL=postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom \
TEST_S3_ENDPOINT=http://localhost:9000 \
TEST_S3_ACCESS_KEY=mergecom-local \
TEST_S3_SECRET_KEY=mergecom-local-only \
TEST_WORKER_DATABASE_URL=postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom \
TEST_DOCUMENT_ENGINE_URL=http://localhost:3003 \
pnpm test:integration
```

## Versions stay queued

Check worker readiness for all four dependencies and inspect the durable row using
`docs/runbooks/document-processing.md`. Restarting the worker is safe: deterministic
BullMQ IDs and PostgreSQL claims prevent duplicate snapshots. Do not manually change
leases or terminal states.

## Direct upload fails while API readiness is green

Confirm that the browser origin matches `WEB_ORIGIN`, MinIO is reachable from the
browser at `S3_ENDPOINT`, and port `9000` is not routed only inside a container
network. The API signs the configured endpoint verbatim.

## Web sign-in has no development demo button

Set `VITE_ENABLE_DEMO_AUTH=true` in `apps/web/.env.local` and run the Vite development
server. The button is intentionally unavailable in production builds.
