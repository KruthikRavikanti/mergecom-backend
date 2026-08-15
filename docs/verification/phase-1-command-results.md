# Phase 1 command results

Verified on 2026-08-15 with Node.js `24.18.1`, pnpm `11.22.0`, and .NET SDK
`10.0.400`.

## Passing checks

- Frozen-compatible pnpm install produced one root `pnpm-lock.yaml` for nine workspace projects.
- Strict TypeScript checks passed in all eight JavaScript/TypeScript packages.
- ESLint passed across the workspace.
- Vitest unit suites passed for web routing, API readiness, worker readiness, Office invariants, and the shared dialog.
- API and worker startup integration tests passed.
- xUnit document-engine startup tests passed for liveness and readiness.
- Web, Office add-in, API, worker, contracts, UI, Office core, and fixtures production builds passed.
- Playwright passed 28 route and behavior checks across desktop Chromium and a mobile Chromium viewport.
- Visual screenshots at `1440x900` and `390x844` showed no horizontal overflow or browser console errors on the home and project-dashboard routes.
- The production dependency audit reported no high or critical advisories after upgrading Fastify and React Router.
- The production bundle scan confirmed that development login text, session keys, demo identity values, and historical password values are absent.

## Environment-limited checks

Docker is not installed on the verification machine. The PostgreSQL Testcontainers
test is present and skipped unless `RUN_TESTCONTAINERS=true`; CI runs it with Docker.
Docker Compose health checks and image startup could not be executed locally.

The local machine defaulted to Node.js 26, so verification invoked the pinned Node.js
24.18.1 executable explicitly. The repository engine policy correctly records the
supported runtime.
