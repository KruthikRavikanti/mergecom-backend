#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <output.dump>" >&2
  exit 64
fi

for name in PGHOST PGDATABASE PGUSER; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required." >&2
    exit 64
  fi
done
for command in pg_dump pg_restore sha256sum; do
  command -v "$command" >/dev/null || {
    echo "$command is required." >&2
    exit 69
  }
done

output="$1"
if [[ -e "$output" || -e "$output.sha256" ]]; then
  echo "Refusing to overwrite an existing backup or checksum." >&2
  exit 73
fi
mkdir -p "$(dirname "$output")"
temporary="$output.partial"
trap 'rm -f "$temporary"' EXIT

pg_dump \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$temporary"
pg_restore --list "$temporary" >/dev/null
mv "$temporary" "$output"
sha256sum "$output" | awk '{print $1}' >"$output.sha256"
chmod 600 "$output" "$output.sha256"
echo "Backup created and structurally verified: $output"
