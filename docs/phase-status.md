# Phase status

## Phases 26-29: Office-first workflow and guided onboarding

Status: implementation complete in the current worktree; manual Office-host and
pilot-organization acceptance remain release gates.

### Phase 26: Office Save and Compare

- [x] The shared task pane can capture an exact saved package, push an immutable
  version, resolve a deterministic baseline, request comparison, and deep-link to
  the resulting workspace without reconstructing the Office file.
- [x] Save, package-access, stale-base, processing, unsupported-host, and retry states
  remain explicit across Word, Excel, and PowerPoint.

### Phase 27: My Work and workspace search

- [x] Role-authorized attention, recent work, reviews, failures, and conflict queues
  share cursor pagination and URL-persisted filters.
- [x] Global metadata search and recent-document tracking never search or index Office
  package content.

### Phase 28: Deterministic explanations

- [x] Versioned deterministic summaries classify substantive, formatting-only, and
  structural changes, expose attention reasons and approved-baseline context, and
  cite stable change identifiers.
- [x] Reports can omit before/after values by default; optional AI explanation is
  non-authoritative, feature-gated, and falls back to the deterministic result.

### Phase 29: Guided onboarding and feedback

- [x] Server-derived role-aware checklists use persisted project, document, version,
  comparison, review, and sample-exploration evidence with per-user dismiss state.
- [x] Tenant-local `[SAMPLE]` Word, Excel, and PowerPoint pairs run through normal
  upload, processing, comparison, authorization, visualization, and summary paths.
- [x] The comparison guide supports keyboard navigation, reduced motion, skip/resume,
  and inline focus without blocking the underlying workspace.
- [x] Office setup guidance selects host/platform-specific sideloading steps and
  exposes only non-secret readiness information.
- [x] Explicit feedback sends only the disclosed rating, reason, optional comment,
  route, resource category, and product version. Owner/admin read and JSON export are
  tenant scoped.

Product behavior is in `docs/product/quick-start.md` and
`docs/product/guided-onboarding.md`. Sample operations are in
`docs/runbooks/synthetic-demo.md`; implementation evidence is in
`docs/verification/phase-26-29-command-results.md`.

## Phases 16-25: Visual comparison workspace

Status: implementation complete in the current worktree; organization pilot
enablement and operator acceptance remain intentionally off by default.

### Phase 16: Contract and rendering spike

- [x] Product and architecture contracts separate immutable Office sources,
  semantic truth, private PDF renditions, and versioned visual mappings.
- [x] Sanitized Word, Excel, PowerPoint, linked-workbook, macro, and corrupt fixtures
  exercise the pinned LibreOffice/qpdf pipeline without logging package content.
- [x] Native spike evidence records bounded conversion time, output size, page
  consistency, representative fidelity language, and explicit renderer/font identity.

### Phase 17: Durable rendition pipeline

- [x] PostgreSQL owns immutable rendition identity, lifecycle, leases, retries,
  terminal evidence, outbox dispatch, cache references, and completion metadata.
- [x] Tenant-scoped APIs request/status renditions, return short-lived inline grants,
  and expose authorized normalized visual data without changing source artifacts.
- [x] Repeated requests and same-source versions share one tenant-private cache object;
  cleanup retains it while any rendition row references it.

### Phase 18: Isolated rendition engine

- [x] A worker-authenticated Node service validates standard OOXML packages before
  invoking LibreOffice in a random profile and validates qpdf output before return.
- [x] Macro, encrypted, corrupt, traversal, archive-expansion, invalid PDF action,
  timeout, input-size, and output-size paths fail closed with bounded error contracts.
- [x] Local and pilot topology runs the non-root service read-only, without egress,
  with dropped capabilities and bounded processes, memory, CPU, files, and temporary
  storage.

### Phase 19: Side-by-side workspace MVP

- [x] The comparison route now uses a three-region visual workspace with a semantic
  change rail, two PDF.js viewers, collapsible inspector, and dense toolbar.
- [x] Zoom, fit, rotate, page navigation, synchronized navigation, pane swap/hide,
  overlay, full screen, grant refresh, URL selection, typed degradation, and mobile
  Before/After behavior are implemented.
- [x] Desktop, tablet, and mobile Playwright profiles cover the browser surface.

### Phase 20: Change mapping

