# Phase 15 command results

Date: 2026-08-20

Branch: `phase-15/pilot-deployment`

## Results

- Production API and worker configuration tests passed with explicit TLS database,
  Redis, SMTP, S3, OIDC, hosted-origin, proxy-hop, log-level, and secret contracts.
  Missing dependencies, loopback endpoints, insecure transports, invalid settings,
  and local fallbacks were refused.
- The document engine passed 76 tests, including a production startup refusal for
  the local internal token.
- Four deployment contract tests passed. They cover synthetic-config refusal,
  immutable image references, automatic-merge allowlists, loopback-only bindings,
  hosted Office manifest rendering, external stateful dependencies, migration
  ordering, non-root images, and image health checks.
- Shell syntax checks passed for deployment, PostgreSQL backup/restore drill, and
  object-protection scripts. Ruby/Psych parsed the Compose and GitHub workflow YAML,
  and `git diff --check` found no whitespace errors.
- The final root `pnpm verify` passed formatting, lint, strict TypeScript, deployment
  tests, JavaScript and .NET unit suites, default integration startup checks,
  production builds, .NET release build, production-auth bundle policy, and 48
  desktop/mobile browser scenarios. Thirty explicitly gated live infrastructure
  scenarios were skipped by the default gate.
- The production pnpm audit and direct/transitive .NET audit reported no known
  vulnerable packages.

## Environment limitation

The local shell had Node.js `26.5.1`, not the repository-pinned `24.18.1`, so pnpm
reported an engine warning. The pinned Node version remains enforced in CI and in
all Node image build stages.

Docker is not installed on this machine. Local application image builds and Docker
Compose expansion could not be run. CI now runs `docker compose config --quiet` for
the synthetic pilot configuration and `docker buildx build --check` for all six
Dockerfiles. The manual `Pilot images` workflow performs the complete multi-platform
build and registry publication; a real release still requires that workflow plus the
external health and Office smoke checks in the operator runbook.

## Commands

```text
node --test infra/deployment/deployment.test.mjs
node infra/deployment/validate-config.mjs infra/deployment/.env.validation.example --allow-synthetic
bash -n infra/deployment/*.sh
pnpm --filter @mergecom/api test:unit
pnpm --filter @mergecom/worker test:unit
dotnet test services/document-engine/MergeCom.DocumentEngine.sln --configuration Release --nologo
pnpm verify
pnpm audit --prod --audit-level high
dotnet list services/document-engine/MergeCom.DocumentEngine.sln package --vulnerable --include-transitive
```
