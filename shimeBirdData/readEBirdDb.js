// This function reads only the eBird database files, requestable from eBird.
const fs = require('fs')
const csv = require('csv-parse')
const f = require('../filters')
const helpers = require('../helpers')
const banding = require('../bandingCodes')
const _ = require('lodash')
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

const areas = process.argv[2] // 'regions', 'towns', '150', '250'
const files = [process.argv[3]]

if (!['regions', 'towns', '150', '250', 'json'].includes(areas)) {
  console.log('Specify towns, regions, or json please.')
  console.log('Example: node readEBirdDb.js regions /Users/richard/Downloads/ebd_US-VT_relJan-2022/counties/test-050.txt')
  console.log()
  console.log('You can also add 150 as a third parameter to run counts.')
  process.exit(1)
}

// Necessary because we remove all quotes from the files before piping them in
// TODO Figure out how to outmode. Won't work for all taxon in database.
function addStringstoCommonName (input) {
  const quoteSpecies = {
    'Alder/Willow Flycatcher (Traills Flycatcher)': "Alder/Willow Flycatcher (Traill's Flycatcher)",
    'Bairds Sandpiper': "Baird's Sandpiper",
    'Barrows Goldeneye': "Barrow's Goldeneye",
    'Bewicks Wren': "Bewick's Wren",
    'Bicknells Thrush': "Bicknell's Thrush",
    'Bonapartes Gull': "Bonaparte's Gull",
    'Brewers Blackbird': "Brewer's Blackbird",
    'Brewsters Warbler (hybrid)': "Brewster's Warbler (hybrid)",
    'Bullocks Oriole': "Bullock's Oriole",
    'Cassins Vireo': "Cassin's Vireo",
    'Common x Barrows Goldeneye (hybrid)': "Common x Barrow's Goldeneye (hybrid)",
    'Common/Barrows Goldeneye': "Common/Barrow's Goldeneye",
    'Common/Forsters Tern': "Common/Forster's Tern",
    'Coopers Hawk': "Cooper's Hawk",
    'Coopers Hawk/Northern Goshawk': "Cooper's Hawk/Northern Goshawk",
    'Corys Shearwater': "Cory's Shearwater",
    'Forsters Tern': "Forster's Tern",
    'Franklins Gull': "Franklin's Gull",
    'Gray-cheeked/Bicknells Thrush': "Gray-cheeked/Bicknell's Thrush",
    'Harriss Sparrow': "Harris's Sparrow",
    'Henslows Sparrow': "Henslow's Sparrow",
    'Lawrences Warbler (hybrid)': "Lawrence's Warbler (hybrid)",
    'Leachs Storm-Petrel': "Leach's Storm-Petrel",
    'LeContes Sparrow': "LeConte's Sparrow",
    'Lewiss Woodpecker': "Lewis's Woodpecker",
    'Lincolns Sparrow': "Lincoln's Sparrow",
    'Nelsons Sparrow': "Nelson's Sparrow",
    'Nelsons/Saltmarsh Sparrow (Sharp-tailed Sparrow)': "Nelson's/Saltmarsh Sparrow (Sharp-tailed Sparrow)",
    'Rosss Goose': "Ross's Goose",
    'Sabines Gull': "Sabine's Gull",
    'Says Phoebe': "Say's Phoebe",
    'Sharp-shinned/Coopers Hawk': "Sharp-shinned/Cooper's Hawk",
    'Smiths Longspur': "Smith's Longspur",
    'Snow x Rosss Goose (hybrid)': "Snow x Ross's Goose (hybrid)",
    'Snow/Rosss Goose': "Snow/Ross's Goose",
    'Swainsons Hawk': "Swainson's Hawk",
    'Swainsons Thrush': "Swainson's Thrush",
    'Swainsons Warbler': "Swainson's Warbler",
    'Townsends Solitaire': "Townsend's Solitaire",
    'Veery x Bicknells Thrush (hybrid)': "Veery x Bicknell's Thrush (hybrid)",
    'Wilsons Phalarope': "Wilson's Phalarope",
    'Wilsons Snipe': "Wilson's Snipe",
    'Wilsons Storm-Petrel': "Wilson's Storm-Petrel",
    'Wilsons Warbler': "Wilson's Warbler"
  }
  if (Object.keys(quoteSpecies).includes(input)) {
    return quoteSpecies[input]
  } else {
    return input
  }
}

