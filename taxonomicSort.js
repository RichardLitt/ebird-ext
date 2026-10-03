// Vermont's species, in eBird's taxonomic order (scripts/updateTaxonomy.js).
// Names not in it go at the end.
import taxonomy from './taxonomies/eBird_Taxonomy_VT.json' with { type: 'json' }

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
