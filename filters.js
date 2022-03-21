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

function pointLookup (geojson, geojsonLookup, data) {
  let point
  if (data.type === 'Point') {
    point = data
  } else {
    point = { type: 'Point', coordinates: [data.Longitude, data.Latitude] }
  }
  const containerArea = geojsonLookup.getContainers(point)
  if (containerArea.features[0]) {
    const props = containerArea.features[0].properties
    return (props.town) ? props.town : props.name
  }
  // Seems to be an issue for two points in my dataset
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
      }
      checklist.Country = country
    }
    if (checklist.State === 'Vermont') {
      // This option takes 25 seconds to do, every time, on my data
      // Might be worth just not including.
      // TODO Why I need default here but nowhere else I have no idea.
      const point = pointLookup(Vermont_regions, vermontRegions, checklist)
      checklist.Region = point

      // This one takes 3.5 seconds
      checklist.Town = pointLookup(Town_boundaries, vermontTowns, checklist)
      // This should work, but it don't. Not ideal.
      if (!checklist.Town) {
        console.log(checklist)
      }
    }

    return intersection.every(filter => {
      if (opts[filter.toLowerCase()] && checklist[filter]) {
        return checklist[filter].toLowerCase() === opts[filter.toLowerCase()].toLowerCase()
      }
      return false
    })
  })
}

function dateFilter (list, opts) {
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
  return (opts.complete) ? list.filter(x => parseInt(x['All Obs Reported']) === 1) : list
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
  pointLookup
}
