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

## Update process

1. Change canonical copy or claims in `content/site.ts`; do not fork text inside
   screenshots or route components.
2. Assign every substantive new claim an evidence status and link security claims
   to an implemented control under `docs/security/`.
3. Update this document when a prohibited claim becomes approved, and retain the
   written evidence outside the public bundle.
4. Run the marketing unit, browser, bundle, and release checks before publication.

Public JSON-LD intentionally contains no offers, prices, ratings, reviews, customer
counts, or certification data. Add those fields only after the corresponding public
claim has been approved and documented.
