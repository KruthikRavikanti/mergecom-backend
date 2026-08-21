# ADR 0007: Exact Office packages are the source artifact

- Status: Accepted
- Date: 2026-08-15

## Context

The three add-in spikes capture body OOXML or partial worksheet/slide models and reconstruct documents during pull. Those models omit valid Office package content and their pull paths clear/delete existing content, creating a silent data-loss risk.

## Decision

Every version preserves the exact compressed Office package bytes captured or uploaded by the client. Those bytes are immutable and are the only source for download, open, restore, rollback, and merge inputs. Semantic JSON, previews, and typed diffs are derived artifacts only.

The Word, PowerPoint, and Excel projects are technical spikes, not product clients. Phase 1 archives them under `legacy/`; later phases replace reconstruction-based push/pull with exact package capture and authorized exact-byte retrieval.

## Consequences

- Unsupported package parts survive ordinary versioning because the original is never reconstructed.
- Storage and upload flows must hash and verify exact bytes.
- Office host limitations must produce an explicit unsupported/fallback result, never a partial artifact labeled complete.
- Restores create new immutable versions referencing exact prior bytes; they do not mutate the open file or historical nodes silently.