// TODO Make a mapping to these fields for some exports
function shimData (row) {
  return {
    'Submission ID': row['SAMPLING EVENT IDENTIFIER'],
    'Common Name': row['COMMON NAME'],
    'Scientific Name': row['SCIENTIFIC NAME'],
    'Taxonomic Order': row['TAXONOMIC ORDER'],
    Count: row['OBSERVATION COUNT'],
    'State/Province': row['STATE CODE'],
    County: row.COUNTY,
    'Location ID': row['LOCALITY ID'],
    Location: row.LOCALITY,
    Latitude: row.LATITUDE,
    Longitude: row.LONGITUDE,
    Date: row['OBSERVATION DATE'],
    Time: row['TIME OBSERVATIONS STARTED'],
    Protocol: row['PROTOCOL TYPE'],
    'Duration (Min)': row['DURATION MINUTES'],
    'All Obs Reported': row['ALL SPECIES REPORTED'],
    'Distance Traveled (km)': row['EFFORT DISTANCE KM'],
    'Area Covered (ha)': row['EFFORT AREA HA'],
    'Number of Observers': row['NUMBER OBSERVERS'],
    'Breeding Code': row['BREEDING CODE'],
    'Observer ID': row['OBSERVER ID'],
    'Observation Details': row['SPECIES COMMENTS'],
    'Checklist Comments': row['TRIP COMMENTS'],
    'ML Catalog Numbers': row['HAS MEDIA']
  }
}