- [x] A separate versioned `comparison_visualizations` artifact maps every stable
  change to exact, approximate, or explicitly unavailable locators.
- [x] Navigation preserves added/removed placeholders, page/slide/sheet/cell/path
  context, normalized bounds, mapping confidence, and independent coverage metrics.

### Phase 21: PowerPoint visual comparison

- [x] Parser/schema `1.2.0` models slide size and stable shape bounds in addition to
  shape identity, order, text, category, notes, and package limitations.
- [x] Slide filmstrips, per-page change counts, shape overlays, direct slide
  navigation, structured slide geometry, and onion-skin blending are available.

### Phase 22: Excel visual comparison

- [x] Authorized snapshot data drives a row/column-virtualized grid with sheet tabs,
  coordinates, headers, formula bar, stored formulas/values, styles, merged ranges,
  hidden state, synchronized viewport, and change heat map.
- [x] The browser never recalculates formulas; unsupported charts, drawings, links,
  and macros remain explicit semantic coverage limitations.

### Phase 23: Word visual comparison

- [x] Word offers visual PDF and deterministic structured modes for headings,
  paragraphs, lists, tables, sections, and exact stable paths.
- [x] Inline token differences, added/removed ghost blocks, exact table-cell
  selection, ordered whitespace, and nearest visual-page navigation preserve the
  semantic result without claiming Office layout fidelity.

### Phase 24: Review integration

- [x] The inspector hosts anchored append-only threads, replies, resolution, review
  requests, and approval/changes-requested decisions under existing authorization.
- [x] Review pages, copied links, and anchored notifications reopen the immutable
  comparison, stable change, mode, and side context.

### Phase 25: Security, performance, and pilot controls

- [x] Comparison creation prewarms both renditions without blocking semantic work;
  lazy PDF ranges and virtualized workbook regions bound browser loading.
- [x] Source/renderer/font cache identity, unique-object quota accounting,
  reference-safe cleanup, signed grants, CORS/CSP policy, and organization/file-type
  feature gates are implemented.
- [x] Metrics cover queue age, conversion and viewer duration, failures, timeouts,
  output size, cache hits, grants, visual reads, and mapping coverage.
- [x] Deployment configuration, six-image build workflow, readiness, troubleshooting,
  backup implications, malicious fixtures, accessibility controls, and release
  verification are documented. A real pilot organization and external alert routing
  remain operator release gates, not code defaults.

The product contract is in `docs/product/visual-comparison.md`, isolation rationale
is in `docs/adr/0008-isolated-libreoffice-renditions.md`, operational recovery is in
`docs/runbooks/rendition-processing.md`, and local evidence is in
`docs/verification/phase-16-25-command-results.md`.

## Phase 15: Pilot deployment baseline

Status: implementation complete on `phase-15/pilot-deployment`; pending owner and
operator review.

- [x] Six pinned, multi-stage images run API, worker, document engine, rendition
  engine, web, and the Office add-in as non-root users with health checks and
  read-only runtime support.
- [x] Pilot Compose uses immutable application image digests, a one-shot migration
  gate, no bundled stateful services, no public internal-service ports, dropped
  capabilities, no-new-privileges, bounded temporary filesystems, and readiness
  ordering.
- [x] API, worker, and document engine fail closed on incomplete or local production
  dependencies; TLS database configuration, exact origins, proxy trust, log levels,
  SMTP, storage, OIDC, and internal tokens are validated.
- [x] Hosted Office images bake the web origin and serve separately rendered,
  no-cache Word, Excel, and PowerPoint manifests without changing local manifests.
- [x] Preflight rejects placeholders, mutable image tags, synthetic CI settings,
  insecure dependency URLs, invalid proxy/port values, and an enabled automatic-merge
  pilot without an organization UUID allowlist.
- [x] CI validates Compose expansion, Dockerfile policy, deployment tests, and build
  checks; a manual workflow publishes multi-architecture images with SBOM,
  provenance, and reported digests.
- [x] Deployment, release verification, PostgreSQL logical backup and isolated
  restore drill, object protection checks, rollback, network, Entra, CORS, logging,
  metrics, and alerting procedures are documented.

The operator contract is in `docs/runbooks/pilot-deployment.md`; command evidence is
in `docs/verification/phase-15-command-results.md`. This phase creates a pilot path,
not a production approval.

## Phase 14: Office exact version retrieval

