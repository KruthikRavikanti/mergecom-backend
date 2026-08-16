# Local development

## 1. Install pinned tools

Use Node.js `24.18.1`, pnpm `11.22.0`, .NET SDK `10.0.400`, and Docker Compose v2.
The repository intentionally rejects a mismatched Node or pnpm version during install.

## 2. Install dependencies

```bash
pnpm install --frozen-lockfile
cp infra/compose/.env.example infra/compose/.env
```

All values in the Compose example are local-only. Do not reuse them outside a local
developer machine.

## 3. Start dependencies and processes

```bash
pnpm infra:up
export DATABASE_URL=postgresql://mergecom:mergecom-local-only@localhost:5432/mergecom
export AUTH_MODE=development
export SMTP_URL=smtp://localhost:1025
# PowerPoint candidate generation remains off unless both pilot controls are set.
export POWERPOINT_AUTOMATIC_MERGE_ENABLED=false
export POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS=
pnpm --filter @mergecom/api db:migrate
pnpm --filter @mergecom/api db:seed
pnpm dev
```

Readiness endpoints are dependency-aware:

- API: `http://localhost:3001/health/ready` requires PostgreSQL and the private
  MinIO artifact bucket.
- Worker: `http://localhost:3002/health/ready` requires PostgreSQL, Redis, the
  private MinIO bucket, and the document engine.
- Document engine: `http://localhost:3003/health/ready` has no external dependency.

MinIO creates the `mergecom-artifacts` bucket through the one-shot `minio-init`
container. Mailpit receives local SMTP traffic on port `1025` and exposes its UI on
port `8025`.

## 4. Local identity

The development login control exchanges one of the identities created by `db:seed`
for a database-backed API session. It does not use local storage, accept a role from
the browser, or create an organization. The seed command refuses production and
creates two organizations with every organization role, four projects, nested
folders, document records, and all four project roles. Running it again is
idempotent.

Projects, project teams, folders, documents, artifacts, versions, and normalized
snapshot summaries always come from the API. There is no browser fixture flag. New
versions remain in an honest processing state while the worker safely inspects them.

Mailpit receives local invitation messages through `SMTP_URL`. Non-production can
also return the one-time acceptance URL to an authorized owner/admin when
`EXPOSE_INVITATION_LINKS=true`.

## 5. Stop local infrastructure

```bash
pnpm infra:down
```
