# Marketing release checklist

## Content and privacy

- [ ] Claims match `content-and-claims.md` and current implementation evidence.
- [ ] Customer names, testimonials, ratings, usage counts, and certifications are
  absent unless separately approved in writing.
- [ ] Screenshots and generated HTML contain no user, tenant, resource, signed URL,
  local origin, internal endpoint, or credential data.
- [ ] Request access has either an approved destination or the truthful unavailable
  state; no nonfunctional form is displayed.
- [ ] Analytics remains unconfigured or has an explicitly approved provider, consent
  posture, CSP destination, redaction test, and failure test.

## Build and browser gates

- [ ] `pnpm format:check`, `pnpm lint`, and `pnpm typecheck` pass.
- [ ] Marketing Vitest and Playwright suites pass, including axe, keyboard,
  reduced-motion, responsive, prerender hydration, and app-shell isolation checks.
- [ ] Initial marketing JavaScript is at most 180 KB gzip and the hero poster is at
  most 250 KB.
- [ ] The five public routes have one H1, route-specific metadata, canonical URLs,
  social cards, and valid structured data where enabled.
- [ ] `robots.txt` and `sitemap.xml` contain only the approved public boundary and
  exclude app, login, signup, and invitation routes.
- [ ] Production output contains no source maps or eagerly loaded PDF/comparison
  chunks.

## Deployment gates

- [ ] The image was built with the exact validated HTTPS `VITE_WEB_APP_BASE_URL`.
- [ ] The image CSP contains the exact public object-storage origin used by
  `S3_ENDPOINT`, with no wildcard or scheme-wide connection source.
- [ ] Nginx returns prerendered public files and the empty no-index shell for `/app`
  and unknown routes.
- [ ] CSP, Referrer-Policy, Permissions-Policy, framing, and MIME-sniffing headers are
  present; Office framing remains isolated on the separate Office origin.
- [ ] `node infra/deployment/verify-release.mjs <environment-file>` passes against the
  hosted topology.
- [ ] The public route, request-access, and authenticated `/app` browser flows receive
  manual owner acceptance before pilot admission.
