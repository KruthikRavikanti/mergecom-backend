# Marketing content and claims

Public product claims live in
`apps/web/src/features/marketing/content/site.ts`. Each substantive claim has an
`implemented`, `controlled-preview`, or `future` status. Public components must
not render future claims as current capability.

## Prohibited claims

- Customer adoption, savings, or productivity numbers without written evidence
- "Bank-grade", "enterprise-ready", or certification language without approval
- Pixel-identical Microsoft Office preview claims
- Claims that MergeCom replaces Microsoft Office
- Customer names, logos, quotes, or stories without written permission

Security language must map to current implementation evidence under
`docs/security/`. MergeCom is a controlled preview and does not currently claim
an independent compliance certification.
