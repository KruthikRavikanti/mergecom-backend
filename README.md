# MergeCom

[![CI](https://github.com/KruthikRavikanti/mergecom-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/KruthikRavikanti/mergecom-backend/actions/workflows/ci.yml)

MergeCom is a document version review workspace for Microsoft Office files. Phase 15
adds a provider-neutral pilot deployment baseline: hardened non-root images, immutable
digest deployment, migration gating, production configuration preflight, hosted Office
manifests, release health checks, and backup/restore drills. Phase 14 exact-version
retrieval remains available across the shared Word, Excel, and PowerPoint task pane.

## Repository map

```text
apps/web/                    React web application
apps/office-addin/           shared Office task pane, host adapter, and manifests
services/api/                Fastify HTTP API
services/worker/             durable BullMQ/PostgreSQL processing pipeline
services/document-engine/    bounded ASP.NET Core Open XML inspection engine
packages/contracts/          OpenAPI source and generated TypeScript client types
packages/ui/                 shared accessible UI primitives
packages/office-core/        shared Office artifact invariants
packages/test-fixtures/      synthetic test data only
infra/compose/               PostgreSQL, Redis, MinIO, and Mailpit
infra/deployment/            hosted pilot images, topology, and operator checks
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
pnpm dev
```

The web app is available at `http://localhost:5173`, the Office task pane at
`https://localhost:5176`, the API at `http://localhost:3001`, the worker health server
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
pnpm test:deployment     # pilot topology and configuration contract
pnpm verify              # complete local quality gate
```

Run the real PostgreSQL and MinIO integration checks with local infrastructure up:

```bash
TEST_DATABASE_URL=postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom \
TEST_S3_ENDPOINT=http://localhost:9000 \
TEST_S3_ACCESS_KEY=mergecom-local \
TEST_S3_SECRET_KEY=mergecom-local-only \
pnpm test:integration
```

See [local setup](docs/setup/local-development.md),
[identity and RBAC](docs/security/identity-rbac.md),
[projects and folders](docs/product/projects-folders.md),
[artifact versioning](docs/product/artifact-versioning.md),
[secure OOXML ingestion](docs/product/ooxml-ingestion.md),
[semantic comparison](docs/product/semantic-comparison.md),
[review workflow](docs/product/review-workflow.md),
[conservative merge](docs/product/conservative-merge.md),
[Office host capture](docs/product/office-host-capture.md),
[Office version push](docs/product/office-version-push.md),
[Office version retrieval](docs/product/office-version-pull.md),
[notifications](docs/product/notifications.md),
[pilot deployment](docs/runbooks/pilot-deployment.md),
[troubleshooting](docs/troubleshooting/local-development.md), and
[phase status](docs/phase-status.md) for operational detail.

## Safety

The codebase has a controlled pilot deployment path but is not production-approved
and must not be used with confidential files without an explicit security and
operations review.
Legacy prototypes remain historical evidence only and are excluded from pnpm, Turbo,
CI builds, and deployment paths. The replacement public repository excludes the
pre-containment Git ancestry; the original exposure and residual local copies remain
documented in
[the Phase 0 exposure inventory](docs/security/phase-0-exposure-inventory.md).
