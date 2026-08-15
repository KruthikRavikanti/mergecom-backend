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
pnpm dev
```

Readiness endpoints are dependency-aware:

- API: `http://localhost:3001/health/ready` requires PostgreSQL.
- Worker: `http://localhost:3002/health/ready` requires Redis.
- Document engine: `http://localhost:3003/health/ready` has no external Phase 1 dependency.

MinIO creates the `mergecom-artifacts` bucket through the one-shot `minio-init`
container. Mailpit receives local SMTP traffic on port `1025` and exposes its UI on
port `8025`.

## 4. Optional web demo

Add `VITE_ENABLE_DEMO_AUTH=true` to `apps/web/.env.local`, then restart the dev command.
The button is compiled out of production behavior and uses only synthetic
`example.test` identities and in-memory fixtures.

## 5. Stop local infrastructure

```bash
pnpm infra:down
```