Status: implementation complete on `phase-14/office-version-pull`; pending owner
review.

- [x] The linked pane lists every authorized immutable version and defaults retrieval
  to the branch head without changing the current file's stored base.
- [x] Every pane retrieval obtains a fresh CSRF-protected, audited, short-lived
  download grant for the exact selected version; grant filename and SHA-256 must
  match the authorized version metadata.
- [x] Open-copy downloads through the signed object URL with progress and
  cancellation, requires the exact byte count, then verifies OOXML ZIP signature,
  host/extension/media-type agreement, and SHA-256 before invoking Office.
- [x] Word `.docx`, Excel `.xlsx`, and PowerPoint `.pptx` use their supported host API
  requirement sets to open a separate file. The active document is never cleared,
  reconstructed, or replaced.
- [x] Automatic open requires a clean scan and a package no larger than 50 MiB.
  Macro-enabled packages, larger packages, missing host APIs, pending scans, and
  refused states remain available through exact download only.
- [x] Local signed MinIO downloads use the HTTPS task-pane proxy; hosted grants are
  left unchanged. Direct downloads still use the Office browser boundary rather
  than exposing object keys or storage credentials.
- [x] Shared and adapter tests cover exact verification, wrong hashes and lengths,
  non-ZIP data, host capability gates, all three open APIs, binary download progress,
  cancellation, and invalid grants.
- [x] Live desktop/mobile coverage performs a real Word capture, push, processing,
  pane pull, SHA-verified open, and pane download, proving the returned bytes are
  identical to the source fixture with no horizontal overflow.

The retrieval contract is documented in `docs/product/office-version-pull.md`;
setup and failure recovery are in `docs/runbooks/office-addin.md`, and command
evidence is in `docs/verification/phase-14-command-results.md`.

## Phase 13: Office document binding and exact version push

Status: implementation complete on `phase-13/office-version-push`; pending owner
review.

- [x] The shared pane uses an Office dialog and two-minute atomic handoff to obtain
  its own HttpOnly API session, shows explicit signed-out/workspace states, rejects
  replay, and never stores an identity token.
- [x] API CORS and CSRF accept only the configured web and exact Office origins;
  hostile lookalike origins remain rejected.
- [x] Linking embeds only versioned organization, project, document, and kind IDs in
  the Office Settings property bag, then reauthorizes them against the active tenant
  on every startup.
- [x] Per-file base context uses a document-URL-scoped hashed local key, is accepted
  only while the version remains authorized, and can be recovered for copies only by
  an exact artifact hash match.
- [x] Project and recursively nested document selection comes from the generated API
  contract and excludes document kinds that do not match the active Office host.
- [x] Exact capture drives idempotent single or multipart signed upload, progress,
  cancellation, staged cleanup, finalize source `office_addin`, duplicate-byte
  refusal, and required version notes.
- [x] Created pushes advance the local base, while stale or unbased pushes are shown
  as preserved conflicts and never as the latest version.
- [x] The pane polls real processing state and opens authorized web history without
  claiming to overwrite or replace the currently open Office file.
- [x] Local HTTPS development proxies API and MinIO traffic without mixed content;
  hosted signed URLs are not rewritten.
- [x] Unit coverage exercises dialog validation, binding validation, base isolation,
  grant rewriting, Office settings, exact single/multipart upload, provenance,
  cancellation, and cleanup. Live desktop/mobile coverage exchanges and rejects
  replayed handoffs, creates real records, and proves exact bytes survive Office
  capture, MinIO upload, finalization, processing, and download.

The contract is documented in `docs/product/office-version-push.md`; setup and
failure recovery are in `docs/runbooks/office-addin.md`, and command evidence is in
`docs/verification/phase-13-command-results.md`.

## Phase 12: Office host exact package capture

Status: implementation complete on `phase-12/office-host-capture`; pending owner
review.

- [x] Word, Excel, and PowerPoint have separate schema-valid XML manifests; Phase 13
  corrected the whole-package permission to `ReadAllDocument` while retaining the
  `CompressedFile` requirement, branded bitmap icons, and trusted HTTPS source.
