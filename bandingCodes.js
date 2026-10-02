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
// codes follow the 2021 taxonomy, and the website compares lists with an
// older Vermont taxonomy, so birds eBird has renamed since keep their old code.
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

function isBandingCode (code) {
  return (codes.find(x => x.alpha === code))
}

function codeToCommonName (code, log) {
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
  codeToCommonName,
  commonNameToCode,
  speciesNameToCode,
  unfurlObjToSpecies,
  codeToScientificName,
  isBandingCode
}
