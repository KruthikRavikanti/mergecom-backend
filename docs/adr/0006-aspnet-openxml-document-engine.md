# ADR 0006: ASP.NET Core document engine with Open XML SDK

- Status: Accepted
- Date: 2026-08-15

## Context

Safe OOXML package traversal, validation, Office-specific normalization, semantic diff, and conservative merge are core product capabilities. Office.js task panes expose host APIs but are not a complete, deterministic server-side package-processing engine.

## Decision

Build an internal versioned ASP.NET Core service using the official Open XML SDK. It processes PowerPoint first, Excel second, and Word third. It accepts authorized worker requests only, reads immutable artifacts from controlled storage, and publishes versioned normalized/derived outputs.

Each job uses a unique restricted temporary directory and bounded resources. The engine rejects or quarantines path traversal, zip bombs, excessive parts/depth, DTD/external entities, malformed relationships/content types, encrypted packages, and unsupported unsafe inputs. Merge output must validate before publication.

## Consequences

- The product uses the strongest official typed OOXML ecosystem while keeping the API TypeScript-led.
- Cross-language contracts must be versioned and tested in CI.
- The service is internal and independently resource constrained; public clients never call it directly.
- Parser/schema/engine versions are recorded so derived artifacts can be reproduced or regenerated.

