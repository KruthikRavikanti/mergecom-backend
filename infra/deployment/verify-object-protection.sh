#!/usr/bin/env bash
set -euo pipefail

for name in S3_ENDPOINT S3_BUCKET AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "$name is required." >&2
    exit 64
  fi
done
command -v aws >/dev/null || {
  echo "aws CLI is required." >&2
  exit 69
}

common=(--endpoint-url "$S3_ENDPOINT" --region "${S3_REGION:-us-east-1}")
aws "${common[@]}" s3api head-bucket --bucket "$S3_BUCKET"
versioning="$(aws "${common[@]}" s3api get-bucket-versioning \
  --bucket "$S3_BUCKET" --query Status --output text)"
if [[ "$versioning" != 'Enabled' ]]; then
  echo "Object versioning is not enabled for $S3_BUCKET." >&2
  exit 65
fi
aws "${common[@]}" s3api get-bucket-encryption --bucket "$S3_BUCKET" >/dev/null
echo "Object bucket access, versioning, and server-side encryption checks passed."
