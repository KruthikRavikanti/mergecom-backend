# Migration map

Phase 1 creates the canonical repository structure and moves evidence without carrying unsafe runtime contracts forward.

| Current source | Target | Treatment | Phase |
| --- | --- | --- | --- |
| `../mergecom-frontend/src/` | `apps/web/src/` | Migrate visual prototype and terminology; replace local data/auth incrementally; remove unsupported trust/compliance copy | 1-2 |
| `Mergecom V1/` | `legacy/office-spikes/word/` | Preserve read-only host/bootstrap evidence; prohibit body-clear restore and body OOXML as full-file capture | 1 |
| `Mergecom V1 PowerPoint/` | `legacy/office-spikes/powerpoint/` | Preserve selected extraction experiments for research; prohibit reconstruction pull | 1 |
| `Mergecom V2 Excel/` | `legacy/office-spikes/excel/` | Preserve selected range extraction experiments for research; prohibit worksheet replacement pull | 1 |
| Three add-in webpack/manifests | `apps/office-addin/` plus host manifests | Build one shared task pane/core with host adapters; retain separate validated manifests initially | 1-3 |
| `server.js` | `legacy/server-prototype/` | Archive as behavior evidence after sanitized contract tests; no production compatibility route | 1 |
| Root Express dependencies | `services/api/` | Replace with Fastify/TypeBox/OpenAPI/Drizzle; do not port filesystem handlers | 2 |
| Global `saved_*.json` | none | Delete; no migration of document data | 0 |
| Committed `cert/` | external developer cert store | Delete; generate with `office-addin-dev-certs` and ignore | 0 |
| Four npm lockfiles | root `pnpm-lock.yaml` | Keep through Phase 0 for reproducibility; replace only during workspace migration | 1 |
| Tracked `node_modules` | none | Delete and ignore; install from lockfiles | 0 |
| Prototype semantic JSON | `packages/contracts` and derived BlobStore snapshots | Redesign as versioned schemas; do not preserve payload shape as a product contract | 3-6 |
| Add-in push/pull | `packages/office-core` and API artifact flow | Replace with exact package capture, immutable upload, base-aware push, and exact-byte open/download | 3-4 |
| Browser mock database | PostgreSQL through `services/api` | Use as UX seed/reference only; no plain-text credential or browser authorization migration | 2 |

## Migration sequence

1. Create pnpm/Turborepo root, CI, formatting/lint/type/test policy, and Docker Compose services.
2. Import the frontend history/content into `apps/web` without a visual redesign and mark every mock boundary.
3. Move backend/add-in experiments under `legacy/` outside the active production build graph.
4. Create shared contracts and service skeletons from the accepted ADRs.
5. Replace misleading security/compliance claims with implemented, evidence-backed language.
6. Keep this map updated until every legacy path is deleted or has a named owner and removal gate.

## Phase 1 prerequisites

- Owner accepts the ADR set and immutable-artifact/version semantics.
- Current branch passes Phase 0 tracking and payload-log acceptance checks.
- History rewrite remains a separate coordinated operation unless explicit approval is provided.
- Node.js 20+ and pnpm via Corepack are available; Docker and a supported .NET SDK version will be selected and pinned in Phase 1.
- The frontend source remains available at `../mergecom-frontend` for migration.
- No production secrets or real Office documents are imported.

