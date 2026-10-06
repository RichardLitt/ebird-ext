// This function reads only the eBird database files, requestable from eBird.
import fs from 'node:fs'
import csvStream from './csvStream.js'
import t from '../taxonomicSort.js'
import { Transform } from 'node:stream'
// EBD files are unquoted, but comments can contain stray double quotes: quoting is off
const parser = () => csvStream({
  delimiter: '\t',
  quoteChar: '\u0000',
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
// Used to filter out unapproved entries before getting to data sorting.
class Filter extends Transform {
  constructor () {
    super({
      readableObjectMode: true,
      writableObjectMode: true
    })
  }

  _transform (chunk, encoding, next) {
    if (this.approved(chunk)) {
      return next(null, chunk)
    }

    next()
  }

  approved (value) {
    return value.APPROVED !== '0'
  }
}

const files = [process.argv[2]]

async function analyzeFiles () {
  for (const file of files) {
    // Change if using a test file
    // const string = file.match(/0\d\d\.txt/g)[0].match(/\d+/g)[0]
    const string = file
    console.log(`Analyzing ${file}.`)
    await runFile(file, string)
    console.log(`Analyzed ${file}.`)
  }
}

async function runFile (filepath, string) {
  return new Promise(function (resolve, reject) {
    // TODO Fix this to only use a single object - I don't need to have shimmedRows
    // and also speciesNames. Also, log the years for each state. That'll make it easier
    // to get frequency data for vagrants.
    // TODO: Check if this is OK from a research perspective for eBird?

    const shimmedData = {}
    let state = ''
    fs.createReadStream(filepath)
      .pipe(parser())
      .pipe(new Filter())
      .on('data', (row) => {
        if (!state) {
          state = row['STATE CODE'].split('-')[1]
        }
        const entry = {}
        let entryKey
        let sspCheck = false
        const year = row['OBSERVATION DATE'].split('-')[0]
        if (row['SUBSPECIES SCIENTIFIC NAME']) {
          entryKey = row['SUBSPECIES SCIENTIFIC NAME']
          entry.subspecies = row['SUBSPECIES SCIENTIFIC NAME']
          entry.commonName = row['SUBSPECIES COMMON NAME']
          sspCheck = true
        } else {
          entryKey = row['SCIENTIFIC NAME']
          entry.commonName = row['COMMON NAME']
        }

        if (!Object.keys(shimmedData).includes(entryKey)) {
          entry[state] = {
            counts: 1,
            years: [year],
            totalYears: 1,
            everyYear: false
          }
          shimmedData[entryKey] = entry
          // If a subspecies record, ensure the species record exists
          if (sspCheck) {
            if (!Object.keys(shimmedData).includes(row['SCIENTIFIC NAME'])) {
              shimmedData[row['SCIENTIFIC NAME']] = entry
            }
          }
        } else {
          if (!shimmedData[entryKey][state].years.includes(year)) {
            shimmedData[entryKey][state].years.push(year)
          }
          shimmedData[entryKey][state].totalYears = shimmedData[entryKey][state].years.length
          // Only for since 2011, to control for length of eBird
          const everyYear = Array(11).fill().map((element, index) => index + 2010).toString()
          shimmedData[entryKey][state].everyYear = shimmedData[entryKey][state].years.toString().includes(everyYear)
          shimmedData[entryKey][state].counts += 1
          // If a subspecies, also add a count to species
          if (sspCheck) {
            shimmedData[row['SCIENTIFIC NAME']][state].counts += 1
          }
        }
      })
      .on('error', (e) => {
        console.log('BONK', e)
      })
      .on('end', () => {
        const sorted = t(Object.keys(shimmedData), 'scientific')
        const sortedcounts = ['Common Name,Scientific Name,State,Counts,Every Year,Total Years,Years']
        sorted.forEach(taxon => {
          sortedcounts.push(`${shimmedData[taxon].commonName},${taxon},${state},${shimmedData[taxon][state].counts},${shimmedData[taxon][state].everyYear},${shimmedData[taxon][state].totalYears},"""${shimmedData[taxon][state].years}"""`)
        })
        fs.writeFile(`${state}-species.csv`, sortedcounts.join('\n'), 'utf8', (err) => {
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
