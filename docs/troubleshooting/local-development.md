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

The default ports are `5173`, `5174`, `3001`, `3002`, `3003`, `5432`, `6379`, `9000`,
`9001`, `1025`, and `8025`. Stop the conflicting process or update the corresponding
service environment value and Compose mapping together.

## Testcontainers tests are skipped

The real PostgreSQL check is intentionally gated. Start Docker and run:

```bash
RUN_TESTCONTAINERS=true pnpm test:integration
```

## Web sign-in has no development demo button

Set `VITE_ENABLE_DEMO_AUTH=true` in `apps/web/.env.local` and run the Vite development
server. The button is intentionally unavailable in production builds.