- [x] Office host and platform identity come from `Office.onReady`; query parameters only select the explicitly labeled non-Office browser preview.
- [x] The shared capture primitive caps size before allocation, reads every slice in order, rejects wrong indexes, empty data, overruns, short totals, invalid ZIP signatures, and host/extension mismatches, and always closes the Office file handle.
- [x] Captured package bytes receive a lowercase SHA-256, exact byte count, host, filename, and extension-derived media type before becoming available to a consumer.
- [x] Runtime capability checks fail closed for unsupported platforms, missing compressed-file access, unsaved/unknown filenames, and `.xlsm` on Mac where Office omits VBA signature parts.
- [x] iPad uses the documented 64 KiB slice limit; other accepted hosts use 4 MiB slices. Capture is capped at 100 MiB by default.
- [x] Successful capture emits `mergecom:office-package-captured`; Phase 13 now
  consumes the exact result through API finalization instead of presenting a local
  capture download as a version.
- [x] API session/upload, document binding, and base-version state were deliberately
  deferred here and completed in Phase 13. Authorized exact-version retrieval was
  completed in Phase 14.
- [x] Core and adapter suites cover the byte boundary and callback bridge; HTTPS Playwright simulations cover success and explicit refusals on desktop and mobile without overflow.

The behavior and support matrix are documented in
`docs/product/office-host-capture.md`; local certificates, manifest validation, and
sideloading are in `docs/runbooks/office-addin.md`, and command evidence is in
`docs/verification/phase-12-command-results.md`.

## Phase 11: Excel conflict analysis and safe merge

Status: implementation complete on `phase-11/excel-merge`; pending owner review.

- [x] Divergent Excel analysis persists cell, formula, worksheet, workbook, style, shared-string, table, chart, drawing, media, relationship, macro, signature, embedded-object, and unknown-package findings without exposing worksheet XML.
- [x] Automatic eligibility is restricted to modified literal values in existing, stably matched cells with unchanged formulas, types, styles, cell order, worksheet structure, and supporting package parts.
- [x] Disjoint cells on one worksheet, disjoint worksheets, and identical same-cell edits are supported; different same-cell edits and every structural or package change remain manual.
- [x] A global kill switch and organization UUID allowlist gate Excel candidate generation independently of analysis; both default off.
- [x] Candidates copy ours, apply only approved incoming cell values, pass bounded inspection, Open XML validation, exact semantic-union verification, and byte checks for every untouched package part.
- [x] Merge schema and engine `1.2.0` are carried through API, worker, database defaults, web evidence, and downloaded candidates while comparison engine metadata remains correctly versioned at `1.0.0`.
- [x] The web merge screen uses Excel-specific eligibility, blocker, strategy, and failure language, and the Office task pane supports Excel stale-workbook context.
- [x] Engine fixtures cover same-cell conflict, compatible overlap, same-sheet and cross-sheet disjoint edits, formulas, added cells, hidden worksheet structure, package features, validation, and untouched-part byte preservation.
- [x] Fresh and Phase 10 upgrade migrations, 32 real API tests, three real worker tests, and pilot-off/on desktop/mobile stale-base workflows pass.
- [x] Pilot-on browser downloads contain both users' visible worksheet values and retained column geometry; pilot-off runs persist no candidate or result version.

The support boundary is documented in `docs/product/conservative-merge.md`; pilot
controls and recovery are in `docs/runbooks/merge-processing.md`, and command evidence
is in `docs/verification/phase-11-command-results.md`.

## Phase 10: PowerPoint conflict analysis and safe merge

Status: implementation complete on `phase-10/powerpoint-merge`; pending owner review.

- [x] Every terminal merge persists a versioned semantic analysis with non-overlap, compatible overlap, true conflict, ambiguity, unsupported content, confidence, explanations, and explicit blockers.
- [x] PowerPoint analysis classifies slide, shape, text, chart, media, master, layout, theme, notes, relationship, macro, signature, embedded-object, and unknown package changes without returning raw XML.
- [x] Divergent automatic PowerPoint merge is restricted to modified text in stable, uniquely identified shapes with unchanged slide/shape order, unchanged text-node structure, unchanged non-text markup, and byte-identical supporting package parts.
- [x] Disjoint slides and same-slide disjoint shapes are supported; same-target incompatibility, additions/deletions/moves, grouped shapes, charts/media, layouts/masters/themes, notes, relationships, macros/signatures, embedded objects, and unknown parts remain manual.
- [x] A global kill switch and organization UUID allowlist gate candidate generation independently of analysis; both default off.
- [x] Candidates start from ours, apply only approved incoming shape paths, pass security inspection, Open XML validation, relationship/content-type resolution, semantic-union verification, and untouched-part byte checks before publication.
- [x] PostgreSQL retains the analysis and immutable base/ours/theirs provenance; successful publication continues to create one two-parent version and never replaces an input.
- [x] The web merge screen groups findings, explains automatic eligibility and blockers, and provides base/latest/incoming downloads without exposing OOXML paths.
- [x] The PowerPoint task pane surfaces stale-base context and inspect, preserve-incoming, and pull-latest host actions.
- [x] Engine fixtures cover disjoint slides, same-slide shapes, same-shape conflicts, delete/edit, grouped shapes, chart/media, layouts/masters/themes, notes, macros/signatures, embedded and unknown parts, byte preservation, and corrupt candidates.
- [x] Fresh and upgrade migrations, real API/worker/storage/engine integration, and desktop/mobile browser checks pass.

