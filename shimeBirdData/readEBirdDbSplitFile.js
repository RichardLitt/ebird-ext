const fs = require('fs')
const csv = require('csv-parse')
const parser = csv({
  delimiter: '\t',
  record_delimiter: '\n',
  skip_empty_lines: true,
  relax_column_count: true, // this will cause a blow up if removed
  relax: true, // this should allow for the double quotes in individual columns, specifically field notes
  from: 2, // starting on file 53
  quote: '"',// this also helps to prevent errors on quotes
  ltrim: true,
  rtrim: true,
  columns: [
    'id',
    'updated',
    'order',
    'category',
    'commonName',
    'scientificName',
    'subspeciesCommonName',
    'subspeciesScientificName',
    'count',
    'breedingCode',
    'breedingCategory',
    'behaviorCode',
    'ageSex',
    'country',
    'countryCode',
    'state',
    'stateCode',
    'county',
    'countyCode',
    'iba',
    'codeusfws',
    'atlas',
    'locality',
    'localityId',
    'localityType',
    'wtf',
    'latitude',
    'longitude',
    'observationDate',
    'timeStarted',
    'observer',
    'samplingEventId',
    'protocolType',
    'protocolCode',
    'projectCode',
    'minutes',
    'km',
    'hanumber',
    'allSpeciesReported',
    'groupId',
    'hasMedia',
    'approved',
    'reviewed',
    'reason',
    'comments',
    'speciesComments'
  ]
})

const filepath = '/Users/richard/Downloads/ebd_US-VT_relNov-2021/023.txt'

// count is the number we use to limit the number of records going into a specific file
let count = 0
let fileRecordLength = 100000 // used to determine how many to drop in one file
// first pass was 100,000. That blew up if there were too many comments.

// file number is the number in the filename designating the order of records read
let fileNumber = 0

let records = []
fs.createReadStream(filepath)
  .pipe(parser)
  .on('error', (error) => {
    console.error('BONK', error)
  })
  .on('data', (row) => {
    console.log(row)
    if(row.wtf !== 'P') {
      row.locality = row.localityId
      row.localityId = row.localityType
      row.localityType = row.wtf
      delete row.wtf
    }

    records.push(row)
    if(count > fileRecordLength) {
      fs.writeFileSync(`./jsonFile_${fileNumber}.json`, JSON.stringify(records))
      fileNumber = fileNumber+1
      count = 0
      records = []
    } else {
      count++
    }
  })
  .on('end', () => {
    console.log('finished')
  });
