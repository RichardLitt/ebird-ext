const codes = require('./data/ibpAlphaCodes2021.json')

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
  "alpha": "Mandarin Duck",
  "common_name": "Mandarin Duck",
  "scientific_name": "Aix galericulata",
})
codes.push({
  "alpha": "Budgerigar",
  "common_name": "Budgerigar",
  "scientific_name": "Melopsittacus undulatus",
})
codes.push({
  "alpha": "Emu",
  "common_name": "Emu",
  "scientific_name": "Dromaius novaehollandiae",
})
codes.push({
  "alpha": "Golden Pheasant",
  "common_name": "Golden Pheasant",
  "scientific_name": "Chrysolophus pictus",
})
codes.push({
  "alpha": "Bar-headed Goose",
  "common_name": "Bar-headed Goose",
  "scientific_name": "Anser indicus",
})

function codeToCommonName (code) {
  const species = codes.find(x => x.alpha === code)
  if (!species) {
    console.log(`Error: Unable to find entry for ${code}, returning ${code}.`)
    return code
  }
  return species.common_name
}

function commonNameToCode (commonName) {
  const species = codes.find(x => {
    return x.common_name.replace(/'/g, '') === commonName.replace(/'/g, '')
  })
  if (!species) {
    console.log(`Error: Unable to find entry for ${commonName}, returning ${commonName}.`)
    return commonName
  }
  return species.alpha
}

function speciesNameToCode (latin) {
  const species = codes.find(x => x.scientific_name === latin)
  if (!species) {
    console.log(`Error: Unable to find entry for ${latin}, returning ${latin}.`)
    return latin
  }
  return species.alpha
}

// TODO Add tests
// codeToCommonName('BCCH')
// commonNameToCode('Bells Vireo')
// speciesNameToCode('Bucephala clangula')

module.exports = {
  codeToCommonName,
  commonNameToCode,
  speciesNameToCode
}