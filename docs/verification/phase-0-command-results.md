# Phase 0 command results

Audit date: 2026-08-15. Baseline environment: macOS, Node `v26.5.1`, npm `11.17.0`. Commands were run separately so one project's failure did not mask another.

## Original baseline

| Project | Install | Build | Lint | Manifest | Type check | Tests |
| --- | --- | --- | --- | --- | --- | --- |
| Root Express server | Package lock present; no script | Missing | Missing | N/A | Missing | Missing |
| Word add-in | `npm ci` passed; 1,069 packages audited, 56 vulnerabilities reported | `npm run build` passed | Failed: 14 errors | `npm run validate` passed | No script | Missing |
| PowerPoint add-in | `npm ci` passed; 1,068 packages audited, 56 vulnerabilities reported | `npm run build` passed | Failed: 149 problems (145 errors, 4 warnings) | `npm run validate` passed | No script | Missing |
| Excel add-in | `npm ci` passed; 1,068 packages audited, 56 vulnerabilities reported | `npm run build` passed | Failed: 35 problems (33 errors, 2 warnings) | `npm run validate` passed | No script | Missing |
| Attached frontend | Existing install used | `npm run build` passed | Failed: 33 errors | N/A | `npx tsc --noEmit -p tsconfig.app.json` failed | Missing |

All three add-in manifests passed schema/service validation. That validates manifest structure, not runtime Office.js calls. They still contain `Contoso` metadata and placeholder production/support URLs.

The root legacy server was not started before containment because it depended on the committed, expired certificate and exposed unauthenticated global persistence. This startup path is not marked passed.

## Contained baseline

| Command | Result |
| --- | --- |
| `npm install --package-lock-only` | Passed; root lock updated for `office-addin-dev-certs`; npm reported 3 dependency vulnerabilities |
| `npm ci` | Passed; 88 packages audited; npm reported 3 vulnerabilities (2 moderate, 1 high), including development dependencies |
| `npm run legacy:certs` | Generated fresh external files, then required interactive macOS Keychain trust confirmation; unattended run stopped without claiming trust completion |
| Generated certificate verification | Passed with OpenSSL against the generated CA; SAN contains `localhost` and `127.0.0.1`; key permissions tightened to owner read/write |
| `node --check server.js` | Passed |
| `npm run legacy:start` plus `GET /status` | Passed over HTTPS; HTTP 200; `legacy: true`; both generated-data stores absent |
| CORS allow/deny probes | Allowed `https://localhost:3000` with reflected allow-origin; rejected `https://example.com` with HTTP 403 and no allow-origin |
| Word final install/build/lint/manifest | Install, build, and manifest validation passed; lint failed with 14 errors |
| PowerPoint final install/build/lint/manifest | Install, build, and manifest validation passed; final build after log removal passed; lint failed with 136 problems (132 errors, 4 warnings) |
| Excel final install/build/lint/manifest | Install, build, and manifest validation passed; final build after log removal passed; lint failed with 32 problems (30 errors, 2 warnings) |
| Tracking scan | Passed: zero tracked `node_modules` paths and zero tracked `cert/*` or `saved_*` paths |
| Working-tree exposure scan | Passed: zero key/certificate/generated JSON files outside ignored dependencies and zero private-key markers |
| Payload-log/CORS scan | Passed: zero document-payload log patterns and zero wildcard CORS patterns in server/add-in source |
| `git diff --check` | Passed |

The operating-system trust-store step remains interactive. HTTPS behavior was verified using the generated CA explicitly; Office sideload/browser trust is not claimed as verified until the developer confirms the macOS Keychain prompt.

## Interpretation

- A passing webpack/Vite build does not establish type safety, correct Office behavior, or production readiness.
- Existing lint and type errors are baseline debt to address during Phase 1 migration, not hidden passes.
- Dependency vulnerability counts are installer output, not a completed exploitability assessment. Phase 1 must establish supported runtimes, dependency policy, and automated scanning.
- No application test suite exists, so no behavior has a test pass at this baseline.
