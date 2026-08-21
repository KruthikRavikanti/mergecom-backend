# Visual comparison workspace

Visual comparison is a derived review surface for two immutable Office versions. The
semantic comparison remains authoritative for what changed. Renditions and visual
locations help a reviewer understand those changes, but never replace an Office
artifact, determine equality, or provide merge evidence.

## Artifact boundaries

The feature keeps four independently versioned artifacts:

| Artifact | Authority | Lifecycle |
| --- | --- | --- |
| Original Office package | Download, restore, and version history | Immutable |
| Normalized snapshot and semantic comparison | Equality and typed changes | Immutable for a parser/schema profile |
| PDF rendition | Visual orientation | Private, derived, regenerable |
| Comparison visualization | Change-to-viewer navigation | Private, derived, regenerable |

A rendition is identified by the source SHA-256, renderer profile, renderer version,
and font-pack version. A comparison visualization is identified by the comparison,
visual-map schema, renderer profile, and visual-map engine version. Updating a
renderer or font pack creates a new derived artifact; it never changes an existing
row or source version.

## Fidelity statement

MergeCom previews are visually representative renditions generated outside Microsoft
Office. They are not guaranteed to be pixel-identical to Word, Excel, or PowerPoint.
Fonts, pagination, chart rendering, line wrapping, animations, media, themes, external
links, tracked changes, and unsupported Office features can differ. The workspace
shows these limitations next to semantic and visual-mapping coverage.

The original package remains available through the authorized exact-version download
flow. A preview must never be used to reconstruct, overwrite, restore, approve, or
merge an Office version.

## Workspace contract

Desktop uses a dense three-region review layout:

- The left rail filters and lists every semantic change, including unmapped changes.
- The center contains base and target viewers with synchronized navigation.
- The right inspector explains the selected change and hosts its review discussion.

The toolbar controls visual, overlay, structured, and typed-detail modes. It also
provides zoom, fit width, fit page, rotation, full screen, synchronized scrolling,
pane visibility, and version swapping. Selecting a change updates the `change` query
parameter so refreshes and copied links preserve context.

Tablet keeps both viewers and makes the inspector collapsible. Mobile shows one
viewer with an explicit Before/After segmented control; it never compresses two
documents into unreadable columns. Change navigation, typed fallback, inspector, and
review controls remain available.

## States and degradation

Each version can be `queued`, `running`, `retryable_failed`, `permanently_failed`,
`quarantined`, or `completed`. The workspace distinguishes:

- processing with attempt and retry information;
- unavailable or rejected renditions with a support trace;
- partial semantic coverage;
- partial or unavailable visual mapping;
- an expired viewing grant that can be refreshed without resetting position; and
- a viewer failure that falls back to the existing typed before/after comparison.

Rendition or mapping failure never hides a semantic change and never blocks the
existing review workflow.

## Format-aware behavior

### PowerPoint

The visual mode includes a slide filmstrip, per-slide change counts, stable slide and
shape locations, scaled shape bounds, reordering state, and an onion-skin overlay.
Slide-level navigation remains available when a shape cannot be mapped exactly.

### Excel

The structured mode is an authorized virtualized grid. It displays stored values and
formulas, types, style indicators, merged ranges, and hidden row/column state when the
normalized snapshot models them. It never recalculates formulas. Sheet tabs, cell
coordinates, synchronized position, a formula bar, and a change-density heat map
provide direct navigation.

### Word

Visual mode uses PDF pages for orientation. Structured mode renders normalized
headings, paragraphs, lists, table cells, and section boundaries for deterministic
navigation. Inline word differences are derived from the persisted before/after
values. Structured mode is not presented as an Office renderer.

## Visual location contract

Every persisted semantic change receives a visualization entry. It can have one or
more base or target locators, or an explicit unavailable reason. Locators use:

```ts
interface VisualLocator {
  side: 'base' | 'target';
  kind: 'page' | 'slide' | 'sheet_cell' | 'paragraph' | 'table_cell';
  page?: number;
  slideId?: string;
  sheetId?: string;
  cell?: string;
  semanticPath?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  confidence: 'exact' | 'approximate' | 'unavailable';
}
```

Bounding boxes are normalized to `0..1` coordinates. Added content can omit a base
locator and removed content can omit a target locator. Moved content can carry origin
and destination locators. Page-only matches are approximate and are labelled as such.

## Authorization and grants

Rendition status, normalized visual data, visualization maps, and viewing grants use
the same organization/project/document not-found boundary as exact artifacts. A grant
is short-lived, scoped to one private object, and issued only after authorization is
rechecked. Removing project access immediately prevents grant refresh, structured
data reads, visualization reads, and review reads. Object-store URLs are not durable
application links.

## Review integration

The inspector reuses append-only review threads anchored to the comparison and stable
change ID. A copied comparison link includes immutable document, comparison, mode,
side, and change context. Request review, comment, resolve, approve, and request
changes keep existing authorization and approval-pointer behavior. Visual comparison
does not add editing or accept/reject operations.

## Rollout and operations

Visual comparison is enabled by organization and file type. Creating a comparison
prewarms both standard renditions when the organization is enabled. Derived artifacts
are quota-counted, reference-checked before cleanup, and cached by immutable source
and renderer identity. Metrics cover queue age, duration, failures, timeouts, output
size, cache hits, mapping coverage, grant refresh, and viewer load failure.

Pilot release requires malicious-document, cross-tenant, signed-grant, CORS, CSP,
resource-exhaustion, accessibility, and perceptual rendering checks. Renderer and
font updates require fixture comparison and an explicit version change.
