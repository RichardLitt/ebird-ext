// const fs = require('fs').promises
// const Papa = require('papaparse')
const taxonomy = require('./taxonomies/eBird_Taxonomy_2020_VT.json')

// Testing arrays
// TODO Actually implement a testing framework
// const list = ['House Sparrow', 'Red-tailed Hawk', 'Cattle Egret', 'Canada Goose', 'cheese']
// const listSci = ['Passer domesticus', 'Buteo jamaicensis', 'Vireo sp.', 'Branta canadensis', 'cheese']

function taxonomicSort(list, name = 'common') {
  // Has to be in the same folder
  // Removed, because this file is 2mb and it's frankly unnecessary for Vermont
  // const taxonomyFile = await fs.readFile('eBird_Taxonomy_v2019.csv', 'utf8')
  // const taxonomy = Papa.parse(taxonomyFile, {
  //   header: true
  // }).data

  // Get rid of subspecies in Taxonomic sort
  // TODO Enable subspecies in Taxonomic sort, probably by adding them to eBird_Taxonomy_2020_VT
  list = list.map(species => {
    return species.split(' (')[0]
  })
  const sortedTaxos = taxonomy.map(x => {
   return (name === 'scientific') ? x.SCI_NAME : x.PRIMARY_COM_NAME
  })
  return list.sort((a, b) => sortedTaxos.indexOf(a) - sortedTaxos.indexOf(b))
}

module.exports = taxonomicSort