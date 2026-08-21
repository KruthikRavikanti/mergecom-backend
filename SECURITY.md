# Security policy

## Current status

MergeCom is a pre-production prototype. It has not completed a security assessment and must not process confidential, customer, or production documents.

A monitored, project-controlled private security reporting channel has not yet been configured. Configuring and publishing that channel is a prerequisite for a pilot. Until it exists, do not include vulnerability details, credentials, private keys, or document data in a public GitHub issue.

## Known Phase 0 exposure

Earlier commits contain a localhost development private key/certificate, generated Office-content JSON, and a dependency tree. Those files have been removed from the current Phase 0 branch but remain in Git history until the owner approves a coordinated history rewrite. The exact non-content inventory and cleanup procedure are documented in:

- `docs/security/phase-0-exposure-inventory.md`
- `docs/runbooks/history-cleaning.md`

Treat the old key as compromised even though it was a local development key. Do not reuse or distribute it.

## Handling requirements

- Do not commit secrets, private keys, local certificates, real document data, or generated semantic snapshots.
- Do not log Office file bytes or document contents.
- Use synthetic, reviewed fixtures only.
- Keep original Office package bytes immutable and authorization-scoped.
- Record and investigate security-relevant failures without exposing document content.

