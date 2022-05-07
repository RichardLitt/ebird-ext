const fs = require('fs')
const banding = require('../bandingCodes')
const helpers = require('../helpers')

let files

const areas = process.argv[2]

// Easier to just hardcode than figure this out.
if (areas === 'towns') {
  files = [
    require('./vtTown-001.json'),
    require('./vtTown-003.json'),
    require('./vtTown-005.json'),
    require('./vtTown-007.json'),
    require('./vtTown-009.json'),
    require('./vtTown-011.json'),
    require('./vtTown-013.json'),
    require('./vtTown-015.json'),
    require('./vtTown-017.json'),
    require('./vtTown-019.json'),
    require('./vtTown-021.json'),
    require('./vtTown-023.json'),
    require('./vtTown-025.json'),
    require('./vtTown-027.json')
  ]
} else if (areas === 'regions') {
  files = [
    require('./vtRegions-001.json'),
    require('./vtRegions-003.json'),
    require('./vtRegions-005.json'),
    require('./vtRegions-007.json'),
    require('./vtRegions-009.json'),
    require('./vtRegions-011.json'),
    require('./vtRegions-013.json'),
    require('./vtRegions-015.json'),
    require('./vtRegions-017.json'),
    require('./vtRegions-019.json'),
    require('./vtRegions-021.json'),
    require('./vtRegions-023.json'),
    require('./vtRegions-025.json'),
    require('./vtRegions-027.json')
  ]
}

const newFile = {}

files.forEach(file => {
  Object.keys(file).forEach(town => {
    if (!newFile[town]) {
      newFile[town] = file[town]
    } else {
      newFile[town].spuhs = [...new Set(newFile[town].spuhs.concat(file[town].spuhs))]
      newFile[town].years = [...new Set(newFile[town].years.concat(file[town].years))]
      newFile[town].species = [...new Set(newFile[town].species.concat(file[town].species))]
      newFile[town].birdCount = newFile[town].birdCount += file[town].birdCount
      newFile[town].checklists = newFile[town].checklists += file[town].checklists
      newFile[town].observersCount = newFile[town].observersCount += file[town].observersCount
      newFile[town].speciesCount = newFile[town].speciesCount += file[town].speciesCount
      // We don't need these if we are joining them all together,because it messes everything up
    }
    delete newFile[town].averageChecklistsPerBirder
    delete newFile[town].averageBirdsOverBirders
    delete newFile[town].averageChecklistsToBirds
  })
})

const townSightings = {}
Object.keys(newFile).forEach(town => {
  townSightings[town] = newFile[town].species.map(species => banding.commonNameToCode(species))
})

// // Not used at the moment. Could be.
// const getTownIntersection = _.flow(
//   _.values, // get the arrays
//   _.spread(_.intersection) // spread into intersection
// )
// const townIntersection = getTownIntersection(townSightings)

// TODO Shouldn't modify state
fs.writeFile(`../data/${helpers.capitalizeFirstLetters(areas)}Sightings.json`, JSON.stringify(townSightings), (e) => {
  if (e) {
    console.log(e)
  } else {
    console.log(`Successfully wrote to ${helpers.capitalizeFirstLetters(areas)}Sightings.json.`)
  }
})

fs.writeFile(`./vt${helpers.capitalizeFirstLetters(areas)}Data.json`, JSON.stringify(newFile), (e) => {
  if (e) {
    console.log(e)
  } else {
    console.log(`Successfully wrote to ./vt${helpers.capitalizeFirstLetters(areas)}Data.json.`)
  }
})
