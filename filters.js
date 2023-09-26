const Town_boundaries = require('./geojson/vt_towns.json')
const Vermont_regions = require('./geojson/Polygon_VT_Biophysical_Regions.json')
const CountyBarcharts = require('./data/countyBarcharts.json')
const GeoJsonGeometriesLookup = require('geojson-geometries-lookup')
const vermontTowns = new GeoJsonGeometriesLookup(Town_boundaries)
const vermontRegions = new GeoJsonGeometriesLookup(Vermont_regions)
const _ = require('lodash')
const moment = require('moment')
const provinces = require('provinces')
const helpers = require('./helpers')
const nearestPoint = require('@turf/nearest-point')
const turf = require('turf')
const centerOfMass = require('@turf/center-of-mass')

// Why eBird uses this format I have no idea.
const eBirdCountyIds = {
  1: 'Addison',
  3: 'Bennington',
  5: 'Caledonia',
  7: 'Chittenden',
  9: 'Essex',
  11: 'Franklin',
  13: 'Grand Isle',
  15: 'Lamoille',
  17: 'Orange',
  19: 'Orleans',
  21: 'Rutland',
  23: 'Washington',
  25: 'Windham',
  27: 'Windsor'
}

// Used more than once.
const townCentroids = getTownCentroids()

// Defaults to all
function getTownCentroids (town) {
  const centers = Town_boundaries.features.map(feature => {
    let center
    // This center of West Haven is in New York.
    if (feature.properties.town === 'West Haven'.toUpperCase()) {
      center = centerOfMass.default(feature)
      // TODO Unfortunately, the enclaves are broken. All Rutland counts are in Rutland City.
    } else if (feature.properties.town.includes('Rutland'.toUpperCase())) {
      center = turf.center(feature)
      // console.log(feature.properties.town, center.geometry.coordinates.reverse())
    } else {
      center = turf.center(feature)
    }
    center.properties = feature.properties
    return center
  })
  if (town) {
    return centers.find(c => c.properties.town === town.toUpperCase())
  } else {
    return centers
  }
}

// map: 'towns' || 'regions'
// coordinates: {
//   Longitude: row.LONGITUDE,
//   Latitude: row.LATITUDE
// }
// countyCode: 023
function getPoint (map, coordinates, countyCode) {
  function getContainer (map, coordinates) {
    let point
    if (map === 'towns') {
      point = pointLookup(Town_boundaries, vermontTowns, coordinates)
    } else if (map === 'regions') {
      point = pointLookup(Vermont_regions, vermontRegions, coordinates)
    }
    return point
  }

  let point = getContainer(map, coordinates)

  // If it is on a river or across a border or something, get the nearest town
  if (point === undefined) {
    // Only check towns in the relevant county
    // TODO What if I don't have the relevant county?
    const countyCenters = townCentroids.filter(f => f.properties.county === countyCode)
    const newCoords = nearestPoint.default(turf.point([coordinates.LONGITUDE, coordinates.LATITUDE]), turf.featureCollection(countyCenters))
    coordinates = {
      Longitude: newCoords.geometry.coordinates[0],
      Latitude: newCoords.geometry.coordinates[1]
    }
    point = getContainer(map, coordinates)
    // console.log('Previously undefined point:', point)
  }
  return point
}

function pointLookup (geojson, geojsonLookup, data) {
  // Shim input
  let point
  if (data.type === 'Point') {
    point = data
  } else {
    point = { type: 'Point', coordinates: [data.Longitude, data.Latitude] }
  }
  // TODO Add a fallback if it fails
  const containerArea = geojsonLookup.getContainers(point)
  if (containerArea.features[0]) {
    const props = containerArea.features[0].properties
    return (props.town) ? props.town : props.name
  }
}

