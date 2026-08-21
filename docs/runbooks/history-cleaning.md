# Git history-cleaning runbook

Status: superseded for public development by the clean `mergecom-backend` publication
boundary on 2026-08-20. The former `Mergecom` remote no longer exists. This procedure
is retained only for any private pre-containment mirror that might be republished.

The replacement repository starts from the sanitized Phase 0 tree and contains only
replayed Phase 1 and later implementation commits. No old branch, tag, stash, or
pre-containment object was pushed. Do not push a local legacy ref into the replacement
repository.

History rewriting changes commit IDs, invalidates open branch ancestry, disrupts forks/clones, and requires every collaborator to re-clone or carefully rebase. It does not erase already copied data or make the old private key trustworthy.

## Scope

Remove from every rewritten branch and tag:

- `cert/key.pem`
- `cert/cert.pem`
- `saved_workbook.json`
- `saved_presentation.json`
- `Mergecom V1/node_modules/` and any other historical `node_modules` directory discovered by the preflight inventory

## Required authorization and coordination

1. Repository owner confirms the exact maintenance window and gives explicit approval for the rewrite and force-push.
2. Pause merges and direct pushes; notify every collaborator that all commit IDs will change.
3. Record protected branch/tag rules, open pull requests, releases, deployment references, and automation pinned to SHAs.
4. Confirm the compromised local key is retired. Rewriting history is not key rotation.
5. Decide whether the local safety tag remains only in an offline backup; it must not be pushed back after cleanup.
6. Ensure `git-filter-repo` is installed from its trusted distribution and record its version.

## Backup

Run from a new parent directory, not from the working repository:

```bash
git clone --mirror https://github.com/KruthikRavikanti/Mergecom.git Mergecom-before-history-cleaning.git
git -C Mergecom-before-history-cleaning.git fsck --full
git -C Mergecom-before-history-cleaning.git bundle create ../Mergecom-before-history-cleaning.bundle --all
shasum -a 256 ../Mergecom-before-history-cleaning.bundle
```

Store the mirror/bundle in owner-controlled restricted storage. It contains the exposed key and document data and must not be published or used as a normal development remote.

## Fresh rewrite clone

```bash
git clone https://github.com/KruthikRavikanti/Mergecom.git Mergecom-history-cleaning
cd Mergecom-history-cleaning
git fetch --all --tags --prune
git status --short --branch
git remote -v
git filter-repo --version
```

Before rewriting, enumerate historical dependency roots and compare them with the command below. Add an explicit `--path <directory>/` for every discovered root.

```bash
git log --all --name-only --format= | rg '(^|/)node_modules/' | sed 's#\(.*node_modules\)/.*#\1#' | sort -u
```

For the audited history, the prepared rewrite is:

```bash
git filter-repo --force \
  --path cert/key.pem \
  --path cert/cert.pem \
  --path saved_workbook.json \
  --path saved_presentation.json \
  --path 'Mergecom V1/node_modules/' \
  --invert-paths
```

Do not add `--refs` unless the owner intentionally wants only selected refs rewritten. The objective is to remove the paths from all local branches and tags that will replace remote refs.

## Local verification before any push

All commands must produce no matching path/object:

```bash
git log --all -- cert/key.pem cert/cert.pem saved_workbook.json saved_presentation.json
git rev-list --objects --all | rg '(^|/)(cert/(key|cert)\.pem|saved_(workbook|presentation)\.json)$'
git rev-list --objects --all | rg '(^|/)node_modules/'
git fsck --full --no-reflogs --unreachable
git count-objects -vH
```

Also check out and build the rewritten default branch, inspect every intended branch/tag, and confirm `.gitignore`, Phase 0 documentation, and replacement certificate setup are present.

`git-filter-repo` may remove the `origin` remote as a safety measure. Re-add it only after reviewing the rewritten refs and immediately before the approved push:

```bash
git remote add origin https://github.com/KruthikRavikanti/Mergecom.git
git remote -v
git show-ref --heads --tags
```

## Approval stop

Stop here. Show the owner:

- backup location and checksum;
- before/after ref and object counts;
- clean verification output;
- exact branches and tags that will be replaced;
- collaborator notification status;
- branch-protection changes required for the maintenance window.

Obtain explicit approval immediately before any force-push. Prior approval to prepare this runbook is not approval to execute it.

## Coordinated push after approval only

Use explicit branch and tag refspecs agreed with the owner. Do not blindly restore old refs from the backup. A typical full coordinated replacement may require:

```bash
git push --force origin --all
git push --force origin --tags
```

These commands are destructive to remote history and are intentionally not executed in Phase 0 without the approval stop above. Temporarily adjusted branch protection must be restored immediately afterward.

## Post-push verification and collaborator recovery

1. Make a fresh clone from GitHub into a new directory.
2. Run the same `git log` and `git rev-list --objects --all` absence checks.
3. Verify default branch, branch protections, tags/releases, CI, and a clean build from the fresh clone.
4. Ask collaborators to archive unpushed work, delete old clones, and fresh-clone. They must not merge or push an old branch, which can reintroduce removed history.
5. Rebase intentionally preserved unpushed patches onto rewritten commits without restoring removed files.
6. Close/recreate or retarget pull requests whose ancestry is invalid.
7. Check forks, package/release artifacts, caches, and mirrors separately; contact hosting support where needed. Git history cleaning cannot delete third-party copies.
8. Continue treating the key as compromised permanently.
