// Telling species apart from spuhs, slashes, hybrids and domestic types. Kept
// apart from filters.js, which imports the town and region boundaries, so the
// website's maps can use these without downloading the precise boundaries.

import _ from 'lodash'

function removeSpuh (arr, reverse) {
  const newArr = []
  for (const i in arr) {
    if (arr[i]['Scientific Name'] &&
      !arr[i]['Scientific Name'].includes('sp.') &&
      !arr[i]['Scientific Name'].includes(' x ') && // Get rid of hybrids
      !arr[i]['Scientific Name'].includes('hybrid') && // Get rid of Lawrence's and Brewster's Warblers
      !arr[i]['Scientific Name'].includes('Domestic type') && // Get rid of Domestic types
      !arr[i]['Scientific Name'].split(' ').slice(0, 2).join(' ').includes('/') && // No Genus-level splits
      !reverse
      // !arr[i]['Scientific Name'].includes('[') &&
      // !arr[i]['Scientific Name'].match(/.* .* .*/g) &&
      // !arr[i]['Scientific Name'].includes('/')
    ) {
      // Remove subspecies only entries
      // For some reason, simply copying over the field before redefining it doesn't work.
      // Probably due to JavaScript reference errors.
      const specie = arr[i]
      if (specie['Scientific Name'].split(' ').slice(2).length !== 0) {
        arr[i].Subspecies = _.clone(arr[i]['Scientific Name'])
      }
      specie['Scientific Name'] = specie['Scientific Name'].split(' ').slice(0, 2).join(' ')
      newArr.push(specie)
      // } else {
      // Use this to find excluded entries
      // console.log(arr[i]['Scientific Name'])
    } else if (reverse) {
      const specie = arr[i]
      newArr.push(specie)
    }
  }
  return _.uniq(newArr)
}

// The species in each county of countyBarcharts.json, without spuhs, slashes,
// hybrids and domestic types
function removeSpuhFromCounties (countyBarcharts) {
  const newObj = {}
  Object.keys(countyBarcharts).forEach(county => {
    // Copies: removeSpuh rewrites scientific names, and this is shared data
    newObj[county] = removeSpuh(Object.entries(countyBarcharts[county].species).map(([name, species]) => ({ ...species, name })))
      .map(s => s.name)
  })
  return newObj
}

export {
  removeSpuh,
  removeSpuhFromCounties
}