The support boundary is documented in `docs/product/conservative-merge.md`; pilot
controls and recovery are in `docs/runbooks/merge-processing.md`, and command evidence
is in `docs/verification/phase-10-command-results.md`.

## Phase 9: durable notifications

Status: implementation complete on `phase-9/notifications`; pending owner review.

- [x] Review and asynchronous document completion events fan out from the transactional outbox without changing mutation latency or publishing an event before recipient records exist.
- [x] PostgreSQL owns fanout and email queue state, bounded attempts, availability, leases, heartbeats, retry evidence, terminal completion, suppression, and dead letters.
- [x] Recipient resolution rechecks active organization membership, enabled identity state, and current project scope; review actors are excluded from their own social notifications.
- [x] A unique source-event/recipient notification and unique notification/channel delivery make duplicate BullMQ delivery a no-op.
- [x] In-app review and document activity default on, email defaults off, and email can only be enabled for an identity with a verified address.
- [x] SMTP messages contain generic workflow metadata and an authorized deep link, use deterministic message IDs, and do not include document names, comments, decision notes, or package content.
- [x] The tenant-scoped API exposes cursor-paginated inbox reads, unread counts, recipient-owned read mutations, read-all, and audited preference updates without exposing delivery internals.
- [x] The web app provides a polling inbox, unread header badge, all/unread views, deep-link navigation, mark-one/all-read behavior, and persisted channel controls.
- [x] Real PostgreSQL and SMTP integration covers fanout, actor exclusion, preference suppression, durable completion, provider IDs, and duplicate processing; focused unit tests cover retries and permanent failure.
- [x] Desktop and mobile Playwright cover the inbox, settings mutations, read state, and a live reviewer deep link with no clipping or horizontal overflow.

The contract is documented in `docs/product/notifications.md`; operational inspection
and recovery are in `docs/runbooks/notification-delivery.md`, and command evidence is
in `docs/verification/phase-9-command-results.md`.

## Phase 8: conservative three-way merge

Status: implementation complete on `phase-8/conservative-merge`; pending owner review.

- [x] Merge requests bind one explicit common base, the current branch head as ours, and one retained conflicted version as theirs; ancestry and clean completed ingestion are rechecked under tenant and project authorization.
- [x] Exact immutable bytes and source SHA-256 values cross a bounded, authenticated worker-to-engine protocol with parser, merge-schema, and engine version contracts.
- [x] Identical-head, fast-forward-theirs, and retain-ours strategies preserve exact package bytes for Word, PowerPoint, and Excel when all three inspections have complete coverage.
- [x] Divergent automatic merge is restricted to disjoint Word paragraph or table-cell text edits with unchanged text-node markup and unchanged supporting package parts.
- [x] The engine copies ours, applies only validated theirs paths, reopens and validates the candidate, then proves its semantic changes equal the exact union of both source deltas.
- [x] Unsupported formats, partial coverage, validation errors, changed package parts, overlapping paths, structural edits, changed markup, and candidate verification failures terminate as retained manual-resolution outcomes.
- [x] A successful candidate atomically creates an immutable artifact and two-parent version, advances the branch by compare-and-swap, and enters normal semantic ingestion; a moved head or exceeded storage quota preserves the candidate without publishing it.
- [x] PostgreSQL owns queue, lease, retry, terminal result, candidate evidence, audit, and outbox state; duplicate terminal delivery is a no-op and object writes are collision checked.
- [x] Document history starts eligible conflict merges, identifies merge parents, and exposes durable pending, success, failure, and manual-resolution states with authorized exact downloads.
- [x] Real PostgreSQL, object-storage, engine, worker, and desktop/mobile browser scenarios cover automatic disjoint merge, overlapping manual resolution, two-parent history, normal ingestion, replay, authorization, and retained candidates.

