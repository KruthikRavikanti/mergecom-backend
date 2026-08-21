# Repository instructions

These instructions apply to the entire repository.

## Status and scope

- The root server and all three Office add-ins are legacy technical spikes.
- Do not extend `server.js` into the production API.
- Phase 1 must follow the accepted ADRs in `docs/adr/` and the migration map.
- Preserve unrelated work. Never rewrite Git history or force-push without explicit owner approval immediately before the operation.

## Non-negotiable document rules

- Original Office bytes are immutable.
- Never rebuild a file for download/restore from semantic JSON.
- Never log document contents.
- Semantic snapshots are derived comparison data, never the source artifact.
- A restore creates a new version and never mutates or deletes existing history.

## Security rules

- Never commit private keys, local certificates, `.env` files, generated `saved_*` data, or dependency directories.
- Use `office-addin-dev-certs` for localhost HTTPS certificates. Generated key material stays outside the repository.
- Do not use the legacy server or add-in pull paths with real documents; they have no authentication or tenant isolation and reconstruction is destructive or lossy.
- Do not claim compliance, certification, monitoring, encryption properties, or deployment options without implementation evidence and owner approval.

## Verified legacy commands

Run projects separately. A failure in one must not be hidden by another.

```bash
# Root legacy server
npm ci
npm run legacy:certs
npm run legacy:certs:verify
npm run legacy:start

# Word, PowerPoint, or Excel spike, from that add-in directory
npm ci
npm run build
npm run lint
npm run validate
```

The Phase 0 baseline on Node `v26.5.1` and npm `11.17.0` has passing installs, builds, and manifest validation but failing lint in all three add-ins. No add-in has a test or type-check script. See `docs/verification/phase-0-command-results.md` before interpreting a command as a regression.

The attached frontend is outside this Git root at `../mergecom-frontend`:

```bash
npm run build
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```

Its baseline build passes, lint and direct type checking fail, and tests are missing.

## Change expectations

- Keep architecture decisions in ADRs and update `docs/phase-status.md` when a phase gate changes.
- Add tests in proportion to behavior introduced. Never report missing tests or checks as passed.
- Keep production logs to identifiers, counts, status, timing, and trace metadata; exclude document text, formulas, comments, file bytes, normalized payloads, and credentials.
- Keep prototype compatibility only long enough to capture sanitized behavior. Production code must not depend on `/save`, `/load`, `/save-presentation`, `/load-presentation`, or the global JSON files.
