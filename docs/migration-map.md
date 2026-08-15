# Migration map

Phase 1 created the canonical repository structure and moved evidence without carrying unsafe runtime contracts forward.

| Current source | Target | Treatment | Phase |
| --- | --- | --- | --- |
| `../mergecom-frontend/src/` | `apps/web/src/` | Migrated visual identity; server session loader, generated identity client, org switcher, invitations, and membership administration now replace prototype auth | 2 complete |
| `Mergecom V1/` | `legacy/office-spikes/word/` | Preserved as excluded evidence; body-clear restore and body OOXML remain prohibited product paths | 1 complete |
| `Mergecom V1 PowerPoint/` | `legacy/office-spikes/powerpoint/` | Preserved as excluded evidence; reconstruction pull remains prohibited | 1 complete |
| `Mergecom V2 Excel/` | `legacy/office-spikes/excel/` | Preserved as excluded evidence; worksheet replacement pull remains prohibited | 1 complete |
| Three add-in webpack/manifests | `apps/office-addin/` | Shared task-pane shell created; active host manifests and adapters remain Phase 3 work | 1 foundation complete |
| `server.js` | `legacy/server-prototype/` | Archived as behavior evidence; excluded from production workspace and CI | 1 complete |
| Root Express dependencies | `services/api/` | Replaced with Fastify/TypeBox/OpenAPI/Drizzle identity boundary; filesystem handlers were not ported | 2 complete |
| Global `saved_*.json` | none | Delete; no migration of document data | 0 |
| Committed `cert/` | external developer cert store | Delete; generate with `office-addin-dev-certs` and ignore | 0 |
| Four npm lockfiles | root `pnpm-lock.yaml` | Replaced by one pnpm lockfile; legacy projects are not installable workspace packages | 1 complete |
| Tracked `node_modules` | none | Delete and ignore; install from lockfiles | 0 |
| Prototype semantic JSON | `packages/contracts` and derived BlobStore snapshots | Redesign as versioned schemas; do not preserve payload shape as a product contract | 3-6 |
| Add-in push/pull | `packages/office-core` and API artifact flow | Replace with exact package capture, immutable upload, base-aware push, and exact-byte open/download | 3-4 |
| Browser mock identity/members/settings | PostgreSQL through `services/api` | Removed; immutable IdP mappings, server sessions, tenant checks, and RBAC are authoritative | 2 complete |

## Migration sequence

1. Create pnpm/Turborepo root, CI, formatting/lint/type/test policy, and Docker Compose services.
2. Import the frontend history/content into `apps/web` without a visual redesign and mark every mock boundary.
3. Move backend/add-in experiments under `legacy/` outside the active production build graph.
4. Create shared contracts and service skeletons from the accepted ADRs.
5. Replace misleading security/compliance claims with implemented, evidence-backed language.
6. Keep this map updated until every legacy path is deleted or has a named owner and removal gate.

## Phase 2 prerequisites

- Owner reviews and accepts the Phase 1 foundation.
- CI passes with Docker-backed PostgreSQL Testcontainers coverage.
- Microsoft Entra application registration values are provided through an approved secret-management path.
- History rewrite remains a separate coordinated operation unless explicit approval is provided.
- No production secrets or real Office documents are imported.
