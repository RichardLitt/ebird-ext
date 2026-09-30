// import fs from 'node:fs/promises'
// import Papa from 'papaparse'
// Uncomment when you need to use taxonomic sort. For now, not included, because React scoops up everything, and it is too big.
// import taxonomy from './taxonomies/eBird-Clements-v2021-integrated-checklist-August-2021.json' with { type: 'json' }
// Note: This only uses Vermont birds, and may have issues with newer ones. (It'll put them at the end.)
import taxonomy from './taxonomies/eBird_Taxonomy_2020_VT.json' with { type: 'json' }

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
  const sortedTaxos = taxonomy.map(x => {
    return (name === 'scientific') ? x.SCI_NAME : x.PRIMARY_COM_NAME
  })
  // Species not in the taxonomy go at the end, in their original order
  const rank = x => {
    const i = sortedTaxos.indexOf(x)
    return i === -1 ? Infinity : i
  }
  return list.sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra === rb ? 0 : ra - rb
  })
}

export default taxonomicSort
