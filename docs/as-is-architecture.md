# As-is architecture

Status: verified during Phase 0 on 2026-08-15 at original commit `fb00ed1860a9ffcbda293e2e58818aa10ca288a3`.

## Repository topology

The Git repository is `mergecom-backend`. Its default and only remote-tracking development branch at audit time was `main` from `https://github.com/KruthikRavikanti/Mergecom.git`. A separate React frontend is attached at `../mergecom-frontend` but is not in this Git repository.

| Area | Stack | Classification | Evidence |
| --- | --- | --- | --- |
| `server.js` | Node.js, Express 5, HTTPS, filesystem JSON | Real localhost transport; unsafe prototype persistence | Global workbook/presentation paths and four unauthenticated routes |
| `Mergecom V1/` | Office.js Word task pane, webpack, JavaScript | Broken technical spike | Posts `{content}` to `/save`, which expects `{workbook}` |
| `Mergecom V1 PowerPoint/` | Office.js PowerPoint task pane, webpack, JavaScript | Partial and destructive technical spike | Extracts selected slide/shape properties; pull deletes slides/shapes and reconstructs a subset |
| `Mergecom V2 Excel/` | Office.js Excel task pane, webpack, JavaScript | Partial and destructive technical spike | Extracts used ranges; pull creates replacement sheets and deletes originals |
| `../mergecom-frontend` | Vite, React 18, TypeScript, Tailwind, Lucide | Visual and workflow mock | Browser-controlled auth/data with local storage and seeded state |

There were four source lockfiles at audit time: one at the server root and one per add-in. An additional lockfile below tracked `node_modules` was generated dependency content, not a source lockfile.

## Actual prototype contracts

```text
Word add-in     POST /save { content: <body OOXML string> }
Legacy server  POST /save { workbook: <array> }
Excel add-in   POST /save { workbook: <array of partial worksheet models> }
PowerPoint     POST /save-presentation { presentation: <array of partial slide models> }

GET /load               -> one global saved_workbook.json value
GET /load-presentation  -> one global saved_presentation.json value
```

There is no user, organization, project, document, version, parent/base version, authorization, concurrency, integrity, object-store, or retention boundary. Every successful save overwrites a process-global file.

## Flow classification

| Flow | Status | Consequence |
| --- | --- | --- |
| Word push | Broken | Body OOXML is captured, but the server rejects the payload because `workbook` is absent. Body OOXML is not a complete `.docx` package. |
| Word pull | Broken and destructive | The server returns workbook-shaped data, while the client reads `data.content`; it clears the body before inserting the value. Even with a matching response, package-level parts would be lost. |
| Excel push | Partial | Used-range values, formulas, offsets, and limited uniform formatting are serialized. Charts, names, links, macros, hidden state, per-cell formatting, and other package parts are not authoritative. |
| Excel pull | Destructive and lossy | Replacement sheets are created from the partial model and every original sheet is deleted. Unsupported workbook features can be lost silently. |
| PowerPoint push | Partial | A subset of slide, shape, text, position, and formatting properties is serialized. It is not the compressed presentation package. |
| PowerPoint pull | Destructive and lossy | All slides except the first are deleted, first-slide shapes are cleared, and a subset is reconstructed. Unsupported parts can be lost silently. |
| Server storage | Real but unsafe | Synchronous writes persist one workbook and one presentation globally with no authorization or durability contract. |
| Frontend project/history UI | Mock | State is seeded and stored in the browser. Downloads, previews, reviews, and controls do not prove server behavior. |

## Security and operational baseline

- The original branch tracked a self-signed development private key and certificate, generated Office JSON, and 49,243 files under `Mergecom V1/node_modules`.
- The server had unrestricted CORS and logged full request and response payloads.
- PowerPoint and Excel clients logged extracted or returned document payloads.
- Manifests use localhost URLs but retain `Contoso` provider, support, description, and production URL placeholders.
- There is no authentication, authorization, tenant isolation, audit trail, rate limiting, malware scanning, queue, database, object store, CI, deployment definition, or test suite.
- The frontend contains plain-text demo credentials, browser-enforced roles, mock downloads, and unsupported compliance/security claims.

Containment changes on the Phase 0 branch remove current-tree exposures and disable accidental normal startup, but they do not upgrade any prototype component to production status.

## Reusable evidence

- Office host declarations, task-pane bootstrap, sideloading setup, and icons pending branding review.
- Selected PowerPoint and Excel extraction experiments as capability research and future sanitized fixture ideas.
- Word OOXML access as evidence of an Office.js API path, not as a full-file capture contract.
- Frontend layouts, workflow vocabulary, and interaction intent.
- The words push/pull and the local transport shape as product research only.

Everything reused must be moved behind production contracts. No reconstruction path may be used for download, restore, or rollback.

