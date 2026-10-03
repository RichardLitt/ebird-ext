import codes from './data/ibpAlphaCodes2021.json' with { type: 'json' }

// NB: When I converted this, I replaced true_alpha with alpha
// {
//   "non_species": "",
//   "alpha": "HITI",
//   "conflict": "",
//   "common_name": "Highland Tinamou",
//   "scientific_name": "Nothocercus bonapartei",
//   "alpha_6": "NOTBON",
//   "conflict_6": ""
// },

codes.push({
  alpha: 'Mandarin Duck',
  common_name: 'Mandarin Duck',
  scientific_name: 'Aix galericulata',
})
codes.push({
  alpha: 'Budgerigar',
  common_name: 'Budgerigar',
  scientific_name: 'Melopsittacus undulatus',
})
codes.push({
  alpha: 'Emu',
  common_name: 'Emu',
  scientific_name: 'Dromaius novaehollandiae',
})
codes.push({
  alpha: 'Golden Pheasant',
  common_name: 'Golden Pheasant',
  scientific_name: 'Chrysolophus pictus',
})
codes.push({
  alpha: 'Bar-headed Goose',
  common_name: 'Bar-headed Goose',
  scientific_name: 'Anser indicus',
})

// Current eBird common name -> the 2021 banding code for the same bird. The
// codes come from the 2021 IBP list, so birds eBird has renamed or split since
// keep their old code; codeToCommonName gives them their current eBird name,
// to match taxonomies/eBird_Taxonomy_VT.json. scripts/updateTaxonomy.js lists
// any Vermont species these tables miss.
const EBIRD_NAME_TO_CODE = {
  // Splits, where Vermont's bird keeps the old code
  'Northern Yellow Warbler': 'YEWA',
  'Hudsonian Whimbrel': 'WHIM',
  'American Herring Gull': 'HERG',
  'American Goshawk': 'NOGO',
  'American Barn Owl': 'BANO',
  'Northern House Wren': 'HOWR',
  'Eastern Warbling Vireo': 'WAVI',
  'Western Cattle-Egret': 'CAEG',
  // Renames
  'Black-crowned Night Heron': 'BCNH',
  'Yellow-crowned Night Heron': 'YCNH',
  // Common and Hoary Redpoll, lumped
  Redpoll: 'CORE'
}

// Vermont species on eBird's sensitive list, which eBird leaves out of the EBD:
// https://support.ebird.org/en/support/solutions/articles/48000803210
// scripts/updateAreaSightings.js carries them forward from the current lists,
// without dates, so they go at the end; the site marks them undated. Hawk Owl,
// Great Gray Owl and Gyrfalcon were only ever in the county lists, which came
// from eBird's bar charts rather than the EBD.
const SENSITIVE_CODES = ['SPGR', 'LEOW', 'NHOW', 'GGOW', 'GYRF']

const CODE_TO_EBIRD_NAME = Object.fromEntries(Object.entries(EBIRD_NAME_TO_CODE).map(([name, code]) => [code, name]))

function isBandingCode (code) {
  return (codes.find(x => x.alpha === code))
}

// The current eBird name for a code
function codeToCommonName (code, log) {
  if (CODE_TO_EBIRD_NAME[code]) return CODE_TO_EBIRD_NAME[code]
  const species = codes.find(x => x.alpha === code)
  if (!species) {
    if (log) {
      console.log(`Error: Unable to find entry for ${code}, returning ${code}.`)
    }
    return code
  }
  return species.common_name
}

function codeToScientificName (code, log) {
  const species = codes.find(x => x.alpha === code)
  if (!species) {
    if (log) {
      console.log(`Error: Unable to find entry for ${code}, returning ${code}.`)
    }
    return code
  }
  return species.scientific_name
}

function commonNameToCode (commonName, log) {
  if (EBIRD_NAME_TO_CODE[commonName]) return EBIRD_NAME_TO_CODE[commonName]
  const species = codes.find(x => {
    return x.common_name.replace(/'/g, '') === commonName.replace(/'/g, '')
  })
  if (!species) {
    if (log) {
      console.log(`Error: Unable to find entry for ${commonName}, returning ${commonName}.`)
    }
    return commonName
  }
  return species.alpha
}

function speciesNameToCode (latin, log) {
  const species = codes.find(x => x.scientific_name === latin)
  if (!species) {
    if (log) {
      console.log(`Error: Unable to find entry for ${latin}, returning ${latin}.`)
    }
    return latin
  }
  return species.alpha
}

function unfurlObjToSpecies (obj) {
  const object = {}
  Object.keys(obj).forEach(area => {
    object[area] = obj[area].map(code => codeToCommonName(code))
  })
  return object
}

// TODO Add tests
// codeToCommonName('BCCH')
// commonNameToCode('Bells Vireo')
// speciesNameToCode('Bucephala clangula')

export {
  EBIRD_NAME_TO_CODE,
  SENSITIVE_CODES,
  codeToCommonName,
  commonNameToCode,
  speciesNameToCode,
  unfurlObjToSpecies,
  codeToScientificName,
  isBandingCode
}
