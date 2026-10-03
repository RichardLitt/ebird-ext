// Species lists for taxonomicSort tests.
//
// Each list is in eBird 2025 taxonomic order as it appears in
// taxonomies/eBird_Taxonomy_VT.json. The index in that file is noted
// next to each entry so the ordering is easy to audit.

export const commonInOrder = [
  'Snow Goose', // 3
  'Canada Goose', // 14
  'Mallard', // 34
  'Western Cattle-Egret', // 209
  'Red-tailed Hawk', // 227
  'Blue Jay', // 289
  'House Sparrow' // 335
]

export const scientificInOrder = [
  'Branta canadensis', // 14 (Canada Goose)
  'Ardea ibis', // 209 (Western Cattle-Egret)
  'Buteo jamaicensis', // 227 (Red-tailed Hawk)
  'Vireo olivaceus', // 285 (Red-eyed Vireo)
  'Passer domesticus' // 335 (House Sparrow)
]

// Strings that are not present in the taxonomy under either naming scheme.
export const unknowns = ['cheese', 'Dodo', 'Not A Bird', 'zzz']
