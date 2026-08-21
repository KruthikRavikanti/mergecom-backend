# ADR 0008: Isolated LibreOffice rendition service

- Status: Accepted
- Date: 2026-08-21

## Context

The visual comparison workspace needs representative previews for immutable Word,
Excel, and PowerPoint versions. The ASP.NET Core document engine is an Open XML
semantic trust boundary: it performs bounded package inspection, normalization,
comparison, and conservative merge. LibreOffice is a much larger native application
with a different vulnerability, process, dependency, and resource profile.

Running LibreOffice inside the document engine would couple semantic correctness and
merge availability to a renderer crash, enlarge the engine image and attack surface,
and make network/filesystem isolation harder to reason about. Microsoft Graph
conversion would require copying artifacts into a second storage and identity domain
before MergeCom has a Microsoft 365 storage connector.

## Decision

Create a worker-only `services/rendition-engine` service. It accepts one authenticated
bounded Office package, writes it to a random per-job directory, invokes a versioned
headless LibreOffice process with a fresh user profile, validates the resulting PDF,
and returns the PDF with a compact manifest. It does not read MergeCom databases or
object storage and does not receive organization, document, user, or filename data.

The deployment container runs as a non-root user with no capabilities, a read-only
root filesystem, a writable bounded temporary mount, process and file limits, and no
network egress. Conversion has bounded input/output sizes and a hard timeout. Macros
are never executed. External link updates are disabled and the container network
boundary is authoritative. Temporary data is removed after success, timeout, error,
or process termination.

Generated PDFs must have a valid PDF header and terminal marker and must not contain
JavaScript, launch actions, embedded files, or file specifications. The worker
verifies the returned SHA-256 before private storage. Renderer profile, LibreOffice
version, font-pack version, page dimensions, warnings, output SHA-256, and byte count
are recorded with the derived artifact.

The initial renderer profile is `office-pdf-v1`. Renderer and font changes create a
new immutable profile identity and require fixture/perceptual verification. The
preview fidelity statement in `docs/product/visual-comparison.md` is always visible
to users.

## Consequences

- Renderer compromise is contained separately from semantic inspection and merge.
- The worker coordinates two internal services but either can fail independently.
- Local and pilot deployments require a pinned LibreOffice/font image and additional
  readiness, metrics, quota, backup, and cleanup considerations.
- PDF output is derived and regenerable; original packages and semantic comparison
  remain authoritative.
- Microsoft Graph conversion remains a future connector-specific option rather than
  an implicit data-governance dependency.
