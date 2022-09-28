#!/usr/bin/env bash
touch data/hotspots.csv
curl --location -g --request GET 'https://api.ebird.org/v2/ref/hotspot/US-VT' > data/hotspots.csv
node cli.js csvToJsonHotspots --input=data/hotspots.csv
git diff -U0 data/hotspotsList.md

# Then manually go through that diff, removing extra files and deleting +, and mail it to Ken Ostermiller
