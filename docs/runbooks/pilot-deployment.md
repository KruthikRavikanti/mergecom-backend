# Pilot deployment runbook

Phase 15 provides a provider-neutral, single-host application bundle for a controlled
pilot. It is not a production approval. The operator owns the cloud account, network,
managed data services, TLS ingress, secret manager, monitoring, backup retention,
malware scanning integration, and incident response.

## Deployment boundary

The bundle runs six stateless images: web, Office add-in, API, worker, document
engine, and rendition engine. PostgreSQL, Redis, S3-compatible object storage, SMTP,
Entra ID, TLS, DNS, and backup storage are external managed dependencies. Only the
web and Office Nginx containers bind host ports, on loopback by default. API, worker,
document engine, and rendition engine have no host port.

Use a dedicated pilot account or subscription. Permit ingress only on 443 to the
external TLS proxy. Permit application egress only to the configured PostgreSQL,
Redis, S3, SMTP, Entra, DNS, and time services. Do not allow direct internet ingress
to ports 3001 through 3004, 8080, or 8081. The rendition network is internal and
permits only worker-to-renderer traffic with no external egress.

## Prerequisites

- A Linux host with current Docker Engine and Compose v2, encrypted storage, and
  security updates enabled.
- Two distinct DNS names and valid public certificates, for example
  `app.pilot.example.com` and `office.pilot.example.com`.
- Managed PostgreSQL with TLS, automated snapshots, point-in-time recovery, and a
  least-privilege application account.
- Managed Redis with TLS, authentication, persistence appropriate to BullMQ, and no
  public network exposure.
- A private S3-compatible bucket with TLS, server-side encryption, versioning,
  retention, and a separate backup or replication policy.
- SMTP over TLS and an approved sender identity.
- A Microsoft Entra application registration with the exact redirect URI
  `https://<web-origin>/api/auth/callback`.
- A secret manager capable of producing a mode-0600 runtime environment file outside
  source control.

The object bucket CORS policy must allow `GET`, `HEAD`, `PUT`, and multipart upload
requests from the exact web and Office origins. Limit allowed headers to those in the
signed grants, expose `ETag`, and do not use wildcard origins or credentials. The
bucket remains private; clients receive only short-lived signed grants.

## Build immutable images

Run the `Pilot images` GitHub Actions workflow from the reviewed commit. Supply the
web origin, Office origin, and exact public HTTPS object-storage origin. The workflow
builds Linux AMD64 and ARM64 images, generates
hosted Word/Excel/PowerPoint manifests, publishes SBOM and provenance attestations,
and reports six `image@sha256:digest` references in its job summaries.

The web origin is also passed to the web image as `VITE_WEB_APP_BASE_URL`. The build
uses it for canonical metadata, structured data, `robots.txt`, and `sitemap.xml`, and
fails if an allowlisted marketing route cannot be prerendered. Do not build a hosted
web image without the exact final HTTPS origin.

The object-storage origin becomes the web CSP's only connection destination besides
the same origin. It must match the origin of `S3_ENDPOINT` used by signed browser
grants. Rebuild the web image when that endpoint changes; do not replace it with an
`https:` or wildcard source.

Before rollout, review dependency audits and image scan results. Copy only digest
references into the deployment configuration. Tags, including a commit SHA tag, are
not accepted by the preflight.

## Configure

Create the configuration from `infra/deployment/.env.pilot.example` in the secret
manager or in a protected path on the deployment host. Replace every `REPLACE_ME`
value and leave `MERGECOM_SYNTHETIC_CONFIG=false`. Generate separate random document
engine and rendition-engine tokens of at least 32 characters. Keep automatic
PowerPoint and Excel merge disabled for the first rollout; enabling either requires
an explicit organization UUID allowlist.

`API_PUBLIC_ORIGIN` must be the web origin followed by `/api`. PostgreSQL must include
`sslmode=require`, `verify-ca`, or `verify-full`; prefer `verify-full`. Redis uses
`rediss://`, object storage uses HTTPS, and SMTP uses `smtps://`. Set
`TRUSTED_PROXY_HOPS` to the exact proxy count; the supplied two-proxy topology is the
external TLS proxy followed by the static Nginx container.

Validate without printing secrets:

```bash
node infra/deployment/validate-config.mjs /secure/path/mergecom-pilot.env
docker compose \
  --env-file /secure/path/mergecom-pilot.env \
  -f infra/deployment/compose.pilot.yaml config --quiet
```