The boundary is documented in `docs/product/conservative-merge.md`; operational
inspection and recovery are in `docs/runbooks/merge-processing.md`, and command
evidence is in `docs/verification/phase-8-command-results.md`.

## Phase 7: persisted review and approval workflow

Status: implementation complete on `phase-7/review-workflow`; pending owner review.

- [x] Review requests target one clean, processed, immutable version and optionally one completed comparison whose target is that version.
- [x] Contributors and project leads can request review from active project leads or reviewers; a version author cannot review their own version.
- [x] Assignments are fixed at request time, current project scope is rechecked at decision time, and each assigned reviewer can append exactly one immutable decision.
- [x] Any changes-requested decision closes the review; unanimous approval closes it and advances a separate approved-version pointer without moving the branch head.
- [x] Branch locking and sequence checks prevent concurrent reviews from regressing the approved pointer; an older winning review is retained as superseded.
- [x] General and exact comparison-change threads persist append-only comments, preserve immutable anchors, and can be resolved only while the review remains open.
- [x] Review creation, decisions, cancellation, threads, comments, and resolution are idempotent, tenant scoped, audited, and emit transactional outbox events.
- [x] The web app exposes review discovery from history, request flows with and without a comparison, assignment and decision state, discussion/reply controls, approval actions, and the approved version marker.
- [x] Real PostgreSQL tests cover tenant denial, authorization, replay, append-only enforcement, anchored discussion, approval, changes requested, pointer monotonicity, and closed-review behavior.
- [x] Live desktop and mobile Playwright covers upload, comparison, review request, identity handoff, anchored discussion, reply, approval, and approved-version rendering.

The lifecycle is documented in `docs/product/review-workflow.md`; operational
inspection and recovery are in `docs/runbooks/review-workflow.md`, and command
evidence is in `docs/verification/phase-7-command-results.md`.

## Phase 6: deterministic semantic comparison

Status: implementation complete on `phase-6/semantic-comparison`; pending owner review.

- [x] Directional base-to-target comparisons are authorized, idempotent, and persisted with parser, snapshot schema, comparison schema, and engine versions.
- [x] PostgreSQL remains authoritative for queue, retry, lease, failure, result, typed changes, and outbox state; BullMQ provides deterministic delivery.
- [x] The worker re-verifies both immutable artifacts, regenerates same-parser snapshots, writes one collision-checked comparison object, and transactionally completes the comparison row.
- [x] Parser/schema `1.1.0` captures bounded PowerPoint shape text, formatting markup, and embedded image hashes; Excel cell values, formulas, types, styles, and defined-name formulas; and Word body blocks and formatting markup.
- [x] Unsupported notes, tables/charts, auxiliary Word stories, tracked-change semantics, macros, signatures, links, embedded objects, validation issues, and semantic truncation produce explicit partial coverage.
- [x] The engine returns stable typed `added`, `modified`, `moved`, and `removed` changes across content, structure, feature, and validation categories.
- [x] Byte equality is independent of semantic equality; partial comparisons never claim equality when no modeled difference is found.
- [x] Web history supports selecting exactly two processed clean versions, while the result route polls durable state and filters persisted changes by category.

The contract is documented in `docs/product/semantic-comparison.md`; operational
recovery is in `docs/runbooks/document-processing.md`, and command evidence is in
`docs/verification/phase-6-command-results.md`.

## Phase 5: secure OOXML ingestion and durable processing

Status: implementation complete on `phase-5/ooxml-ingestion`; pending owner review.

