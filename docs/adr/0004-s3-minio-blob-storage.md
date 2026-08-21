# ADR 0004: S3-compatible BlobStore with MinIO locally

- Status: Accepted
- Date: 2026-08-15

## Context

Office package bytes, snapshots, previews, diffs, merge candidates, and exports are unsuitable for global JSON files or primary relational storage. Hosted and local environments need the same artifact semantics without binding the domain to one vendor.

## Decision

Define an application `BlobStore` interface with immutable put/get/head/delete primitives and constrained signed upload/download support. Use MinIO in local Docker Compose and managed S3-compatible object storage for hosted pilots.

Object keys are server-generated and organization scoped. Buckets are private. Metadata records SHA-256, size, media type, ownership, scan state, and lifecycle references. Deletion is allowed only through authorized retention/garbage-collection workflows after reference checks.

## Consequences

- Exact source bytes and large derived data are independently scalable.
- Authorization stays in the API; signed grants are short-lived and narrowly scoped.
- Integrity checks and object lifecycle policy become mandatory operational controls.
- A later SharePoint/OneDrive connector may implement a storage integration without changing version semantics.

