#!/usr/bin/env bash

# Constants for file paths and URLs
HOTSPOTS_CSV_FILE="data/hotspots.csv"
HOTSPOTS_JSON_FILE="data/hotspots.json"
HOTSPOTS_MD_FILE="data/hotspotsList.md"
EBIRD_API_URL="https://api.ebird.org/v2/ref/hotspot/US-VT"

# Function to create the CSV file
createCsvFile() {
    touch "$HOTSPOTS_CSV_FILE"
    if curl --location -g --request GET "$EBIRD_API_URL" > "$HOTSPOTS_CSV_FILE"; then
        echo "CSV file created successfully."
    else
        echo "Failed to create CSV file."
        exit 1
    fi
}

# Function to convert CSV to JSON
convertCsvToJson() {
    if node cli.js csvToJsonHotspots --input="$HOTSPOTS_CSV_FILE" > "$HOTSPOTS_JSON_FILE"; then
        echo "CSV to JSON conversion successful."
    else
        echo "Failed to convert CSV to JSON."
        exit 1
    fi
}

# Function to display Git diff
showGitDiff() {
    git diff -U0 "$HOTSPOTS_MD_FILE"
}

# Main script
createCsvFile
convertCsvToJson
showGitDiff