- [x] PostgreSQL records explicit queue, lease, retry, quarantine, dead-letter, and completion states plus one versioned snapshot per document version.
- [x] BullMQ uses deterministic job IDs, bounded exponential retries, heartbeats, lease expiry recovery, duplicate-delivery no-ops, and Redis AOF durability.
- [x] The worker authenticates to an internal ASP.NET Core engine, verifies immutable S3 bytes, and writes collision-checked snapshot objects before transactional completion.
- [x] Open XML SDK `3.5.1` performs read-only validation and deterministic PowerPoint, Excel, and Word inventory behind ZIP/XML security preflight.
- [x] Traversal, duplicate parts, unsafe relationships, bombs, oversized parts/counts, DTD/XXE, depth, encrypted and corrupt packages are bounded and classified.
- [x] Macros, digital signatures, external relationships, OLE/embedded objects, and unsupported binaries are detected and never executed or followed.
- [x] Web history polls active work and shows attempts, retry schedule, failure/quarantine codes, structured warnings, parser/schema versions, stable hash, and support trace.
- [x] Synthetic valid and adversarial fixtures cover deterministic/golden behavior, authentication, package defenses, duplicate delivery, real storage/database processing, and offline-worker restart recovery.

The contract and limits are documented in `docs/product/ooxml-ingestion.md`;
operational recovery is in `docs/runbooks/document-processing.md`, and command
evidence is recorded in `docs/verification/phase-5-command-results.md`.

## Phase 4: immutable artifact storage and version graph

Status: implementation complete on `phase-4/artifact-versioning`; pending owner review.

- [x] PostgreSQL migrations cover opaque artifacts, default document branches, immutable version graph nodes, staged uploads, processing job references, and transactional outbox events.
- [x] S3-compatible `BlobStore` and MinIO implementation provide private signed upload/download, byte streams, copy-to-immutable keys, multipart grants/completion/abort, object listing, and readiness.
- [x] Upload intents validate extension, document compatibility, maximum size, serialized organization quota reservations, and base membership without trusting client media types.
- [x] Finalization recomputes SHA-256 and size, validates ZIP magic, is idempotent, and atomically writes artifact, version, branch head, audit, processing, and outbox state.
- [x] Branch locking and compare-and-swap preserve stale and simultaneous uploads as explicit conflicts without changing the latest team version.
- [x] Authorized exact-version downloads return the expected SHA-256; restore appends a new node reusing the selected artifact and never mutates intermediate history.
- [x] Expiry and orphan cleanup are reference checked and do not delete retained artifacts. Prometheus metrics cover bytes, duration, failures, conflicts, and storage errors.
- [x] The web history uses the generated contract for direct upload progress, multipart completion, processing/conflict/failure states, exact download, and restore-as-new-version.
- [x] Real PostgreSQL/MinIO tests cover duplicate finalize, mismatch, interrupted multipart, authorization, expiry, stale/simultaneous pushes, restore, and exact bytes. Desktop/mobile Playwright covers history and upload states.

The protocol and lifecycle are documented in
`docs/product/artifact-versioning.md`. Verification evidence is recorded in
`docs/verification/phase-4-command-results.md`.

## Phase 3: projects, teams, folders, and documents

Status: implementation complete on `phase-3/projects-documents`; pending owner review.

- [x] Tenant-linked projects, project memberships, folders, documents, archive state, soft deletion, ordering, and idempotency records are covered by PostgreSQL migrations.
- [x] Composite foreign keys and a recursive database trigger reject cross-project parents and folder cycles.
- [x] Project, folder, document, archive, and team APIs use stable cursor pagination, idempotent creates, input validation, consistent errors, and optimistic concurrency timestamps.
- [x] Project roles are capped by active organization roles; owners/admins have automatic lead access and external reviewers always require explicit project scope.
- [x] Project-scoped invitations atomically establish organization and project memberships on acceptance.
- [x] The web dashboard, project content, nested breadcrumbs, team view, archives, destructive confirmations, and document metadata use the generated API client and query cache.
- [x] Fake project, team, folder, and document adapters were removed. Phase 4 later replaced the truthful empty history state with real immutable versions.
- [x] Audit events cover successful mutations and denied/failed project operations.
- [x] Real PostgreSQL tests cover two-session shared state, tenant denial, role caps, cycle and cross-project rejection, simultaneous rename conflicts, archive/restore/delete, audits, and cursor stability.
- [x] Desktop and mobile Playwright checks cover real project routes, nested folders, project creation, document metadata, and project teams.

The resource contract and lifecycle are documented in
`docs/product/projects-folders.md`. Verification evidence is recorded in
`docs/verification/phase-3-command-results.md`.

## Phase 2: identity, tenancy, and organization RBAC

Status: implementation complete on `phase-2/identity-rbac`; pending owner review.

