#!/bin/bash

# Directory of .csv files
DIRECTORY="/Users/richard/src/birding/ebird-ext/scripts/split_files"

# Node script that you want to run on each file
NODE_SCRIPT="/Users/richard/src/birding/ebird-ext/scripts/json2csv.js"

# Check if the Node.js script file exists
if [ ! -f "$NODE_SCRIPT" ]; then
    echo "Node.js script not found: $NODE_SCRIPT"
    exit 1
fi

# Iterate over all .csv files in the directory
for filename in $DIRECTORY/split_*.json; do
  # Check if the current entity is a file
  if [ -f "$filename" ]; then
      echo "Processing $filename"
      # Run the Node command on the file
      node $NODE_SCRIPT "$filename"

      # # Extract the base name of the file without extension
      base_name=$(basename -- "$filename")
      name_without_extension="${base_name%.*}"

      # Construct the new name based on the input file's name
      new_filename="${name_without_extension}.csv"

      # Check if "results.json" was created and hasn't been moved or deleted by the Node script
      if [ -f "$new_filename" ]; then
          # Rename the result file to avoid it being overwritten in the next iteration
          mv "$new_filename" "$DIRECTORY/$new_filename"
      else
          echo "Expected output file (${new_filename}) not found. It may have been moved, deleted, or not created."
      fi
  else
      echo "No .json files found in the specified directory."
      break
  fi
done

echo "All files processed."
