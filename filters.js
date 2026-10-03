import townBoundaries from './geojson/vt_towns.json' with { type: 'json' }
import vermontRegionsGeojson from './geojson/Polygon_VT_Biophysical_Regions.json' with { type: 'json' }
import GeoJsonGeometriesLookup from 'geojson-geometries-lookup'
const vermontTowns = new GeoJsonGeometriesLookup(townBoundaries)
const vermontRegions = new GeoJsonGeometriesLookup(vermontRegionsGeojson)
import _ from 'lodash'
import moment from 'moment'
import provinces from 'provinces'
import * as helpers from './helpers.js'
// Re-exported below; they live in spuh.js, which the site can import without
// this file's town and region boundaries
import { removeSpuh, removeSpuhFromCounties } from './spuh.js'
import nearestPoint from '@turf/nearest-point'
import turfCenter from '@turf/center'
import { point as turfPoint, featureCollection } from '@turf/helpers'

// Used more than once.
const townCentroids = getTownCentroids()

// A point inside a town: the centre of its bounding box if that's inside,
// otherwise the middle of the widest stretch of town along a line of latitude
// through it. The plain centre lies outside some towns (West Haven's is in New
// York; Rutland's is in Rutland City, which it surrounds), and the
// nearest-town fallback in getPoint needs a point that is in the town.
function interiorPoint (feature) {
  const center = turfCenter(feature).geometry.coordinates
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  // Crossings of a line of latitude with every ring: between pairs of
  // crossings is inside (holes included), by the even-odd rule
  const crossings = (polygon, lat) => polygon.flatMap(ring => ring.slice(1).flatMap((b, i) => {
    const a = ring[i]
    return (a[1] > lat) !== (b[1] > lat) ? [a[0] + (lat - a[1]) * (b[0] - a[0]) / (b[1] - a[1])] : []
  })).sort((x, y) => x - y)
  const inside = ([lng, lat]) => polygons.some(polygon => crossings(polygon, lat).filter(x => x < lng).length % 2 === 1)
  if (inside(center)) return center

  const lats = polygons.flat(2).map(c => c[1])
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  // Try the centre's latitude first, then lines further from it
  const steps = [0, ...Array.from({ length: 20 }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil((i + 1) / 2) / 21)]
  for (const step of steps) {
    const lat = center[1] + step * (north - south)
    let best
    for (const polygon of polygons) {
      const xs = crossings(polygon, lat)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]]
      }
    }
    if (best) return [(best[0] + best[1]) / 2, lat]
  }
  return center
}

// Defaults to all
function getTownCentroids (town) {
  const centers = townBoundaries.features.map(feature => turfPoint(interiorPoint(feature), feature.properties))
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
      point = pointLookup(townBoundaries, vermontTowns, coordinates)
    } else if (map === 'regions') {
      point = pointLookup(vermontRegionsGeojson, vermontRegions, coordinates)
    }
    return point
  }

  let point = getContainer(map, coordinates)

  const long = Number(coordinates.LONGITUDE || coordinates.Longitude)
  const lat = Number(coordinates.LATITUDE || coordinates.Latitude)

  // If it is on a river or across a border or something, get the nearest town.
  // Without coordinates there is nothing to measure from, so leave it unplaced.
  if (point === undefined && Number.isFinite(long) && Number.isFinite(lat) && (long || lat)) {
    try {
      // Only check towns in the relevant county, or every town if the county is unknown
      const inCounty = townCentroids.filter(f => f.properties.county === countyCode)
      const countyCenters = inCounty.length ? inCounty : townCentroids
      const newCoords = nearestPoint(turfPoint([long, lat]), featureCollection(countyCenters))
      coordinates = {
        Longitude: newCoords.geometry.coordinates[0],
        Latitude: newCoords.geometry.coordinates[1]
      }
      point = getContainer(map, coordinates)
      // console.log('Previously undefined point:', point);
    } catch (error) {
      console.error('Error occurred while processing newCoords:', error)
      // You can handle the error or just log it, as done above.
      // The script will continue to run even if this block throws an error.
    }
  }
  return point
}

function pointLookup (geojson, geojsonLookup, data) {
  // Shim input
  let point
  if (data.type === 'Point') {
    point = data
  } else {
    // MyEBirdData spells these Longitude/Latitude, the EBD LONGITUDE/LATITUDE
    point = { type: 'Point', coordinates: [Number(data.Longitude ?? data.LONGITUDE), Number(data.Latitude ?? data.LATITUDE)] }
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
      checklist.Region = pointLookup(vermontRegionsGeojson, vermontRegions, checklist)
      checklist.Town = pointLookup(townBoundaries, vermontTowns, checklist)

      // These should only apply to literal edge cases
      if (!checklist.Town) {
        point = getPoint('towns', {
          Longitude: checklist.Longitude,
          Latitude: checklist.Latitude
          // This is ugly but it should work.
        }, Number(Object.keys(helpers.eBirdCountyIds).filter(key => helpers.eBirdCountyIds[key] === checklist.County)[0]))
        // Upper case, to match the geojson town keys that every caller compares against
        checklist.Town = point?.toUpperCase()
      }
      if (!checklist.Region) {
        point = getPoint('regions', {
          Longitude: checklist.Longitude,
          Latitude: checklist.Latitude
          // This is ugly but it should work.
        }, Number(Object.keys(helpers.eBirdCountyIds).filter(key => helpers.eBirdCountyIds[key] === checklist.County)[0]))
        checklist.Region = point && helpers.capitalizeFirstLetters(point)
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
    throw new Error(`The duration filter must be a number of minutes, not "${opts.duration}".`)
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

export {
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
