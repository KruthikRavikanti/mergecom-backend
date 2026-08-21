#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <pilot-environment-file>" >&2
  exit 64
fi

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
environment_file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
compose_file="$repository_root/infra/deployment/compose.pilot.yaml"

if [[ ! -f "$environment_file" ]]; then
  echo "Environment file does not exist: $environment_file" >&2
  exit 66
fi
if [[ "$(stat -c '%a' "$environment_file")" != '600' ]]; then
  echo "Environment file permissions must be 600." >&2
  exit 77
fi

cd "$repository_root"
node infra/deployment/validate-config.mjs "$environment_file"
docker compose --env-file "$environment_file" -f "$compose_file" config --quiet
docker compose --env-file "$environment_file" -f "$compose_file" pull
docker compose \
  --env-file "$environment_file" \
  -f "$compose_file" \
  up --detach --wait --wait-timeout 240 --remove-orphans

echo "Pilot services started. Run verify-release.mjs after TLS routing is active."