function locationFilter (list, opts) {
  const filterList = ['Country', 'State', 'Region', 'County', 'Town']
  const intersection = _.intersection(Object.keys(opts).map(x => helpers.capitalizeFirstLetters(x)), filterList)

  return list.filter(checklist => {
    if (!checklist.Latitude) {
      // Some audio records appear to be totally empty locationalls
      if (opts.verbose) {
        console.log(`Checklist discarded: ${checklist['eBird Checklist URL']}.`)
      }
      return false
    }
    if (!checklist.State) {
      const [country, state] = checklist['State/Province'].split('-')
      if (state === 'VT') { // Just to speed things up a bit
        checklist.State = 'Vermont'
      } else if (['US', 'CA'].includes(country)) { // Enable for others
        if (_.findIndex(provinces, { short: state }) !== -1) { // Note that this file is larger than needed, and has more countries
          checklist.State = provinces[_.findIndex(provinces, { short: state })].name
        }
      } else {
        checklist.State = state
      }
      checklist.Country = country
    }
    if (checklist.State === 'Vermont') {
      // This option takes 25 seconds to do, every time, on my data
      let point
      checklist.Region = pointLookup(Vermont_regions, vermontRegions, checklist)
      checklist.Town = pointLookup(Town_boundaries, vermontTowns, checklist)

      // These should only apply to literal edge cases
      if (!checklist.Town) {
        point = getPoint('towns', {
          Longitude: checklist.Longitude,
          Latitude: checklist.Latitude
          // This is ugly but it should work.
        }, Number(Object.keys(eBirdCountyIds).filter(key => eBirdCountyIds[key] === checklist.County)[0]))
        checklist.Town = helpers.capitalizeFirstLetters(point)
      }
      if (!checklist.Region) {
        point = getPoint('regions', {
          Longitude: checklist.Longitude,
          Latitude: checklist.Latitude
          // This is ugly but it should work.
        }, Number(Object.keys(eBirdCountyIds).filter(key => eBirdCountyIds[key] === checklist.County)[0]))
        checklist.Region = helpers.capitalizeFirstLetters(point)
      }
    }

    return intersection.every(filter => {
      // console.log(filter.toLowerCase(), opts)
      if (Array.isArray(opts[filter.toLowerCase()])) {
        // console.log(opts[filter.toLowerCase()])
        const test = opts[filter.toLowerCase()].find(x => {
          // console.log(opts, filter, checklist)
          return opts[filter.toLowerCase()].map(y => y.toLowerCase()).includes(checklist[filter].toLowerCase())
        })
        return !!(test)
      } else {
        if (opts[filter.toLowerCase()] && checklist[filter]) {
          // console.log(checklist, filter)
          // TODO This should also work for Arrays, I guess
          return checklist[filter].toLowerCase() === opts[filter.toLowerCase()].toLowerCase()
        }
      }

      return false
    })
  })
}

function dateFilter (list, opts) {
  // Currently not documented
  if (opts.after) {
    return list.filter(x => {
      return moment(x.Date, helpers.momentFormat(x.Date)).isAfter(moment(opts.after))
    })
  }

  // TODO Make month and day work
  if (!opts.year) {
    return list
  }
  return list.filter(x => {
    return moment(x.Date, helpers.momentFormat(x.Date)).format('YYYY') === opts.year.toString()
  })
}

function durationFilter (list, opts) {
  if (opts.duration && !parseInt(opts.duration)) {
    console.log('Duration filter not a number!')
    process.exit(1)
  }
  return (opts.duration) ? list.filter(x => parseInt(x['Duration (Min)']) >= opts.duration) : list
}

function completeChecklistFilter (list, opts) {
  // This isn't as clear cut as it should be. There are other non-complete formats: Historical, etc.
  list = (opts.noIncidental) ? list.filter(x => !['Incidental', 'Historical'].includes(x.Protocol)) : list
  list = (opts.complete) ? list.filter(x => [1, '1'].includes(parseInt(x['All Obs Reported']))) : list
  return list
}

function orderByDate (arr) {
  return _.orderBy(arr, (e) => moment(e.Date, helpers.momentFormat(e.Date)).format())
}

function createPeriodArray (data) {
  const periodArray = []
  for (const period in data) {
    periodArray.push({
      Date: period,
      SpeciesTotal: removeSpuh(_.uniqBy(data[period], 'Scientific Name')).length,
      Species: removeSpuh(_.uniqBy(data[period], 'Scientific Name'))
    })
  }
  return _.sortBy(periodArray, 'SpeciesTotal').reverse()
}

function removeSpuh (arr, reverse) {
  const newArr = []
  for (var i in arr) {
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

function removeSpuhFromCounties (countyBarcharts) {
  const newObj = {}
  Object.keys(CountyBarcharts).forEach(county => {
    newObj[county] = removeSpuh(Object.keys(CountyBarcharts[county].species).map(s => {
      const species = CountyBarcharts[county].species[s]
      // ES6 probably has a better way of doing this.
      species.name = s
      return species
    })).map(s => s.name)
  })
  return newObj
}

module.exports = {
  orderByDate,
  durationFilter,
  completeChecklistFilter,
  dateFilter,
  createPeriodArray,
  locationFilter,
  removeSpuh,
  removeSpuhFromCounties,
  pointLookup,
  getPoint,
  getTownCentroids
}
