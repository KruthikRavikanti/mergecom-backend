# Projects, folders, and document records

## Scope

Phase 3 persists the workspace structure around future Office artifacts. A document
row is metadata only: it has a name, Office kind, location, ordering, archive state,
and concurrency timestamp. It does not imply that a file or version exists. Phase 4
adds immutable artifacts and version history.

## Data invariants

- Every project belongs to one organization. Every project membership, folder, and
  document is linked to both its organization and project.
- Composite foreign keys prevent a folder or document from referencing a parent in
  another project or tenant.
- A database trigger walks folder ancestry and rejects self-parenting and cycles.
- Active sibling folder names, active document names in one folder, and active
  project names in one organization are unique case-insensitively.
- Archive is reversible. Delete is a soft deletion for user-visible resources and is
  distinct from archive.
- Folder deletion requires an empty folder. Moving contents is an explicit operation.
- `sort_order` plus the immutable identifier provides deterministic folder and
  document ordering.

## Concurrency and replay

Create project, folder, and document requests require an `Idempotency-Key`. Reusing a
key with the same actor, operation, and body returns the original result; changing
the body returns `idempotency_conflict`.

Rename, move, reorder, archive, restore, and delete requests carry
`expectedUpdatedAt`. The mutation changes exactly one matching row. A stale timestamp
or active-name collision returns `409 conflict`, so one of two simultaneous renames
wins without silently overwriting the other.

List endpoints use opaque keyset cursors and return `items` plus `nextCursor`. Invalid
or context-mismatched cursors return `400 invalid_cursor`.

## Routes

All routes are under `/v1/organizations/{organizationId}/projects` and require the
active session organization to match the path organization.

- Projects: list, create, detail, update, archive, restore, and soft delete.
- Folders: child list, create, ancestry path, rename/move/reorder, and soft delete.
- Documents: list, create, detail, rename/move/reorder, archive, restore, and soft
  delete.
- Team: paginated list, add an active organization member, change a capped project
  role, and remove project scope.
- Invitations: the organization invitation route accepts a paired `projectId` and
  `projectRole` for owner/admin-created external assignments.

The OpenAPI source in `packages/contracts/openapi.yaml` is canonical. The web app
uses its generated types and route client rather than duplicating response models.

## Audit behavior

Successful create, rename, move, reorder, archive, restore, delete, member add, role
change, and member removal are written in the same transaction as the state change.
Denied and failed operations record low-risk reason metadata through the route error
boundary. Audit data never contains document bytes, invitation tokens, or signed
URLs.
