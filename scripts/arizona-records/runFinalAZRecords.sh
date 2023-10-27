#!/bin/bash

# Change to the directory where the script is located
cd "$(dirname "$0")"

# Array to hold all the processed file names
processed_files=()

# Iterate over the csv files in the split_files directory
for file in split_files/split_*.csv
do
  # Extract the unique portion of the filename (e.g., "aa" from "split_aa.csv")
  unique_identifier=$(basename -- "$file" .csv | cut -d '_' -f 2)

  # Construct the new output filename (e.g., "processed_aa.json")
  output_file="split_files/processed_${unique_identifier}.json"

  # Add the output file name to the array
  processed_files+=("$output_file")

  # Run the node script with the current input file and the new output file name
  node ../cli.js rareAZ --input="${file}" --output="${output_file}"
done

# Constructing the jq input argument with the processed files
jq_input=$(printf " %s" "${processed_files[@]}")
jq_input=${jq_input:1} # Removing the leading space

# Running the jq command to merge all processed files
jq -s 'reduce .[] as $item ({}; .Breeding += $item.Breeding | .Arizona += $item.Arizona | .Unknown += $item.Unknown)' $jq_input > split_files/munged.json
