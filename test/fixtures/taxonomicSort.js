// Species lists for taxonomicSort tests.
//
// Each list is in eBird 2020 taxonomic order as it appears in
// taxonomies/eBird_Taxonomy_2020_VT.json. The index in that file is noted
// next to each entry so the ordering is easy to audit.

export const commonInOrder = [
  'Snow Goose', // 2
  'Canada Goose', // 14
  'Mallard', // 37
  'Cattle Egret', // 244
  'Red-tailed Hawk', // 270
  'Blue Jay', // 348
  'House Sparrow' // 407
]

export const scientificInOrder = [
  'Branta canadensis', // 14 (Canada Goose)
  'Bubulcus ibis', // 244 (Cattle Egret)
  'Buteo jamaicensis', // 270 (Red-tailed Hawk)
  'Vireo sp.', // 343
  'Passer domesticus' // 407 (House Sparrow)
]

// Strings that are not present in the taxonomy under either naming scheme.
export const unknowns = ['cheese', 'Dodo', 'Not A Bird', 'zzz']
