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
# PowerPoint and Excel candidate generation remain off unless both format controls are set.
export POWERPOINT_AUTOMATIC_MERGE_ENABLED=false
export POWERPOINT_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS=
export EXCEL_AUTOMATIC_MERGE_ENABLED=false
export EXCEL_AUTOMATIC_MERGE_PILOT_ORGANIZATION_IDS=
pnpm --filter @mergecom/api db:migrate
pnpm --filter @mergecom/api db:seed
pnpm dev
```

Readiness endpoints are dependency-aware:

- API: `http://localhost:3001/health/ready` requires PostgreSQL and the private
  MinIO artifact bucket.
- Worker: `http://localhost:3002/health/ready` requires PostgreSQL, Redis, the
  private MinIO bucket, document engine, and rendition engine.
- Document engine: `http://localhost:3003/health/ready` has no external dependency.
- Rendition engine: `http://localhost:3004/health/ready` requires LibreOffice and
  qpdf. Compose supplies the pinned toolchain and an isolated internal network.

MinIO creates the `mergecom-artifacts` bucket through the one-shot `minio-init`
container. Mailpit receives local SMTP traffic on port `1025` and exposes its UI on
port `8025`.

Visual comparison is enabled locally. The MinIO initializer applies exact-origin
CORS for the web and Office development origins. Use
`VISUAL_COMPARISON_ENABLED=false` to exercise typed fallback without requesting PDFs.

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

## 5. Office task pane

The Office task pane is served separately over trusted HTTPS:

```bash
pnpm --filter @mergecom/office-addin dev
pnpm --filter @mergecom/office-addin manifest:validate
```

The server uses `office-addin-dev-certs` material outside the repository and listens
at `https://localhost:5176`. Sideload exactly one host manifest from
`apps/office-addin/manifest.word.xml`, `manifest.excel.xml`, or
`manifest.powerpoint.xml`. See `docs/runbooks/office-addin.md` for the support matrix
and refusal behavior.

The API must use `OFFICE_ADDIN_ORIGIN=https://localhost:5176`. The task pane proxies
`/api` to the local API and `/blob` to MinIO so its HTTPS runtime never sends mixed
content. Sign in through the local web app, then retry the session in the pane.

## 6. Stop local infrastructure

```bash
pnpm infra:down
```
