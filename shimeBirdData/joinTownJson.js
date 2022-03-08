const fs = require('fs')
const banding = require('../bandingCodes')

const files = [
  require('./vtRegion-001.json'),
  require('./vtRegion-003.json'),
  require('./vtRegion-005.json'),
  require('./vtRegion-007.json'),
  require('./vtRegion-009.json'),
  require('./vtRegion-011.json'),
  require('./vtRegion-013.json'),
  require('./vtRegion-015.json'),
  require('./vtRegion-017.json'),
  require('./vtRegion-019.json'),
  require('./vtRegion-021.json'),
  require('./vtRegion-023.json'),
  require('./vtRegion-025.json'),
  require('./vtRegion-027.json')
]

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

fs.writeFile('../data/townsightings.json', JSON.stringify(townSightings), (e) => {
  if (e) {
    console.log(e)
  } else {
    console.log('Successfully wrote to townsightings.json.')
  }
})

fs.writeFile('./vtTownData.json', JSON.stringify(newFile), (e) => {
  if (e) {
    console.log(e)
  } else {
    console.log('Successfully wrote to vtTownData.json.')
  }
})
