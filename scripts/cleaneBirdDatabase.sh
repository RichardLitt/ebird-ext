#!/usr/bin/env bash

# Made with ChatGPT

# Check if a file path argument is provided
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <input_file>"
  exit 1
fi

input_file="$1"

# Check if the input file exists
if [ ! -f "$input_file" ]; then
  echo "Error: Input file '$input_file' not found."
  exit 1
fi

echo "Removing quotes from '$input_file'..."

# Create a temporary file to store the cleaned content
tmp_file=$(mktemp)

# Remove double quotes from the input file and save it in the temporary file
sed 's/"//g' "$input_file" > "$tmp_file"

# Remove single quotes from the temporary file and overwrite the original file
sed "s/'//g" "$tmp_file" > "$input_file"

# Remove the temporary file
rm "$tmp_file"

# Rename the input file to include "_clean.txt" in the title and overwrite the original file
mv "$input_file" "${input_file%.txt}_clean.txt"

echo "File '$input_file' has been renamed to '${input_file%.txt}_clean.txt'."

echo "Done."