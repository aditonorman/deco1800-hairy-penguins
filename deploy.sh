#!/usr/bin/env bash
# Upload the site to the Hairy Penguins team zone.
#
# Usage:   ./deploy.sh <uq_username>
#          UQ_USERNAME=s1234567 ./deploy.sh
#
# You must be on the UQ network (campus / Eduroam) or connected to the UQ VPN.
# Files land in /var/www/htdocs, which is what nginx serves.

set -euo pipefail

ZONE_HOST="deco1800teams-hairy-penguins.zones.eait.uq.edu.au"
ZONE_URL="https://deco1800teams-hairy-penguins.uqcloud.net/"
REMOTE_DIR="/var/www/htdocs"

# Only these are uploaded. Add folders here as the project grows.
SITE_FILES=(index.html css js images)

UQ_USER="${1:-${UQ_USERNAME:-}}"
if [ -z "$UQ_USER" ]; then
	echo "Usage: ./deploy.sh <uq_username>   (or set UQ_USERNAME)" >&2
	exit 1
fi

cd "$(dirname "$0")"

echo "Deploying to ${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}"
echo

# rsync only sends changed files. If the zone doesn't have rsync installed,
# fall back to scp, which copies everything each time.
if rsync -avz --exclude '.DS_Store' --exclude '.gitkeep' \
	"${SITE_FILES[@]}" "${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}/"; then
	:
else
	echo
	echo "rsync failed, falling back to scp..."
	scp -r "${SITE_FILES[@]}" "${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}/"
fi

echo
echo "Done. View the site at ${ZONE_URL}"
