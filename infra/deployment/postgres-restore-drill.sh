#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <backup.dump> <mergecom_restore_drill_database>" >&2
  exit 64
fi

for name in PGHOST PGUSER; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required." >&2
    exit 64
  fi
done
for command in createdb dropdb pg_restore psql sha256sum; do
  command -v "$command" >/dev/null || {
    echo "$command is required." >&2
    exit 69
  }
done

archive="$1"
target_database="$2"
if [[ ! "$target_database" =~ ^mergecom_restore_drill_[a-z0-9_]+$ ]]; then
  echo "The target must start with mergecom_restore_drill_." >&2
  exit 64
fi
if [[ ! -f "$archive" || ! -f "$archive.sha256" ]]; then
  echo "The backup and its .sha256 file are required." >&2
  exit 66
fi

expected_checksum="$(tr -d '[:space:]' <"$archive.sha256")"
actual_checksum="$(sha256sum "$archive" | awk '{print $1}')"
if [[ "$actual_checksum" != "$expected_checksum" ]]; then
  echo "Backup checksum verification failed." >&2
  exit 65
fi
if psql --dbname=postgres --tuples-only --no-align \
  --command="select 1 from pg_database where datname = '$target_database'" | grep -q 1; then
  echo "Restore-drill database already exists." >&2
  exit 73
fi

createdb "$target_database"
cleanup() {
  dropdb --if-exists "$target_database"
}
trap cleanup EXIT
pg_restore \
  --dbname="$target_database" \
  --exit-on-error \
  --single-transaction \
  --no-owner \
  --no-privileges \
  "$archive"

schema_ready="$(psql --dbname="$target_database" --tuples-only --no-align \
  --command="select to_regclass('public.organizations') is not null and to_regclass('public.document_versions') is not null and to_regclass('public.audit_events') is not null")"
if [[ "$schema_ready" != 't' ]]; then
  echo "Restored database is missing required MergeCom tables." >&2
  exit 65
fi
echo "Restore drill passed; temporary database will now be removed."
