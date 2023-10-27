const fs = require('fs');
const path = require('path');

/**
 * Convert an array of objects to CSV string.
 * @param {Object[]} data - Array of objects.
 * @returns {string} CSV string.
 */
function convertArrayToCSV(data) {
  if (data.length === 0) {
    return '';
  }

  const header = Object.keys(data[0]).join(',') + '\n';
  const rows = data.map(obj => {
    const values = Object.keys(obj).map(key => {
      let value = obj[key];
      // Quote the value if it's a string with commas
      value = typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      return value;
    });
    return values.join(',');
  }).join('\n');

  return header + rows;
}

/**
 * Main function to handle reading JSON and writing CSVs.
 * @param {string} inputFilename - Input JSON file name.
 */
function main(inputFilename) {
  fs.readFile(inputFilename, { encoding: 'utf8' }, (err, data) => {
    if (err) {
      console.error('Error reading the JSON file:', err);
      return;
    }

    let parsedData;
    try {
      parsedData = JSON.parse(data);
    } catch (parseError) {
      console.error('Error parsing JSON data:', parseError);
      return;
    }

    // Check if the necessary keys are available in the JSON object
    const requiredKeys = ['Breeding', 'Arizona', 'Unknown'];
    const missingKeys = requiredKeys.filter(key => !(key in parsedData));
    if (missingKeys.length > 0) {
      console.error(`Error: The following key(s) are missing in the JSON data: ${missingKeys.join(', ')}`);
      return;
    }

    // Convert each array to CSV and write to a file
    requiredKeys.forEach(key => {
      const csvContent = convertArrayToCSV(parsedData[key]);
      if (!csvContent) {
        console.log(`No data available for "${key}" to write to a CSV file.`);
        return;
      }

      const outputFilename = path.join(__dirname, `${key}.csv`);
      fs.writeFile(outputFilename, csvContent, writeErr => {
        if (writeErr) {
          console.error(`Error writing "${key}.csv":`, writeErr);
          return;
        }

        console.log(`Successfully wrote "${key}.csv".`);
      });
    });
  });
}

// Main entry point
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('Usage: node json_to_multiple_csv.js <inputFile.json>');
  process.exit(1);
}

const inputPath = path.resolve(__dirname, args[0]);
main(inputPath);
