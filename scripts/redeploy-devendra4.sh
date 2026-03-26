#!/usr/bin/env bash
# Redeploy S3 Test Artifacts snap-in to devendra4: build, optionally delete old snap-in, create new version.
# Usage:
#   export SNAP_IN_PACKAGE_ID='don:integration:...:snap_in_package/...'
#   ./scripts/redeploy-devendra4.sh [OLD_SNAP_IN_ID]
#
# Requires: devrev CLI, authenticated profile (devrev profiles authenticate ... -e prod)

set -euo pipefail

ORG=devendra4
ENV=prod
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Build"
(cd "$ROOT/code" && npm run build)

OLD_SNAP_IN_ID="${1:-}"
if [[ -n "$OLD_SNAP_IN_ID" ]]; then
  echo "==> Deactivate old snap-in: $OLD_SNAP_IN_ID"
  devrev snap_in deactivate "$OLD_SNAP_IN_ID" -o "$ORG" -e "$ENV" || true
  echo "Waiting 5s..."
  sleep 5
  echo "==> Delete old snap-in"
  devrev snap_in delete-one "$OLD_SNAP_IN_ID" --force -o "$ORG" -e "$ENV" || true
fi

cd "$ROOT"

if [[ -n "${SNAP_IN_PACKAGE_ID:-}" ]]; then
  echo "==> Create snap-in version (existing package)"
  devrev snap_in_version create-one \
    --path . \
    --package "$SNAP_IN_PACKAGE_ID" \
    -o "$ORG" -e "$ENV" \
    --wait-status 15
else
  echo "SNAP_IN_PACKAGE_ID is not set. Creating a new package with slug from stdin."
  echo "If this is wrong, cancel and set SNAP_IN_PACKAGE_ID, then re-run."
  printf '%s\n' "s3-test-artifacts-airsync-$(date +%Y%m%d%H%M%S)" | devrev snap_in_version create-one \
    --path . \
    --create-package \
    -o "$ORG" -e "$ENV" \
    --wait-status 15
fi

echo ""
echo "Next steps:"
echo "  1. devrev snap_in_version show \"<VERSION_ID>\" -o $ORG -e $ENV   # wait until ready"
echo "  2. devrev snap_in draft --snap_in_version \"<VERSION_ID>\" -o $ORG -e $ENV"
echo "  3. devrev snap_in activate \"<SNAP_IN_ID>\" -o $ORG -e $ENV"
