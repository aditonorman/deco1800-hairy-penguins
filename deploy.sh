#!/usr/bin/env bash
# Upload the site to the Hairy Penguins team zone.
#
# Usage:   ./deploy.sh <uq_username>
#          UQ_USERNAME=s1234567 ./deploy.sh
#
# On the UQ network (campus, Eduroam) or the UQ VPN, files go straight to the
# zone. Anywhere else, the script goes through EAIT's public SSH host
# (remote.labs.eait.uq.edu.au), so it works from overseas without the VPN.
# Expect to type your UQ password for each host that does not have your SSH key.
#   VIA_EAIT=1 ./deploy.sh s1234567     always go through EAIT
#
# Files land in /var/www/htdocs, which is what nginx serves.

set -euo pipefail

ZONE_HOST="deco1800teams-hairy-penguins.zones.eait.uq.edu.au"
ZONE_URL="https://deco1800teams-hairy-penguins.uqcloud.net/"
REMOTE_DIR="/var/www/htdocs"
JUMP_HOST="remote.labs.eait.uq.edu.au"     # EAIT's SSH host, open to the internet
STAGE_DIR="wild-neighbours-upload"         # used on EAIT only if the direct hop is refused

# Only these are uploaded. Add folders here as the project grows.
SITE_FILES=(index.html manifest.webmanifest sw.js css js images data)
RSYNC_OPTS=(-avz --exclude '.DS_Store' --exclude '.gitkeep')

UQ_USER="${1:-${UQ_USERNAME:-}}"
if [ -z "$UQ_USER" ]; then
	echo "Usage: ./deploy.sh <uq_username>   (or set UQ_USERNAME)" >&2
	exit 1
fi

cd "$(dirname "$0")"

# Can the zone be reached directly? SSH's own timeout is used because
# macOS's nc ignores -w while connecting. "Permission denied" still counts
# as reachable: it only means this computer has no key on the zone.
zone_reachable() {
	local out
	if out=$(ssh -o BatchMode=yes -o ConnectTimeout=6 -o StrictHostKeyChecking=accept-new \
		"${UQ_USER}@${ZONE_HOST}" true 2>&1); then
		return 0
	fi
	case "$out" in
		*"Permission denied"*) return 0 ;;
		*) return 1 ;;
	esac
}

if [ "${VIA_EAIT:-}" != "1" ] && zone_reachable; then
	echo "Deploying to ${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}"
	echo
	# rsync only sends changed files; scp is the fallback if rsync is missing.
	if ! rsync "${RSYNC_OPTS[@]}" "${SITE_FILES[@]}" "${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}/"; then
		echo
		echo "rsync failed, falling back to scp..."
		scp -r "${SITE_FILES[@]}" "${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}/"
	fi
else
	echo "The zone is not reachable directly (you are not on the UQ network or VPN)."
	echo "Going through EAIT's SSH host ${JUMP_HOST}."
	echo "Type your UQ password when asked."
	echo
	# One hop: EAIT forwards the connection to the zone.
	if ! rsync "${RSYNC_OPTS[@]}" -e "ssh -o ProxyJump=${UQ_USER}@${JUMP_HOST}" \
		"${SITE_FILES[@]}" "${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}/"; then
		# Two hops: copy to your EAIT home folder, then from EAIT to the zone.
		echo
		echo "Forwarding through EAIT did not work. Trying a two-step copy instead..."
		rsync "${RSYNC_OPTS[@]}" "${SITE_FILES[@]}" "${UQ_USER}@${JUMP_HOST}:${STAGE_DIR}/"
		ssh -t "${UQ_USER}@${JUMP_HOST}" \
			"rsync -avz ${STAGE_DIR}/ ${UQ_USER}@${ZONE_HOST}:${REMOTE_DIR}/"
	fi
fi

echo
echo "Done. View the site at ${ZONE_URL}"