Configure the external TLS proxy to preserve `Host`, append `X-Forwarded-For`, and set
`X-Forwarded-Proto=https`:

| Public origin | Upstream |
| --- | --- |
| Web | `127.0.0.1:8080` |
| Office add-in | `127.0.0.1:8081` |

Do not cache HTML, API responses, authentication callbacks, or Office manifests.
Hashed `/assets/` files may use the supplied immutable cache policy.
Office task panes must remain frameable by Office, so do not add `X-Frame-Options` or
a restrictive `frame-ancestors` policy at the Office origin.

## Release

1. Record the reviewed commit, six current digests, six proposed digests, database
   snapshot identifier, object-backup evidence, and rollback owner.
2. Confirm PostgreSQL point-in-time recovery and object versioning/encryption before
   changing application images.
3. Run `infra/deployment/deploy-pilot.sh /secure/path/mergecom-pilot.env`.
4. Confirm the one-shot `migration` service exited with code zero. API and worker do
   not start until it succeeds.
5. Activate or verify TLS routing, then run:

```bash
node infra/deployment/verify-release.mjs /secure/path/mergecom-pilot.env
```

6. Sideload one generated manifest from
   `https://<office-origin>/manifests/manifest.powerpoint.xml` (or Word/Excel), sign
   in, link a saved synthetic file, push exact bytes, wait for processing, retrieve
   the exact version, compare its SHA-256 with the source, then create a visual
   comparison and verify both private renditions and mapped change navigation.
7. Inspect tenant denial, invitation delivery, processing retry, audit, and structured
   log evidence before admitting pilot users.

## Monitoring

Collect container stdout/stderr as structured logs and alert on restarts, migration
failure, HTTP 5xx rate, readiness failure, processing retries/dead letters, rendition
queue age/timeouts/crash loops/output growth, viewer failures, mapping coverage,
cleanup failure, SMTP failure, PostgreSQL saturation, Redis memory/eviction, and
object-store errors. Redact
authorization, cookies, CSRF tokens, internal tokens, signed URLs, connection strings,
and document content in the log platform.

The API Prometheus endpoint is `/metrics` on the private API listener. Public Nginx
returns 404 for `/api/metrics`; attach the collector to the backend network or use an
authenticated private monitoring path. Liveness proves only process health.
Readiness must be used for rollout decisions. Collect rendition-engine and worker
`/metrics` only on their private listeners.

## Backup and restore

Managed PostgreSQL snapshots and point-in-time recovery are authoritative. The
logical backup helper adds an independent, checksum-verified artifact; store it only
on encrypted backup storage:

```bash
PGHOST=db.example PGDATABASE=mergecom PGUSER=backup PGSSLMODE=verify-full \
  PGPASSWORD="$BACKUP_PASSWORD" \
  infra/deployment/postgres-backup.sh /encrypted/mergecom-$(date +%F).dump
```

Run a restore drill against an isolated temporary database on a non-production
server. The helper accepts only a name beginning with `mergecom_restore_drill_`,
checks the archive checksum and core schema, and removes the temporary database:

```bash
PGHOST=restore-db.example PGUSER=restore_operator PGSSLMODE=verify-full \
  PGPASSWORD="$RESTORE_PASSWORD" \
  infra/deployment/postgres-restore-drill.sh \
  /encrypted/mergecom-2026-08-20.dump mergecom_restore_drill_20260820
```

For S3-compatible providers that implement the AWS APIs, verify private bucket
access, versioning, and server-side encryption with
`verify-object-protection.sh`. Otherwise capture equivalent provider evidence. A
database restore without the matching immutable source object versions is not a
successful MergeCom restore. Renditions and visualization maps are regenerable, but
their database references must either resolve to matching objects or be regenerated
under a new versioned profile. Exercise source restoration and exact SHA-256
retrieval quarterly.

## Rollback

Stop admission of new writes, preserve logs and failed artifacts, and identify
whether a schema migration completed. For a backward-compatible schema, replace all
six image values with the recorded prior digests and rerun `deploy-pilot.sh`, then
rerun release verification. Never run ad hoc down migrations.

If the prior application cannot use the migrated schema, restore PostgreSQL and the
corresponding object-store recovery point into a new isolated environment, validate
hashes and tenant boundaries, then switch traffic. Escalate any suspected credential
or document exposure through the incident process; rollback alone is not containment.
