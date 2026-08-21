# Phase status

## Phase 0: security containment, repository normalization, architecture record

Status: current-tree containment and architecture record complete on `phase-0/security-normalization`; history rewrite intentionally deferred pending explicit owner approval.

Safety point:

- Original commit: `fb00ed1860a9ffcbda293e2e58818aa10ca288a3`
- Original/default branch: `main`
- Remote: `origin` at `https://github.com/KruthikRavikanti/Mergecom.git`
- Local annotated tag: `prototype-pre-rebuild-2026-08-15`
- The tag and Phase 0 branch have not been pushed.
- A pre-existing local edit to generated `saved_presentation.json` was preserved in a local stash named `phase0-local-backup-saved-presentation-2026-08-15`; it must not be pushed and may contain document data.

## Gate checklist

- [x] Dedicated branch and annotated local safety tag created before deletions.
- [x] Current-tree private key/certificate and generated Office JSON removed from tracking.
- [x] All 49,243 tracked `node_modules` files removed from the index.
- [x] Repository-wide ignore rules added.
- [x] Full document payload logging removed from server and add-in spike paths identified by the audit.
- [x] Legacy server requires explicit startup, uses generated certificates, and restricts development CORS in code.
- [x] As-is, gaps, target, version semantics, migration, exposure, and architecture decisions documented.
- [x] History-cleaning procedure prepared but not executed.
- [x] Generated localhost certificate chain and contained server behavior verified over HTTPS.
- [x] Final builds and acceptance scans recorded.

## Historical exposure

Current-tree deletion does not remove blobs from existing commits, the local safety tag, remote `main`, or the local backup stash. The old private key is treated as compromised and must never be reused. History cleaning requires owner approval immediately before rewrite/force-push; see `docs/runbooks/history-cleaning.md`.

## Manual/external follow-up

- Confirm the interactive macOS Keychain trust prompt before Office sideload testing. The generated chain and server were verified directly, but system trust was not claimed.
- Configure a monitored project-controlled private security reporting channel before any pilot.
- Review and accept the Phase 0 branch before committing/pushing it. Do not publish the local safety tag or generated-data stash.
- Coordinate history cleaning separately if the owner chooses to replace public history.

## Phase 1 gate

Phase 1 may begin after the owner accepts the ADRs and the Phase 0 branch. History rewrite may remain pending if its public exposure and coordination requirements are explicitly tracked; it is not permission to reuse historical material.