async function rowsToJSON (file, string) {
  return new Promise(function (resolve, reject) {
    const shimmedRows = []
    fs.createReadStream(file)
      .pipe(parser)
      .on('data', (row) => shimmedRows.push(f.completeChecklistFilter([shimData(row)], { complete: true, noIncidental: true })))
      .on('error', (e) => console.log('BONK', e))
      .on('end', () => {
        fs.writeFile('results.json', JSON.stringify(shimmedRows), 'utf8', (err) => {
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

async function runFile (file, string) {
  return new Promise(function (resolve, reject) {
    const boundaries = {}
    const boundaryIds = {}

    // Note: If you need to make a log file, this is how you do it.
    // const dirty = fs.createWriteStream('dirty_entries.txt', { flags: 'a' })

    fs.createReadStream(file)
      .pipe(parser)
      .on('data', (row) => {
        // Note: This check has to be turned on manually. Perhaps there should be opts for that, instead?
        const filteredRow = f.durationFilter(f.completeChecklistFilter([shimData(row)], { complete: true }), { duration: 5 }).length !== 0

        if (filteredRow) {
          // Define some variables that won't be in the output but help you sort
          const year = row['OBSERVATION DATE'].split('-')[0]
          const coordinates = {
            Longitude: row.LONGITUDE,
            Latitude: row.LATITUDE
          }
          // Areas is regions or towns - this figures out where a point is.
          const point = f.getPoint(areas, coordinates, Number(row['COUNTY CODE'].split('-')[2]))
          const species = {
            'Scientific Name': row['SCIENTIFIC NAME'],
            'Common Name': row['COMMON NAME']
          }

          // console.log(row)

          // TODO Adjust to use four-letter banding codes instead.
          const commonName = addStringstoCommonName(species['Common Name'])
          const isSpecies = f.removeSpuh([species]).length

          // Create a list of areas and fill them with common names of species.
          if (isSpecies) {
            if (!(point in boundaries)) {
              boundaries[point] = [commonName]
            } else {
              if (boundaries[point].indexOf(commonName) < 0) {
                boundaries[point].push(commonName)
              }
            }
          }
          // TODO Comment on why boundaryIds is different from boundaries
          if (!(point in boundaryIds)) {
            boundaryIds[point] = {
              observers: {},
              spuhs: []
            }
          }
          // Make a list of what years an area has been birded.
          if (!boundaryIds[point].years) {
            boundaryIds[point].years = [year]
          } else if (boundaryIds[point].years.indexOf(year) < 0) {
            boundaryIds[point].years.push(year)
          }
          // Make a list of total bird observations.
          const birdCount = parseInt(row['OBSERVATION COUNT'])
          if (_.isInteger(birdCount)) {
            if (!boundaryIds[point].birdCount) {
              boundaryIds[point].birdCount = birdCount
            } else if (boundaryIds[point].birdCount) {
              boundaryIds[point].birdCount = parseInt(boundaryIds[point].birdCount) + birdCount
            }
          }
          // TODO Why am I adding in observer checklists?
          if (Object.keys(boundaryIds[point].observers).indexOf(row['OBSERVER ID']) < 0) {
            boundaryIds[point].observers[row['OBSERVER ID']] = [row['SAMPLING EVENT IDENTIFIER']]
          } else {
            if (boundaryIds[point].observers[row['OBSERVER ID']].indexOf(row['SAMPLING EVENT IDENTIFIER']) < 0) {
              boundaryIds[point].observers[row['OBSERVER ID']].push(row['SAMPLING EVENT IDENTIFIER'])
            }
          }
          // Create a spuh section
          if (!isSpecies && boundaryIds[point].spuhs.indexOf(commonName) < 0) {
            boundaryIds[point].spuhs.push(commonName)
          }
        }
      })
      .on('error', (e) => {
        console.log('BONK', e)
      })
      .on('end', () => {
        const totalCount = []
        Object.keys(boundaryIds).forEach(t => {
          if (boundaryIds[t].birdCount) {
            totalCount.push(parseInt(boundaryIds[t].birdCount))
          }
          boundaryIds[t].checklists = 0
          boundaryIds[t].observersCount = 0
          Object.keys(boundaryIds[t].observers).forEach(v => {
            if (v.startsWith('obsr')) {
              boundaryIds[t].checklists += boundaryIds[t].observers[v].length
              boundaryIds[t].observersCount += 1
              // No need to keep the checklists, as this just adds rows
              boundaryIds[t].observers[v] = boundaryIds[t].observers[v].length
            }
          })
          delete boundaryIds[t].observers
          boundaryIds[t].speciesCount = boundaries[t].length
          boundaryIds[t].species = boundaries[t]
          boundaryIds[t].averageChecklistsPerBirder = (boundaryIds[t].checklists / boundaryIds[t].observersCount).toFixed(2)
          boundaryIds[t].averageBirdsOverBirders = (boundaryIds[t].speciesCount / boundaryIds[t].observersCount).toFixed(2)
          boundaryIds[t].averageChecklistsToBirds = (boundaryIds[t].checklists / boundaryIds[t].speciesCount).toFixed(2)
        })
        // console.log('Total count: ', _.sum(totalCount))
        console.log('CSV file successfully processed')
        fs.writeFile(`vt${helpers.capitalizeFirstLetters(areas)}-${string}.json`, JSON.stringify(boundaryIds), 'utf8', (err) => {
          if (err) {
            console.log(err)
            reject(err)
          } else {
            console.log(`vt${helpers.capitalizeFirstLetters(areas)}-${string}.json written successfully.`)
            resolve()
          }
        })
      })
  })
}


/// Get records of people who've seen 250 in a year
async function run250Query (file, string) {
  return new Promise(function (resolve, reject) {
    const region250 = {}
    fs.createReadStream(file)
      .pipe(parser)
      .on('data', (row) => {
        // Define some variables that won't be in the output but help you sort
        const year = row['OBSERVATION DATE'].split('-')[0]
        const species = {
          'Scientific Name': row['SCIENTIFIC NAME'],
          'Common Name': row['COMMON NAME']
        }
        // TODO Adjust to use four-letter banding codes instead.
        const isSpecies = f.removeSpuh([species]).length

        const observer = row['OBSERVER ID']
        // Create the data object: All observers, sorted by year, in all areas
        if (!(year in region250)) {
          region250[year] = {}
        }
        if (!(observer in region250[year])) {
          region250[year][observer] = {
            species: [banding.commonNameToCode(species['Common Name'])],
            total: (banding.isBandingCode(banding.commonNameToCode(species['Common Name']))) ? 1 : 0,
            sampleChecklistId: row['SAMPLING EVENT IDENTIFIER']
          }
        }
        // Add unique species (not spuhs) to the observer entries
        if (!(region250[year][observer].species.includes(banding.commonNameToCode(species['Common Name'])))) {
          region250[year][observer].species.push(banding.commonNameToCode(species['Common Name']))
          if (isSpecies) {
            if (banding.isBandingCode(banding.commonNameToCode(species['Common Name']))) {
              const noSpuhs = region250[year][observer].species.filter(s => {
                const spuhed = f.removeSpuh([{
                  'Scientific Name': banding.codeToScientificName(s)
                }])
                return !!(spuhed.length)
              })
              region250[year][observer].total = noSpuhs.length
            }
          }
        }
      })
      .on('error', (e) => {
        console.log('BONK', e)
      })
      .on('end', () => {

        const filteredYear = function (obj, year, filterValue) {
          return Object.keys(obj[year]).reduce((res, key) => {
            return (
              (obj[year][key].total && obj[year][key].total > filterValue)
                ? res[key] = obj[year][key]
                : false
                , res
            )
          }, {})
        }

        // Arguably, I could have done this instead of the above.
        const filteredRegion = function (obj, filterValue) {
          const newObj = {}
          Object.keys(obj).forEach(year => {
            const observers = filteredYear(obj, year, filterValue)
            if (!_.isEmpty(observers)) {
              newObj[year] = observers
            }
          })
          return newObj
        }

        const newObj = filteredRegion(region250, 250)

        // After getting this, sort to show only >150 species, or the top three for a region that year.
        // Also, only save the banding codes for species?
        fs.writeFile(`vt-250-${string}.json`, JSON.stringify(newObj), 'utf8', (err) => {
          if (err) {
            console.log(err)
            reject(err)
          } else {
            console.log(`vt-250-${string}.json written successfully.`)
            resolve()
          }
        })
      })
  })
}

async function run150Query (file, string) {
  return new Promise(function (resolve, reject) {
    const region150 = {}
    fs.createReadStream(file)
      .pipe(parser)
      .on('data', (row) => {
        // Define some variables that won't be in the output but help you sort
        const year = row['OBSERVATION DATE'].split('-')[0]
        const coordinates = {
          Longitude: row.LONGITUDE,
          Latitude: row.LATITUDE
        }
        // Areas is regions or towns - this figures out where a point is.
        const point = f.getPoint(areas, coordinates, Number(row['COUNTY CODE'].split('-')[2]))
        const species = {
          'Scientific Name': row['SCIENTIFIC NAME'],
          'Common Name': row['COMMON NAME']
        }
        // TODO Adjust to use four-letter banding codes instead.
        const isSpecies = f.removeSpuh([species]).length

        const observer = row['OBSERVER ID']
        // Create the data object: All observers, sorted by year, in all areas
        if (!(point in region150)) {
          region150[point] = {}
        }
        if (!(year in region150[point])) {
          region150[point][year] = {}
        }
        if (!(observer in region150[point][year])) {
          region150[point][year][observer] = {
            species: [banding.commonNameToCode(species['Common Name'])],
            total: (banding.isBandingCode(banding.commonNameToCode(species['Common Name']))) ? 1 : 0,
            sampleChecklistId: row['SAMPLING EVENT IDENTIFIER']
          }
        }
        // Add unique species (not spuhs) to the observer entries
        if (!(region150[point][year][observer].species.includes(banding.commonNameToCode(species['Common Name'])))) {
          region150[point][year][observer].species.push(banding.commonNameToCode(species['Common Name']))
          if (isSpecies) {
            if (banding.isBandingCode(banding.commonNameToCode(species['Common Name']))) {
              const noSpuhs = region150[point][year][observer].species.filter(s => {
                const spuhed = f.removeSpuh([{
                  'Scientific Name': banding.codeToScientificName(s)
                }])
                return !!(spuhed.length)
              })
              region150[point][year][observer].total = noSpuhs.length
            }
          }
        }
      })
      .on('error', (e) => {
        console.log('BONK', e)
      })
      .on('end', () => {
        const filteredYear = function (region, year, filterValue) {
          return Object.keys(region[year]).reduce((res, key) => {
            return (
              (region[year][key].total && region[year][key].total > filterValue)
                ? res[key] = region[year][key]
                : false
                , res
            )
          }, {})
        }

        // Arguably, I could have done this instead of the above.
        const filteredRegion = function (obj, region, filterValue) {
          const newObj = {}
          Object.keys(obj).forEach(region => {
            const newRegionObj = {}
            Object.keys(obj[region]).forEach(year => {
              const observers = filteredYear(obj[region], year, filterValue)
              if (!_.isEmpty(observers)) {
                newRegionObj[year] = observers
              }
            })
            if (!_.isEmpty(newRegionObj)) {
              newObj[region] = newRegionObj
            }
          })
          // console.log(newObj)
          return newObj
        }

        const newObj = filteredRegion(region150, 'Northern Vermont Piedmont', 0)

        // After getting this, sort to show only >150 species, or the top three for a region that year.
        // Also, only save the banding codes for species?
        fs.writeFile(`vt${helpers.capitalizeFirstLetters(areas)}-150-${string}.json`, JSON.stringify(newObj), 'utf8', (err) => {
          if (err) {
            console.log(err)
            reject(err)
          } else {
            console.log(`vt${helpers.capitalizeFirstLetters(areas)}-150-${string}.json written successfully.`)
            resolve()
          }
        })
      })
  })
}

async function analyzeFiles () {
  for (const file of files) {
    // Change if using a test file
    // const string = file.match(/0\d\d\.txt/g)[0].match(/\d+/g)[0]
    let string = file
    // The output file can't have a slash in the title.
    if (file.includes('/')) {
      string = file.split('/')[file.split('/').length - 1].split('.')[0]
    }
    console.log(`Analyzing ${file}.`)
    if (areas === 'json') {
      await rowsToJSON(file, string)
    } else if (areas === '150') {
      await run150Query(file, string)
    } else if (areas === '250') {
      await run250Query(file, string)
    } else {
      await runFile(file, string)
    }
    console.log(`Analyzed ${file}.`)
  }
}

analyzeFiles()
