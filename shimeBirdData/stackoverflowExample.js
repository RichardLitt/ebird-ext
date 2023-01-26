// This function reads only the eBird database files, requestable from eBird.
const fs = require('fs')
const csv = require('csv-parse')
const parser = csv({
  delimiter: '\t',
  record_delimiter: '\n',
  skip_empty_lines: true,
  relax_column_count: true, // this will cause a blow up if removed
  relax: true, // this should allow for the double quotes in individual columns, specifically field notes
  from: 2, // Skip first line
  quote: '"', // this also helps to prevent errors on quotes
  ltrim: true,
  rtrim: true,
  columns: [
    'GLOBAL UNIQUE IDENTIFIER',
    'LAST EDITED DATE',
    'TAXONOMIC ORDER',
    'CATEGORY',
    'TAXON CONCEPT ID',
    'COMMON NAME',
    'SCIENTIFIC NAME',
    'SUBSPECIES COMMON NAME',
    'SUBSPECIES SCIENTIFIC NAME',
    'EXOTIC CODE',
    'OBSERVATION COUNT',
    'BREEDING CODE',
    'BREEDING CATEGORY',
    'BEHAVIOR CODE',
    'AGE/SEX',
    'COUNTRY',
    'COUNTRY CODE',
    'STATE',
    'STATE CODE',
    'COUNTY',
    'COUNTY CODE',
    'IBA CODE',
    'BCR CODE',
    'USFWS CODE',
    'ATLAS BLOCK',
    'LOCALITY',
    'LOCALITY ID',
    'LOCALITY TYPE',
    'LATITUDE',
    'LONGITUDE',
    'OBSERVATION DATE',
    'TIME OBSERVATIONS STARTED',
    'OBSERVER ID',
    'SAMPLING EVENT IDENTIFIER',
    'PROTOCOL TYPE',
    'PROTOCOL CODE',
    'PROJECT CODE',
    'DURATION MINUTES',
    'EFFORT DISTANCE KM',
    'EFFORT AREA HA',
    'NUMBER OBSERVERS',
    'ALL SPECIES REPORTED',
    'GROUP IDENTIFIER',
    'HAS MEDIA',
    'APPROVED',
    'REVIEWED',
    'REASON',
    'TRIP COMMENTS',
    'SPECIES COMMENTS'
  ]
})

const files = process.argv.slice(2)

async function analyzeFiles () {
  for (const file of files) {
    const string = file
    console.log(`Analyzing ${file}.`)
    await runFile(file, string)
    console.log(`Analyzed ${file}.`)
  }
}

async function runFile (filepath, string) {
  return new Promise(function (resolve, reject) {
    const shimmedData = {}
    let fileName = ''
    fs.createReadStream(filepath)
      .pipe(parser)
      .on('data', (row) => {
        if (!fileName) {
          fileName = row['STATE CODE'].split('-')[1]
        }
        shimmedData['COMMON NAME'] = row['SCIENTIFIC NAME']
      })
      .on('error', (e) => {
        console.log('BONK', e)
      })
      .on('end', () => {
        fs.writeFile(`${fileName}.json`, JSON.stringify(shimmedData), (err) => {
          if (err) {
            console.log(err)
            reject(err)
          } else {
            console.log('File written successfully.')
            resolve()
          }
        })
      })
  })
}

analyzeFiles()