- [x] Drizzle schema and PostgreSQL migration cover users, immutable identity mappings, organizations, memberships, invitations, sessions, OIDC transactions, controlled owner grants, admission policies, and audit events.
- [x] Entra OIDC authorization code flow uses discovery, PKCE, state, nonce, issuer/audience/signature validation, verified email-domain claims, and automatic signing-key discovery.
- [x] Opaque HttpOnly sessions enforce idle/absolute expiry, logout revocation, origin-checked CSRF tokens, and suspended membership denial.
- [x] First-owner creation requires an operator-created, time-limited grant bound to exact issuer, tenant, subject, and verified email. Public self-service organization creation does not exist.
- [x] Owner, admin, project lead, contributor, reviewer, viewer, and external reviewer permissions are centralized in one policy module and rechecked by transactional mutations.
- [x] Current-user, organization switch, invitation create/accept, membership list, role change, suspension/reactivation, and removal endpoints are generated into the shared client.
- [x] Cross-tenant paths return the same not-found response as unknown resources and create denial audit events without querying or returning the foreign tenant.
- [x] Login-adjacent, development identity, invitation creation, and invitation acceptance endpoints are rate limited.
- [x] The web app uses a protected route loader and real session client with loading, error, logout, organization, invitation, team, settings, and administration states.
- [x] Local development seeds two organizations and every role without passwords or production secrets.

The synthetic project and version boundary retained at the end of Phase 2 was
removed in Phase 3.

Configuration and the authorization matrix are documented in
`docs/security/identity-rbac.md`. Verification evidence is recorded in
`docs/verification/phase-2-command-results.md`.

## Phase 1: monorepo foundation and frontend migration

Status: implementation complete on `phase-1/monorepo-foundation`; pending owner review.

- [x] pnpm/Turborepo workspace and one root lockfile established.
- [x] Node.js 24.18.1, pnpm 11.22.0, and .NET SDK 10.0.400 pinned.
- [x] Word, PowerPoint, Excel, and Express prototypes moved under `legacy/` and excluded from active builds.
- [x] Web, shared Office add-in, API, worker, document engine, contracts, UI, Office core, and fixtures are buildable.
- [x] PostgreSQL, Redis, MinIO, bucket initialization, and Mailpit Compose services include health checks.
- [x] Web navigation uses real routes, protected deep links, explicit development demo auth, and generated health API types.
- [x] Prototype mock database, settings, control, project, and document-history modules were replaced by smaller feature boundaries.
- [x] Error boundary, route error, not-found, loading, toast, and accessible dialog states are present.
- [x] Vitest, xUnit, Testcontainers, and Playwright scaffolding is active; public and authenticated routes have desktop/mobile smoke tests.
- [x] CI covers formatting, lint, types, tests, builds, generated contracts, Compose configuration, and dependency scans.

The Phase 1 mock identity/member/settings boundary was removed in Phase 2. The
remaining project/version fixture boundary was removed in Phase 3.

Local verification evidence and known environment limits are recorded in
`docs/verification/phase-1-command-results.md`.

## Phase 0: security containment, repository normalization, architecture record

Status: containment and architecture record complete. The replacement public history
starts at the sanitized Phase 0 tree; pre-containment refs remain local only.

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
- [x] History-cleaning procedure prepared; clean replacement publication selected
  instead of rewriting the removed former remote.
- [x] Generated localhost certificate chain and contained server behavior verified over HTTPS.
- [x] Final builds and acceptance scans recorded.

## Historical exposure

Current-tree deletion does not remove blobs from old local commits, reflogs, the local
safety tag, the local backup stash, or copies made before the former remote was
removed. The replacement public repository excludes those refs. The old private key
is treated as compromised and must never be reused.

## Manual/external follow-up

- Confirm the interactive macOS Keychain trust prompt before Office sideload testing. The generated chain and server were verified directly, but system trust was not claimed.
- Keep GitHub private vulnerability reporting enabled before any pilot.
- Do not publish the local safety tag, generated-data stash, or any branch based on
  the pre-containment ancestry.

## Phase 1 entry gate

Phase 1 may begin after the owner accepts the ADRs and the Phase 0 branch. History rewrite may remain pending if its public exposure and coordination requirements are explicitly tracked; it is not permission to reuse historical material.

The owner's request to proceed with Phase 1 was treated as acceptance of this gate.
