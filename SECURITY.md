# Security policy

## Supported code

Only the latest commit on `main` is supported. Phase branches and files under
`legacy/` are historical evidence and must not be deployed.

## Report a vulnerability

Use the repository's **Security** tab and select **Report a vulnerability** to open a
private GitHub security advisory. Do not open a public issue for a suspected security
problem.

Include the affected commit, component, reproduction steps using synthetic data, and
the expected impact. Do not attach real Office documents, credentials, identity
tokens, signed object URLs, connection strings, or personal information.

The repository is a controlled pilot implementation, not a production-approved
service. See `docs/runbooks/pilot-deployment.md` for the remaining operator-owned
security and operations controls.

## Repository history

The public `mergecom-backend` history starts from the sanitized Phase 0 tree. The
pre-containment commits, retired local development key, generated Office JSON,
dependency trees, local safety tag, and local backup stash were not published to this
repository. The old key remains permanently compromised and must never be reused.

## Handling requirements

- Do not commit secrets, private keys, local certificates, real document data, or
  generated semantic snapshots.
- Do not log Office file bytes or document contents.
- Use only reviewed synthetic fixtures.
- Keep original Office package bytes immutable and authorization-scoped.
- Record and investigate security-relevant failures without exposing document
  content.
