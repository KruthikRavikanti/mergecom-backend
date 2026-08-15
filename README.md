# MergeCom

MergeCom is a document version review workspace for Microsoft Office files. Phase 2
adds Microsoft Entra OIDC, server-owned sessions, PostgreSQL organizations and
memberships, centralized RBAC, invitations, audit events, and an authenticated web
experience. Document capture, diffing, and Office host behavior remain deferred.

## Repository map

```text
apps/web/                    React web application
apps/office-addin/           shared Office task-pane shell
services/api/                Fastify HTTP API
services/worker/             BullMQ/Redis worker process shell
services/document-engine/    ASP.NET Core document-engine boundary
packages/contracts/          OpenAPI source and generated TypeScript client types
packages/ui/                 shared accessible UI primitives
packages/office-core/        shared Office artifact invariants
packages/test-fixtures/      synthetic test data only
infra/compose/               PostgreSQL, Redis, MinIO, and Mailpit
legacy/                      archived prototypes outside the workspace
```

## Prerequisites

- Node.js `24.18.1`
- pnpm `11.22.0`
- .NET SDK `10.0.400`
- Docker with Compose v2 for local dependencies and Testcontainers checks

The versions are pinned in `.nvmrc`, `.node-version`, `package.json`, and
`global.json`. Install pnpm with `npm install --global pnpm@11.22.0` when a current
Corepack installation is unavailable.

## Setup

```bash
pnpm install --frozen-lockfile
cp infra/compose/.env.example infra/compose/.env
pnpm infra:up
export DATABASE_URL=postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom
export AUTH_MODE=development
export SMTP_URL=smtp://localhost:1025
pnpm --filter @mergecom/api db:migrate
pnpm --filter @mergecom/api db:seed
VITE_ENABLE_DEMO_DATA=true pnpm dev
```

The web app is available at `http://localhost:5173`, the Office shell at
`http://localhost:5174`, the API at `http://localhost:3001`, the worker health server
at `http://localhost:3002`, and the document engine at `http://localhost:3003`.
Mailpit is available at `http://localhost:8025` and the MinIO console at
`http://localhost:9001`.

The local identity exchange resolves only pre-seeded immutable subjects through the
API and cannot run with `NODE_ENV=production`. It never creates passwords or lets the
browser assign a role. The development login UI is excluded from production builds.

## Commands

```bash
pnpm dev                 # all JS processes plus the .NET document engine
pnpm build               # production builds for every active workspace/service
pnpm format:check        # Prettier policy
pnpm lint                # ESLint policy
pnpm typecheck           # strict TypeScript checks
pnpm test:unit           # Vitest and xUnit
pnpm test:integration    # service startup and gated Testcontainers checks
pnpm test:e2e            # Playwright desktop/mobile route suite
pnpm verify              # complete local quality gate
```

Run the real PostgreSQL integration check with Docker available:

```bash
RUN_TESTCONTAINERS=true pnpm test:integration
```

See [local setup](docs/setup/local-development.md),
[identity and RBAC](docs/security/identity-rbac.md),
[troubleshooting](docs/troubleshooting/local-development.md), and
[phase status](docs/phase-status.md) for operational detail.

## Safety

The codebase is not production-ready and must not be used with confidential files.
Legacy prototypes remain historical evidence only and are excluded from pnpm, Turbo,
CI builds, and deployment paths. Historical credential exposure and the deferred
history-cleaning decision remain documented in
[the Phase 0 exposure inventory](docs/security/phase-0-exposure-inventory.md).
