// This function reads only the eBird database files, requestable from eBird.

const fs = require('fs')
const readline = require('readline')
const csv = require('csv-parse')
const Town_boundaries = require('./geojson/vt_towns.json')
const Vermont_regions = require('./geojson/Polygon_VT_Biophysical_Regions.json')
// const VermontSubspecies = require('./data/vermont_records_subspecies.json')
const GeoJsonGeometriesLookup = require('geojson-geometries-lookup')
const vermontTowns = new GeoJsonGeometriesLookup(Town_boundaries)
const vermontRegions = new GeoJsonGeometriesLookup(Vermont_regions)
const eBird = require('./')
const _ = require('lodash')
const parser = csv({
  delimiter: '\t',
  record_delimiter: '\n',
  skip_empty_lines: true,
  relax_column_count: true, // this will cause a blow up if removed
  relax: true, // this should allow for the double quotes in individual columns, specifically field notes
  from: 2, // ?
  quote: '"',// this also helps to prevent errors on quotes
  ltrim: true,
  rtrim: true,
  columns: [
    'GLOBAL UNIQUE IDENTIFIER',
    'LAST EDITED DATE',
    'TAXONOMIC ORDER',
    'CATEGORY',
    'COMMON NAME',
    'SCIENTIFIC NAME',
    'SUBSPECIES COMMON NAME',
    'SUBSPECIES SCIENTIFIC NAME',
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
    'BCR CODEUSFWS CODE',
    'ATLAS BLOCK',
    'LOCALITY',
    'LOCALITY ID',
    'LOCALITY TYPE',
    'WTF IS P',
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

// Necessary because we remove all quotes from the files before piping them in
function addStringstoCommonName (input) {
  let quoteSpecies = {
    "Alder/Willow Flycatcher (Traills Flycatcher)": "Alder/Willow Flycatcher (Traill's Flycatcher)",
    "Bairds Sandpiper": "Baird's Sandpiper",
    "Barrows Goldeneye": "Barrow's Goldeneye",
    "Bewicks Wren": "Bewick's Wren",
    "Bicknells Thrush": "Bicknell's Thrush",
    "Bonapartes Gull": "Bonaparte's Gull",
    "Brewers Blackbird": "Brewer's Blackbird",
    "Brewsters Warbler (hybrid)": "Brewster's Warbler (hybrid)",
    "Bullocks Oriole": "Bullock's Oriole",
    "Cassins Vireo": "Cassin's Vireo",
    "Common x Barrows Goldeneye (hybrid)": "Common x Barrow's Goldeneye (hybrid)",
    "Common/Barrows Goldeneye": "Common/Barrow's Goldeneye",
    "Common/Forsters Tern": "Common/Forster's Tern",
    "Coopers Hawk": "Cooper's Hawk",
    "Coopers Hawk/Northern Goshawk": "Cooper's Hawk/Northern Goshawk",
    "Corys Shearwater": "Cory's Shearwater",
    "Forsters Tern": "Forster's Tern",
    "Franklins Gull": "Franklin's Gull",
    "Gray-cheeked/Bicknells Thrush": "Gray-cheeked/Bicknell's Thrush",
    "Harriss Sparrow": "Harris's Sparrow",
    "Henslows Sparrow": "Henslow's Sparrow",
    "Lawrences Warbler (hybrid)": "Lawrence's Warbler (hybrid)",
    "Leachs Storm-Petrel": "Leach's Storm-Petrel",
    "LeContes Sparrow": "LeConte's Sparrow",
    "Lewiss Woodpecker": "Lewis's Woodpecker",
    "Lincolns Sparrow": "Lincoln's Sparrow",
    "Nelsons Sparrow": "Nelson's Sparrow",
    "Nelsons/Saltmarsh Sparrow (Sharp-tailed Sparrow)": "Nelson's/Saltmarsh Sparrow (Sharp-tailed Sparrow)",
    "Rosss Goose": "Ross's Goose",
    "Sabines Gull": "Sabine's Gull",
    "Says Phoebe": "Say's Phoebe",
    "Sharp-shinned/Coopers Hawk": "Sharp-shinned/Cooper's Hawk",
    "Smiths Longspur": "Smith's Longspur",
    "Snow x Rosss Goose (hybrid)": "Snow x Ross's Goose (hybrid)",
    "Snow/Rosss Goose": "Snow/Ross's Goose",
    "Swainsons Hawk": "Swainson's Hawk",
    "Swainsons Thrush": "Swainson's Thrush",
    "Swainsons Warbler": "Swainson's Warbler",
    "Townsends Solitaire": "Townsend's Solitaire",
    "Veery x Bicknells Thrush (hybrid)": "Veery x Bicknell's Thrush (hybrid)",
    "Wilsons Phalarope": "Wilson's Phalarope",
    "Wilsons Snipe": "Wilson's Snipe",
    "Wilsons Storm-Petrel": "Wilson's Storm-Petrel",
    "Wilsons Warbler": "Wilson's Warbler"
  }
  if (Object.keys(quoteSpecies).includes(input)) {
    return quoteSpecies[input]
  } else {
    return input
  }
}

const filepaths = [
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/001.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/003.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/005.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/007.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/009.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/011.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/013.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/015.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/017.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/019.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/021.txt',
  '/Users/richard/Downloads/ebd_US-VT_relNov-2021/hitchcock.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/025.txt',
  // '/Users/richard/Dropbox/ebd_US-VT_relNov-2021/027.txt'
]

filepaths.forEach(async filepath => {
  // let string = filepath.match(/0\d\d\.txt/g)[0].match(/\d+/g)[0]
  let string = filepath[0]
  // console.log(filepath)
  await runFile(filepath, string)
  console.log(`Analyzed ${filepath}.`)
})

// TODO Make a mapping to these fields for some exports
function shimData (row) {
  return {
    "Submission ID": row['SAMPLING EVENT IDENTIFIER'],
    "Common Name": row['COMMON NAME'],
    "Scientific Name": row['SCIENTIFIC NAME'],
    "Taxonomic Order": row['TAXONOMIC ORDER'],
    "Count": row['OBSERVATION COUNT'],
    "State/Province": row['STATE CODE'],
    "County": row['COUNTY'],
    "Location ID": row['LOCALITY ID'],
    "Location": row['LOCALITY'],
    "Latitude": row['LATITUDE'],
    "Longitude": row['LONGITUDE'],
    "Date": row['OBSERVATION DATE'],
    "Time": row['TIME OBSERVATIONS STARTED'],
    "Protocol": row['PROTOCOL TYPE'],
    "Duration (Min)": row['DURATION MINUTES'],
    "All Obs Reported": row['ALL SPECIES REPORTED'],
    "Distance Traveled (km)": row['EFFORT DISTANCE KM'],
    "Area Covered (ha)": row['EFFORT AREA HA'],
    "Number of Observers": row['NUMBER OBSERVERS'],
    "Breeding Code": row['BREEDING CODE'],
    "Observation Details": row['SPECIES COMMENTS'],
    "Checklist Comments": row['TRIP COMMENTS'],
    "ML Catalog Numbers": row['HAS MEDIA']
  }
}


async function runFile (filepath, string) {
  let boundaries = {}
  let boundaryIds = {}
  let findTowns = false
  let findRegions = true
  let point

  // Goal: We want to be able to read the database of .csv files and automatically identify
  // for a given town or county, what birds were seen. This will require using geojson and other
  // algorithms in src/ebird-ext...
  // our first pass will text-match county, outputting a file of $COUNTY_NAME.json with an array of birds
  // second pass will do a town via Lat/Long and output a $TOWN.json with the data
  // each of the above files will also have the record GUIDs from the CSV file to avoid future re-import when we jam this :poop: in a DB

  // Point Lookup - this is the thing we should be able to do

  // Ideally, we would have an object for each town which shows what species were seen in that town.
  // This should match the result of: node cli.js towns --input=MyEBirdData.csv

  const shimmedRows = []

  await fs.createReadStream(filepath)
    .pipe(parser)
    .on('data', (row) => { // this is directly on the file's readstream
      if (row['WTF IS P'] !== 'P') {
        // console.log(row['LOCALITY ID'])
        row.LOCALITY = row['LOCALITY ID']
        row['LOCALITY ID'] = row['LOCALITY TYPE']
        row['LOCALITY TYPE'] = row['WTF IS P']
        delete row['WTF IS P']
      }

      let data = {
        Longitude: row["LONGITUDE"],
        Latitude: row["LATITUDE"]
      }

      if (findTowns) {
        point = eBird.pointLookup(Town_boundaries, vermontTowns, data)
      } else if (findRegions) {
        point = eBird.pointLookup(Vermont_regions, vermontRegions, data)
      }

      let species = {
        'Scientific Name': row['SCIENTIFIC NAME'],
        'Common Name': row['COMMON NAME']
      }
      let isSpecies = eBird.removeSpuh([species]).length
      let commonName = addStringstoCommonName(species['Common Name'])

      if (isSpecies) {
        // sort by county
        // if (!(row['COUNTY'] in counties)) {
        // } else {
        //   if(counties[row['COUNTY']].indexOf(commonName) < 0){
        //     counties[row['COUNTY']].push(commonName)
        //   }
        // }

        if (!(point in boundaries)) {
          boundaries[point] = [commonName]
        } else {
          if(boundaries[point].indexOf(commonName) < 0){
            boundaries[point].push(commonName)
          }
        }
      }
      let year = row['OBSERVATION DATE'].split('-')[0]
      if(!(point in boundaryIds)) {
        boundaryIds[point] = {
          observers: {},
          spuhs: []
        }
        // console.log(row)
      }
      if (!boundaryIds[point].years) {
        boundaryIds[point].years = [year]
      } else if (boundaryIds[point].years.indexOf(year) < 0) {
        boundaryIds[point].years.push(year)
      }
      let birdCount = parseInt(row['OBSERVATION COUNT'])
      if (_.isInteger(birdCount)) {
        if (!boundaryIds[point].birdCount) {
          boundaryIds[point].birdCount = birdCount
        } else if (boundaryIds[point].birdCount) {
          boundaryIds[point].birdCount = parseInt(boundaryIds[point].birdCount) + birdCount
        }
        if (Object.keys(boundaryIds[point].observers).indexOf(row['OBSERVER ID']) < 0) {
          boundaryIds[point].observers[row['OBSERVER ID']] = [row['SAMPLING EVENT IDENTIFIER']]
        } else {
          if (boundaryIds[point].observers[row['OBSERVER ID']].indexOf(row['SAMPLING EVENT IDENTIFIER']) <0) {
            boundaryIds[point].observers[row['OBSERVER ID']].push(row['SAMPLING EVENT IDENTIFIER'])
          }
        }
        // Create a spuh section
        if (!isSpecies && boundaryIds[point].spuhs.indexOf(commonName) < 0) {
          boundaryIds[point].spuhs.push(commonName)
        }
      }
      // sort by Lat/Long

      // Delete everything between county code and latitude
      // Match1: US-VT-\d\d\d
      // Match 2: ^(.*)\t^[\t]*\tL\d+.*

      shimmedRows.push(shimData(row))
    })
    .on('error', (e) => {
      console.log('BONK', e)
    })
    .on('end', () => {
      let shim = true
      if (!shim) {
        let totalCount = []
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
          boundaryIds[t].speciesCount = boundaries[t].length
          boundaryIds[t].species = boundaries[t]
          boundaryIds[t].averageChecklistsPerBirder = (boundaryIds[t].checklists/boundaryIds[t].observersCount).toFixed(2)
          boundaryIds[t].averageBirdsOverBirders = (boundaryIds[t].speciesCount/boundaryIds[t].observersCount).toFixed(2)
          boundaryIds[t].averageChecklistsToBirds = (boundaryIds[t].checklists/boundaryIds[t].speciesCount).toFixed(2)
        })
        console.log('Total count: ', _.sum(totalCount))
        console.log('CSV file successfully processed')
        fs.writeFile(`vtRegion-${string}.json`, JSON.stringify(boundaryIds), 'utf8', (err) => {
          if (err)
          console.log(err);
          else {
            console.log("File written successfully.");
          }
        })
      } else {
        fs.writeFile(`results.json`, JSON.stringify(shimmedRows), 'utf8', (err) => {
          if (err)
          console.log(err);
          else {
            console.log("File written successfully.");
          }
        })
      }
      // console.log(JSON.stringify(counties))
      // console.log(boundaryIds)

  })
  return
}