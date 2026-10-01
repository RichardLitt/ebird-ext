#!/usr/bin/env bash
# Refresh the Vermont hotspot data from the eBird API.
#
# Usage (from the repo root): EBIRD_API_TOKEN=... sh scripts/updateHotspots.sh
# Get a key at https://ebird.org/api/keygen
#
# Writes data/hotspots.csv, data/hotspots.json, data/novisits-hotspots.json and
# data/hotspotsList.md, then shows which hotspots were added or removed.

set -euo pipefail

HOTSPOTS_CSV_FILE="data/hotspots.csv"
HOTSPOTS_MD_FILE="data/hotspotsList.md"
EBIRD_API_URL="https://api.ebird.org/v2/ref/hotspot/US-VT"

if [ -z "${EBIRD_API_TOKEN:-}" ]; then
    echo "Set EBIRD_API_TOKEN to your eBird API key (https://ebird.org/api/keygen)." >&2
    exit 1
fi

# --fail: an HTTP error (e.g. a bad key) must not overwrite the data with an error page
curl --fail --silent --show-error --location \
    --header "x-ebirdapitoken: ${EBIRD_API_TOKEN}" \
    "$EBIRD_API_URL" > "$HOTSPOTS_CSV_FILE.tmp"
mv "$HOTSPOTS_CSV_FILE.tmp" "$HOTSPOTS_CSV_FILE"
echo "Downloaded $(wc -l < "$HOTSPOTS_CSV_FILE" | tr -d ' ') hotspots."

node cli.js csvToJsonHotspots --input="$HOTSPOTS_CSV_FILE"
echo "Never visited: $(node -e "console.log(require('./data/novisits-hotspots.json').length)")"

git diff -U0 "$HOTSPOTS_MD_FILE"
