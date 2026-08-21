# Marketing website

The MergeCom marketing website lives inside `apps/web` and shares the existing
deployment image, origin, and React application. It does not create a second runtime
or weaken the authenticated application boundary.

## Public boundary

The indexable allowlist is `/`, `/product`, `/security`, `/support`, and
`/request-access`. Route metadata is centralized in
`apps/web/src/features/marketing/content/metadata.ts`. Login, signup, invitation,
unknown, and `/app` routes are excluded from discovery and continue through the
existing authentication and router loaders.

The production build creates static HTML for only the five allowlisted routes. It
also writes `app-shell.html`, which has an empty React root and `noindex, nofollow`.
Nginx serves a matching prerendered file when one exists and otherwise uses that
empty shell. React hydrates prerendered markup and mounts normally for application
routes.

## Configuration

- `VITE_WEB_APP_BASE_URL` is the exact hosted HTTPS web origin. It creates canonical,
  Open Graph, structured-data, robots, and sitemap URLs. Local builds may leave it
  unset and use relative metadata; hosted image builds always receive the validated
  workflow input.
- `VITE_MARKETING_CONTACT_EMAIL` enables the request-access mail link.
- `VITE_SUPPORT_EMAIL` enables the support mail link.

An empty contact variable is intentional: the page states that delivery is not
connected and renders no form. Do not add an endpoint or provider without an approved
destination, abuse controls, privacy review, and redacted operational logging.

## Analytics

`MarketingAnalytics` is a provider-neutral, public-only interface. No provider is
configured, so the default is a no-op. The boundary accepts only allowlisted route,
CTA, section, and broad result-code events, rebuilds each payload from approved
fields, respects Do Not Track and Global Privacy Control, and swallows provider
failure. It never accepts form values, identities, resource IDs, Office content, or
document metadata. A future provider requires explicit approval and CSP review.

## Editing and assets

Canonical product narrative and claim states live in `content/site.ts`. Reuse those
exports instead of duplicating public facts. Keep synthetic captures free of user,
tenant, project, and document identifiers, record ownership and dimensions in
`asset-manifest.md`, and update `content-and-claims.md` before publishing a new proof
statement.

Run these focused checks after website changes:

```bash
pnpm --filter @mergecom/web test:unit
pnpm --filter @mergecom/web build
pnpm check:marketing-bundle
pnpm check:marketing-release
pnpm exec playwright test tests/e2e/marketing.spec.ts tests/e2e/marketing-prerender.spec.ts
```

The root `pnpm build` and `pnpm verify` commands include the release checks. A failed
SSR render, missing H1, route allowlist mismatch, internal marker, source map, asset,
metadata field, or discovery file stops the build.
