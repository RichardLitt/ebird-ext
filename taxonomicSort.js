// const fs = require('fs').promises
// const Papa = require('papaparse')
// Uncomment when you need to use taxonomic sort. For now, not included, because React scoops up everything, and it is too big.
// const taxonomy = require('./taxonomies/eBird-Clements-v2021-integrated-checklist-August-2021.json')

// Testing arrays
// TODO Actually implement a testing framework
// const list = ['House Sparrow', 'Red-tailed Hawk', 'Cattle Egret', 'Canada Goose', 'cheese']
// const listSci = ['Passer domesticus', 'Buteo jamaicensis', 'Vireo sp.', 'Branta canadensis', 'cheese']

// Note - This only needs to be done once, on each new download of the updated checklist. This will create the new
// json file that you can use. Note that this file is massive - it is for the entire world, not just for Vermont.
// async function createTaxonomyJSON () {
//   const taxonomyFile = await fs.readFile('../taxonomies/eBird-Clements-v2021-integrated-checklist-August-2021.csv', 'utf8')
//   const taxonomy = Papa.parse(taxonomyFile, {
//     header: true
//   }).data
//   return fs.writeFile('eBird-Clements-v2021-integrated-checklist-August-2021.json', JSON.stringify(taxonomy), 'utf8')
// }

// TODO Make a new sort for 2022 from the Clements and from the Vermont species list

function taxonomicSort (list, name = 'common') {
  console.log('Not sorting, due to space issues with React!')
  // const sortedTaxos = taxonomy.map(x => {
  //   return (name === 'scientific') ? x['scientific name'] : x['English name']
  // })
  // return list.sort((a, b) => sortedTaxos.indexOf(a) - sortedTaxos.indexOf(b))
}

module.exports = taxonomicSort
