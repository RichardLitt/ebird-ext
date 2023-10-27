#!/bin/bash

# This is useful if the CSV file is just too big to work with.
# When you've created JSON from all of them, you can use this jq to merge the files:
# jq -s 'reduce .[] as $item ({}; .Breeding += $item.Breeding | .Arizona += $item.Arizona | .Unknown += $item.Unknown)' output_aa.json output_ab.json output_ac.json output_ad.json > munged.json

# Check if an argument was provided
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 source_file.csv"
    exit 1
fi

# Variables
source_file="$1"  # The large file you want to split, provided as an argument
number_of_lines=500000 # Number of lines you want in each split file
output_directory="split_files"  # The directory where you want to store the split files
file_prefix="split"  # The prefix of each split file

# Check if the provided file exists
if [ ! -f "${source_file}" ]; then
    echo "Error: File '${source_file}' not found."
    exit 1
fi

# Extract the file extension
file_extension="${source_file##*.}"  # This will get the part after the last '.'

# If no extension is found, default to 'txt'
if [ -z "$file_extension" ]; then
    file_extension="txt"
fi

# Create a directory for split files, if it doesn't exist
mkdir -p "${output_directory}"

# Get the header (the first row of the original file)
header=$(head -n 1 "${source_file}")

# Split the file (excluding the header) and prefix files with the line number for sorting
tail -n +2 "${source_file}" | split -l "${number_of_lines}" - "${output_directory}/${file_prefix}_"

# Navigate to the output directory to avoid moving files at the end
cd "${output_directory}"

# Add the header to each split file
for fname in ${file_prefix}_*
do
    # Temporary file to hold the concatenation, to avoid issues with large files
    tmp_file=$(mktemp /tmp/split.XXXXXX)

    # Add the header to the temporary file
    echo "${header}" > "${tmp_file}"

    # Append the original split file content to the temporary file
    cat "${fname}" >> "${tmp_file}"

    # Replace the original split file with the new file that includes the header
    mv "${tmp_file}" "${fname}.${file_extension}"

    # Remove the original split file without the header
    rm "${fname}"
done

echo "Splitting complete: '${source_file}' has been split into smaller files in '${output_directory}'"
