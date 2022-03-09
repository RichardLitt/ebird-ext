// This function reads only the output of town stats.

const data = require('./data/vtTownData.json')
const _ = require('lodash')
const fs = require('fs').promises
const eBird = require('./')

// Data object format
// [
//   'observers',
//   'years',
//   'birdCount',
//   'checklists',
//   'observersCount',
//   'speciesCount',
//   'species',
//   'averageChecklistsPerBirder',
//   'averageBirdsOverBirders',
//   'averageChecklistsToBirds'
// ]

function countTowns (data) {
  console.log(Object.keys(data).length)
}

function speciesCounts (data) {
  const newTowns = []
  Object.keys(data).forEach(x => {
    const town = {}
    town.name = x
    town.speciesCount = data[x].speciesCount
    newTowns.push(town)
  })

  console.log(_.sortBy(newTowns, 'speciesCount').reverse())
}

function observersCount (data) {
  const newTowns = []
  Object.keys(data).forEach(x => {
    const town = {}
    town.name = x
    town.observersCount = data[x].observersCount
    newTowns.push(town)
  })

  console.log(_.sortBy(newTowns, 'observersCount'))//.reverse())
}


function checklistsCount (data) {
  const newTowns = []
  Object.keys(data).forEach(x => {
    const town = {}
    town.name = x
    town.checklists = data[x].checklists
    newTowns.push(town)
  })

  console.log(_.sortBy(newTowns, 'checklists').reverse())
}


function yearsCount (data) {
  const newTowns = []
  Object.keys(data).forEach(x => {
    const town = {}
    town.name = x
    town.years = data[x].years.sort((a, b) => a - b)
    newTowns.push(town)
  })

  let town = _.sortBy(newTowns, x => x.years.length).slice(0,4)
  console.log(town)
  // console.log(town[0].years)
}

function birdsNotInBaltimore (data) {
  console.log(data.BALTIMORE)
}

function averageTownBirds (data) {
  let average = 0
  _.forEach(data, x => average += x.speciesCount)
  console.log(average/255)
}

async function findIntersection (data) {
  const townLists = []
  Object.keys(data).map(town => townLists.push(data[town].species))
  const intersection = _.intersection(...townLists)
  // console.log(intersection)
  return intersection
}

// Note - note the same as f.removeSpuh
function removeSpuh (arr, reverse) {
  const newArr = []
  for (var i in arr) {
    if (arr[i] &&
      !arr[i].includes('sp.') &&
      !arr[i].includes(' x ') && // Get rid of hybrids
      !arr[i].includes('hybrids') && // Get rid of Lawrence's and Brewster's Warblers
      !arr[i].includes('Domestic type') && // Get rid of Domestic types
      !arr[i].split(' ').slice(0, 2).join(' ').includes('/') && // No Genus-level splits
      !reverse
      // !arr[i].includes('[') &&
      // !arr[i].match(/.* .* .*/g) &&
      // !arr[i].includes('/')
    ) {
      // Remove subspecies only entries
      // For some reason, simply copying over the field before redefining it doesn't work.
      // Probably due to JavaScript reference errors.
      const specie = arr[i]
      newArr.push(specie)
      // } else {
      // Use this to find excluded entries
      // console.log(arr[i])
    } else if (reverse) {
      const specie = arr[i]
      newArr.push(specie)
    }
  }
  return _.uniq(newArr)
}

function findWithoutBird(data) {
  let count = 0
  Object.keys(data).forEach(town => {
    if (!data[town].species.includes('Canada Goose')) {
      console.log(town)
      count++
    }
  })
  console.log(count)
}

// TODO Don't save full species name, save alphacodes instead

async function createDataset (data) {
  // Instead of saving Blue Jay in each town, remove all species which are in all towns into their own key
  // const intersection = await findIntersection(data)
  const towns = {}
  Object.keys(data).forEach(town => {
    // const species  = _.difference(removeSpuh(data[town].species), intersection)
    towns[town] = data[town].species
  })
  // towns.intersection = intersection
  // let intersection = _.intersection(...townLists)
  // console.log(towns)
  fs.writeFile('regionData.json', JSON.stringify(towns), 'utf-8')
}

async function readData () {
  // speciesCounts(data)
  // countTowns(data)
  // birdsNotInBaltimore(data)
  // averageTownBirds(data)
  // observersCount(data)
  // checklistsCount(data)
  // yearsCount(data)
  await createDataset(data)
  // findWithoutBird(data)
}

readData()
