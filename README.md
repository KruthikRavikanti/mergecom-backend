# MergeCom

MergeCom is intended to become version control for Microsoft Office documents. This repository currently contains legacy Office.js experiments and a filesystem server retained only as migration evidence. It is not a production service and must not be used with confidential documents.

Phase 0 contains the exposed development key and generated document data in the current branch, records the audited baseline, and fixes the target architecture before implementation begins. See [docs/phase-status.md](docs/phase-status.md) for the current gate.

## Current repository map

```text
Mergecom V1/                  Word Office.js technical spike
Mergecom V1 PowerPoint/       PowerPoint Office.js technical spike
Mergecom V2 Excel/            Excel Office.js technical spike
server.js                     legacy localhost filesystem server
docs/                         Phase 0 audit, decisions, and runbooks
```

The React frontend audited during Phase 0 is currently attached as a sibling workspace at `../mergecom-frontend`; it is not tracked by this Git repository yet. Phase 1 will migrate it into the canonical monorepo.

## Legacy verification

Use Node.js 20 or later. These commands verify the historical projects; they do not make them production-capable.

```bash
npm ci
npm run legacy:certs
npm run legacy:start
```

The certificate setup can request interactive operating-system trust confirmation. The legacy server listens only on `127.0.0.1:3001`, accepts browser requests from the local task pane, and reads certificates generated outside the repository by `office-addin-dev-certs`. There is deliberately no normal `start` script.

Each add-in is checked separately:

```bash
cd "Mergecom V1" && npm ci && npm run build && npm run lint && npm run validate
cd "Mergecom V1 PowerPoint" && npm ci && npm run build && npm run lint && npm run validate
cd "Mergecom V2 Excel" && npm ci && npm run build && npm run lint && npm run validate
```

Builds and manifest validation pass at the Phase 0 baseline; lint failures are documented in [docs/verification/phase-0-command-results.md](docs/verification/phase-0-command-results.md). There are no tests.

## Read first

- [As-is architecture](docs/as-is-architecture.md)
- [Target architecture](docs/target-architecture.md)
- [Migration map](docs/migration-map.md)
- [Version semantics](docs/product/version-semantics.md)
- [Security exposure inventory](docs/security/phase-0-exposure-inventory.md)
- [Security policy](SECURITY.md)
