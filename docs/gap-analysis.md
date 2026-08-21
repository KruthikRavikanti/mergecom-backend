# Gap analysis

The prototype demonstrates product intent but has no production trust boundary. Phase 1 must establish foundations; later phases implement vertical product behavior.

| Capability | Current evidence | Required state | Earliest phase |
| --- | --- | --- | --- |
| Repository | Separate npm projects, four lockfiles, tracked dependencies | pnpm/Turborepo monorepo, one lockfile, shared policy and CI | 1 |
| Identity | Hard-coded frontend credentials | Microsoft Entra ID/OIDC, secure sessions, invitation and tenant controls | 2 |
| Authorization | Browser-selected roles; open server routes | API-enforced organization and resource authorization on every operation | 2 |
| Metadata | Browser local storage and two global JSON files | PostgreSQL schema, migrations, tenant ownership, version graph | 2-3 |
| File storage | Partial JSON overwrites | Immutable exact Office package bytes in S3-compatible storage with SHA-256 | 3 |
| API | Express filesystem prototype | Fastify TypeScript API with TypeBox schemas, OpenAPI, Drizzle, and idempotency | 2-3 |
| Processing | Inline extraction in add-ins | BullMQ/Redis orchestration and isolated ASP.NET Core document engine jobs | 5 |
| Office capture | Body or partial semantic reconstruction | Exact compressed package capture; semantic extraction only as derived data | 3-5 |
| Compare | UI representation only | Versioned Office-aware normalized snapshots and persisted typed diffs | 6-7 |
| Pull/download | Reconstructed or placeholder content | Authorized retrieval of exact immutable artifact bytes | 3-4 |
| Restore | Destructive replacement | New version pointing to an authorized older artifact; history preserved | 4 |
| Concurrency | Last writer replaces global file | Base version checks, stale-write rejection, idempotent commands | 4 |
| Merge | Partial reconstruction | Three-way, conservative, validated merge or manual resolution | 8 |
| Review/comments | Labels and local state | Persisted review requests, decisions, anchored threads, audit events | 7 |
| Notifications | Mock UI and console behavior | Transactional outbox, retries, in-app/email preferences | 9 |
| Security | Committed key, broad CORS, payload logs | Secret management, least privilege, scan/quarantine, safe logs, runbooks | 0 onward |
| Compliance claims | Unsupported marketing text | Truthful language backed by implemented controls and evidence | 1 onward |
| Quality | Builds without tests; lint/type failures | Unit, integration, contract, fixture, accessibility, and end-to-end gates | 1 onward |
| Operations | No CI/deployment/observability | Reproducible local stack, CI, deployment, telemetry, backups, incident process | 1 onward |

## Primary technical risks

1. Reconstructing Office files from partial JSON can silently corrupt or discard unsupported package parts.
2. Client-side authorization and global persistence provide no tenant isolation.
3. Office parsing and merge work is unsafe without bounded package processing, validation, and immutable inputs.
4. Product and compliance text currently promises behavior for which the prototype has no evidence.
5. The frontend is outside the backend Git repository, so Phase 1 must preserve its design while creating one canonical history and build graph.

## Phase 1 entry gate

Phase 1 can start when the Phase 0 branch has no tracked key, saved Office JSON, or dependency path; all ADRs are accepted; the history rewrite remains explicitly deferred; and the owner understands that the legacy server and reconstruction clients are migration evidence only.

