# ADR 0001: TypeScript-led pnpm/Turborepo monorepo

- Status: Accepted
- Date: 2026-08-15

## Context

The prototype has one root npm project, three duplicated Office add-in projects, four source lockfiles, and an attached frontend outside the Git repository. Product slices will change web, add-in, API, workers, contracts, document engine, and tests together.

## Decision

Use one repository with pnpm workspaces and Turborepo for JavaScript/TypeScript task orchestration. Keep web and Office product surfaces, API, workers, shared contracts/UI, fixtures, infrastructure, documentation, and the .NET document engine in the same repository. Use one root pnpm lockfile and strict TypeScript policy for production TypeScript packages.

Move prototypes under `legacy/` outside the active production build graph. Preserve source lockfiles only until Phase 1 performs the deliberate workspace migration.

## Consequences

- Cross-surface changes can be reviewed and tested atomically.
- Shared contracts and policy have one owner and dependency graph.
- CI must support both Node/pnpm and .NET.
- Phase 1 must migrate history/content carefully and cannot treat copied prototype dependencies as canonical.

