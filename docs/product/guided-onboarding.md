# Guided onboarding contract

## Checklist ownership

`GET /v1/organizations/{organizationId}/onboarding` derives checklist completion from
authorized persisted outcomes. The browser cannot mark workflow steps complete.
Per-user state stores only dismissal and the versioned comparison-guide outcome.

| Step | Completion evidence | Visibility |
| --- | --- | --- |
| Explore a sample | User recent-document record for a registered sample | All roles |
| Create or join a project | Accessible non-sample project | All roles |
| Add or link a document | Accessible non-sample document | Content writers |
| Save the first version | User-authored immutable version | Content writers |
| Save and compare | User-requested completed comparison | Content writers |
| Request or complete review | Requested review or recorded decision | Non-viewers |

Role visibility is recalculated on every read. Organization owners/admins have
automatic project-lead access; other roles use current project membership and role
caps.

## Synthetic samples

Samples are isolated in a tenant-local project whose project and document names must
start with `[SAMPLE] `. A registry entry can reference only a completed comparison
whose project, document, kind, and organization agree. The registry uses restrictive
foreign keys, so a registered sample cannot be accidentally deleted as ordinary
content.

Provisioning uses six sanitized fixtures generated from source with the Open XML SDK.
It creates two immutable versions per format, waits for normal processing, requests
normal comparisons and summaries, and grants non-admin organization members viewer
access. No sample bypass exists in read, review, rendition, or download authorization.

## Comparison guide

The guide is inline rather than modal. It highlights existing deterministic summary,
change navigation, viewers, inspector, and review controls. Left/Right keys move
between steps; Escape records a skip. Scrolling becomes immediate under
`prefers-reduced-motion`. Completion and skip state are versioned so a future guide
can be offered without discarding prior history.

## Office setup readiness

The readiness endpoint requires an authenticated organization read and returns only
the API state, environment category, product version, task-pane/web origins, and
manifest URLs. It never returns credentials, storage configuration, OIDC settings,
internal service tokens, or certificate private material.

Host/platform instructions are selected locally from Word, Excel, or PowerPoint and
Mac, Windows, or Office web. Manual host verification remains required because a
browser simulation cannot prove an installed Office build exposes compressed-file
access.

## Feedback privacy

Feedback is an explicit user action. The accepted payload is allowlisted to:

- rating from 1 through 5;
- reason category;
- optional user-entered comment;
- route and coarse resource category;
- product version.

Additional properties are rejected. The UI discloses sent and excluded fields before
submission. Tenant ownership is supplied from the authenticated session, not the
request body. Only owner/admin sessions can read the newest 500 tenant submissions or
download the same records as JSON.
