# ADR 0009: Tenant-local synthetic onboarding samples

Status: accepted for Phase 29.

## Context

New users need a working comparison before they have an Office file, two processed
versions, or permission to create content. A global sample tenant would require
cross-tenant exceptions. Per-user copies would multiply storage, processing, cleanup,
and migration work while obscuring the normal authorization model.

## Decision

Each participating organization has one clearly labeled `[SAMPLE] MergeCom Guided
Tour` project with one Word, Excel, and PowerPoint document pair. The pairs contain
only reviewed synthetic fixtures. They use the normal project, document, exact
artifact, version, processing, comparison, rendition, recent-document, and review
models.

Owners and admins retain automatic access. Active non-admin members receive a viewer
membership in the sample project, regardless of their broader organization role. An
owner/admin-only registry records one completed comparison for each document kind.
Both project and document names must start with `[SAMPLE] ` and restrictive foreign
keys protect registered resources.

The provision command is idempotent by resource name, fixture SHA-256, directional
version pair, and registry kind. Re-running it adds newly active members, restores
viewer-only sample access, and reuses completed artifacts and comparisons.

## Consequences

- Samples exercise production-like behavior without cross-tenant authorization
  exceptions or customer content.
- One organization pays for one synthetic set rather than one set per user.
- Sample exploration can be recorded through the existing recent-document model.
- Organization operators own provisioning and lifecycle; application startup never
  silently creates samples.
- Fixture changes require new generated packages and hashes. Existing immutable
  versions remain intact and a provision run adds only missing revisions.
