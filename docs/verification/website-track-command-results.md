# Website Track W1-W6 command results

Date: 2026-08-21

Branch: `website/w6-seo-release` (stacked on the committed W1-W5 branches)

## Results

- Formatting, all nine workspace lint tasks, and strict TypeScript checks passed.
- JavaScript/TypeScript unit suites passed 180 tests, including 32 web tests. The
  marketing coverage includes route metadata, factual claims, truthful conversion
  states, analytics payload rebuilding, Do Not Track, and provider failure.
- The .NET document engine passed 76 tests. Four deployment contract tests passed.
- The root integration command passed startup coverage and reported its expected
  environment-gated skips: 15 non-container tests passed, while PostgreSQL, object
  storage, worker pipeline, and native renderer cases remained disabled because
  Docker was unavailable.
- Production builds passed for all nine workspaces and the .NET solution. A hosted
  test build at `https://app.pilot.example.com` produced absolute canonical, robots,
  sitemap, Open Graph, and structured-data URLs for exactly five public pages.
- The marketing entry measured 104,120 bytes gzip and the hero poster measured
  13,968 bytes, below the 180 KB and 250 KB enforced budgets. Protected PDF and
  comparison markers were absent from the initial marketing graph.
- Static release checks passed for route-specific metadata, JSON-LD, discovery files,
  owned assets, no source maps, protected-shell isolation, and internal-marker
  rejection.
- The complete default Playwright rerun passed 114 desktop, tablet, and mobile tests
  with 63 live-infrastructure scenarios skipped by their existing environment gates.
  The marketing-only matrix passed 27 scenarios with six project-specific skips;
  axe reported no WCAG 2.2 A/AA violations on the five public routes.
- Generated production HTML hydrated without browser console errors, while `/app`,
  invitation, and unknown paths received the empty no-index SPA shell.
- Manual screenshot review covered homepage, product, security, support, request
  access, navigation, comparison, workflow, and reduced-motion output from 320px
  through 1920px without horizontal overflow or overlapping controls.

One fully parallel E2E run had a single dev-server startup timeout before the local
login control rendered. The exact scenario immediately passed in 1.9 seconds, and the
full 177-scenario matrix then completed with 114 passes and only the expected 63
gated skips.

## Environment

- Node.js: `26.5.1` (repository and CI pin `24.18.1`; commands emitted the expected
  engine warning)
- pnpm: `11.22.0`
- .NET SDK: `10.0.400`
- Chromium: Playwright `1.62.1` managed browser

Docker was unavailable, so no new image was built and no hosted endpoint was probed.
The deployment contract, hosted-origin production build, generated output, and
browser release server were verified locally. The pilot image workflow and
`verify-release.mjs` remain the hosted topology gates.

## Commands

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:deployment
pnpm test:unit
pnpm test:integration
pnpm build
pnpm test:e2e
VITE_WEB_APP_BASE_URL=https://app.pilot.example.com pnpm --filter @mergecom/web build
pnpm check:marketing-bundle
pnpm check:marketing-release
pnpm exec playwright test tests/e2e/marketing.spec.ts tests/e2e/marketing-prerender.spec.ts
git diff --check
```
