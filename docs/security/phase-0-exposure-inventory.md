# Phase 0 exposure inventory

Audit date: 2026-08-15. Original commit: `fb00ed1860a9ffcbda293e2e58818aa10ca288a3`.

This record intentionally excludes private-key bytes and document contents. Blob sizes are committed object sizes at the original commit unless stated otherwise.

## Findings

| Path/set | Size | First introducing commit | Classification | Phase 0 disposition |
| --- | ---: | --- | --- | --- |
| `cert/key.pem` | 1,704 bytes | `d1d359b2cec60b284fd756f1003b11f36f33800f` (2025-07-04, Initial commit) | Actual private key for local development, not evidence of an external service credential; compromised by publication | Removed from current tree; never reuse; remains in history pending approved rewrite |
| `cert/cert.pem` | 1,245 bytes | `d1d359b2cec60b284fd756f1003b11f36f33800f` (2025-07-04, Initial commit) | Self-signed local development certificate paired with the key | Removed from current tree; replaced by generated local certs; remains in history |
| `saved_workbook.json` | 3,193,339 bytes | `5ef7a4f9879993e1ca40a1d5332f1adf31f6549c` (2025-07-05) | Generated Office document data; not a reviewed synthetic fixture | Removed from current tree; remains in history |
| `saved_presentation.json` | 1,734 bytes | `fb00ed1860a9ffcbda293e2e58818aa10ca288a3` (2025-07-06) | Generated Office document data; not a reviewed synthetic fixture | Removed from current tree; remains in history |
| `Mergecom V1/node_modules/` | 49,243 files, 353,980,030 aggregate uncompressed blob bytes in the original tree | `d1d359b2cec60b284fd756f1003b11f36f33800f` (2025-07-04) | Generated dependency content, not source | Removed from current index and ignored; remains in history |

## Certificate review

The certificate was self-issued with a generic placeholder subject/issuer, had no Subject Alternative Name extension, and was valid from 2025-07-04 through 2026-07-04. The public key in the certificate matched the committed private key. It was already expired at this audit date.

No evidence tied this key to an external service or production trust chain. Publication still makes the private key compromised. Deletion from the current branch is rotation by retirement; local HTTPS now uses short-lived material generated outside the repository by `office-addin-dev-certs`.

## Generated-content review

The files were parsed locally without printing values.

- `saved_workbook.json` was valid JSON with top-level key `workbook`, contained no detected email address or URL, and did contain long digit sequences.
- The audited working copy of `saved_presentation.json` was valid JSON with top-level key `presentation`, contained no detected email address or URL, and did contain long digit sequences.
- Neither file had provenance or review evidence establishing that names, numbers, text, formulas, metadata, and identifiers were synthetic.

They are therefore classified as potentially confidential generated document data, not sanitized fixtures. No fixture was retained. A pre-existing local presentation edit was preserved in a named local stash before removal; that stash must remain local and be deleted after the owner confirms it is not needed.

## Credential-oriented scan

A filename scan found no tracked `.env`, npm credential file, SSH key, PKCS#12/keystore, or other PEM/key path outside `cert/`. A high-confidence content-pattern scan excluding dependency files identified only `cert/key.pem`. No actual external credential was found by these checks.

This is a scoped repository inventory, not proof that every arbitrary secret format is absent. Phase 1 must add automated secret scanning and dependency policy in CI.

## Completed containment

- Created `phase-0/security-normalization` before deletion.
- Created local annotated tag `prototype-pre-rebuild-2026-08-15` at the original commit.
- Removed the key, certificate, both generated JSON files, and every tracked dependency path from the current index.
- Added repository-wide ignore rules for dependencies, build/test output, certificates, environment files, logs, temporary files, OS/editor state, and generated `saved_*` data.
- Replaced committed certificate loading with `office-addin-dev-certs` generation outside the repository.
- Verified the generated certificate against its external CA, served the legacy status route over HTTPS, and restricted the generated private-key file to owner read/write.
- Removed full request/response and add-in payload logging found in active prototype paths.
- Restricted the legacy server to loopback and explicit local task-pane browser origins.

## Residual exposure

The replacement public `mergecom-backend` repository was initialized from the
sanitized Phase 0 tree and replays only Phase 1 and later implementation commits. No
pre-containment branch, tag, stash, certificate, generated Office JSON, or historical
dependency tree was pushed. The absent former `Mergecom` remote was not rewritten.

The blobs remain reachable in this machine's local pre-containment branches, reflogs,
safety tag, and backup stash, and may remain in copies made before the former remote
was removed. A clean replacement repository cannot revoke copied material. The old
key must remain permanently retired. The retained rewrite procedure in
`docs/runbooks/history-cleaning.md` applies only if an old mirror is ever republished.
