#!/bin/bash

# Function to check the success of a step
check_success() {
    if [ $? -ne 0 ]; then
        echo "Error: Step failed. Exiting."
        exit 1
    fi
}

# Check if correct number of arguments is provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path_to_file>"
    exit 1
fi

# Extract the directory and filename from the input
INPUT_FILE=$1
DIRNAME=$(dirname "${INPUT_FILE}")
BASENAME=$(basename "${INPUT_FILE}")

# Clean the eBird Database
echo "Step 1: Cleaning eBird Database..."
sh scripts/cleaneBirdDatabase.sh "$INPUT_FILE"
check_success  # Check if the previous step was successful

CLEAN_FILE="${DIRNAME}/${BASENAME%.*}_clean.txt"  # Assuming that the script adds '_clean' before file extension

# TODO This is dumb - we shuld go straight from the clean txt to csv, if possible.

# Read and analyze eBird data
echo "Step 2: Reading and Analyzing eBird data..."
node shimeBirdData/readEBirdDb.js json "$CLEAN_FILE"
check_success  # Check if the previous step was successful

# TODO Make the filename dynamic.

# Since the script always outputs 'results.json', the filename is not dynamic. 
# If the output file can be different, you should modify this part.
RESULT_JSON='results.json'

# Convert JSON to CSV
echo "Step 3: Converting JSON to CSV..."
node scripts/json2csv.js "$RESULT_JSON"
check_success  # Check if the previous step was successful

echo "All steps completed successfully."
