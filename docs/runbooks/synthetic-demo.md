# Synthetic demo provisioning runbook

## Preconditions

Run the local API, worker, document engine, rendition engine, PostgreSQL, Redis, and
MinIO. Apply migrations and seed development identities first. Confirm readiness:

```bash
curl -f http://localhost:3001/health/ready
curl -f http://localhost:3002/health/ready
curl -f http://localhost:3003/health/ready
curl -f http://localhost:3004/health/ready
```

The default command uses the seeded `alpha-owner` identity and `Alpha Advisory`
workspace. Select another seeded owner/admin only in development:

```bash
MERGECOM_DEMO_IDENTITY=alpha-admin pnpm demo:provision
```

## Provision or reconcile

Regenerate reviewed fixtures after changing the generator:

```bash
dotnet run --project services/document-engine/tools/MergeCom.FixtureGenerator \
  -- packages/test-fixtures/office
```

Provision the sample workspace:

```bash
pnpm demo:provision
```

The command finds or creates the `[SAMPLE]` project and three documents, grants every
active non-admin member viewer access, matches existing versions by SHA-256, uploads
missing fixtures through signed object-storage grants, waits for processing, creates
directional comparisons, warms deterministic summaries, and registers one sample per
kind. A successful rerun reuses the same comparison identifiers.

Environment overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MERGECOM_API_ORIGIN` | `http://localhost:3001` | API under test |
| `MERGECOM_WEB_ORIGIN` | `http://localhost:5173` | exact accepted CSRF origin |
| `MERGECOM_DEMO_IDENTITY` | `alpha-owner` | seeded owner/admin identity |
| `MERGECOM_DEMO_POLLING_TIMEOUT_MS` | `180000` | per-processing wait deadline |

## Verify

Sign in, open **Getting started**, and confirm three `SYNTHETIC` entries. Open each
comparison and verify completed deterministic changes. A viewer should see all three
samples but no document/version creation checklist steps.

Run the live browser contract after provisioning:

```bash
LIVE_PHASE29_E2E=true pnpm exec playwright test \
  tests/e2e/onboarding.live.spec.ts
```

## Recovery

- `Object storage rejected ...`: inspect MinIO capacity and API blob-proxy settings.
  The next run creates a fresh upload intent and reuses any version already finalized.
- Processing timeout: inspect worker, document-engine, and rendition-engine readiness,
  then rerun. Permanent failure or quarantine is not bypassed.
- Wrong sample document kind: rename or remove the unregistered conflicting synthetic
  record, then rerun. The provisioner does not mutate its kind.
- Missing member access: confirm an active organization membership and rerun; direct
  sample roles are reconciled to viewer.
- Registration rejected: confirm both names retain the exact `[SAMPLE] ` prefix and
  that the comparison completed in the same organization/document.

Do not point this command at a production environment. It relies on the development
identity exchange, which the API disables in production.
