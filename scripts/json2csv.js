const fs = require('fs');
const path = require('path');
const JSONStream = require('JSONStream');
const { Transform } = require('stream');
const { Parser } = require('json2csv');

const args = process.argv.slice(2);

if (args.length !== 1) {
  console.error('Please specify a JSON file to convert. Usage: node script.js <source.json>');
  process.exit(1);
}

const jsonFilePath = args[0];
const csvFilePath = path.basename(jsonFilePath, path.extname(jsonFilePath)) + '.csv';

// Create a writable stream to save the CSV and handle events
const outputStream = fs.createWriteStream(csvFilePath, { encoding: 'utf8' });

outputStream.on('error', err => console.error('Error writing to CSV file', err));
outputStream.on('finish', () => console.log(`Successfully converted JSON to CSV and saved to ${csvFilePath}`));

// Set up JSON to CSV transformation
let fields;
const json2csv = new Transform({
  transform(chunk, encoding, callback) {
    // Initialize fields with keys of the first chunk and create a new Parser with the header option set to true
    if (!fields) {
      fields = Object.keys(chunk);
      // Note: We're creating a parser instance with the header option enabled only once here.
      const parser = new Parser({ fields, header: true });
      try {
        const csv = parser.parse(chunk) + '\n';
        callback(null, csv); // Push the CSV with header to the output stream
        return; // Important to avoid running the code below for the first chunk
      } catch (err) {
        callback(err);
        return;
      }
    }

    // For subsequent chunks, we create a new parser instance with the header option disabled.
    const parser = new Parser({ fields, header: false });
    try {
      const csv = parser.parse(chunk) + '\n';
      callback(null, csv); // Push the CSV without header to the output stream
    } catch (err) {
      callback(err);
    }
  },
  readableObjectMode: true,
  writableObjectMode: true
});

// Set up the pipeline
fs.createReadStream(jsonFilePath, { encoding: 'utf8' }) // Read input file
  .pipe(JSONStream.parse('*')) // Parse the JSON objects one by one
  .pipe(json2csv) // Transform JSON to CSV
  .pipe(outputStream); // Write CSV to the file
