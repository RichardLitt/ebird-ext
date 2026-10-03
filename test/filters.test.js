import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dateFilter,
  completeChecklistFilter,
  locationFilter,
  orderByDate,
  durationFilter,
  createPeriodArray,
  removeSpuh,
  removeSpuhFromCounties,
  pointLookup,
  getPoint,
  getTownCentroids
} from '../filters.js'
import GeoJsonGeometriesLookup from 'geojson-geometries-lookup'
import vtTowns from '../geojson/vt_towns.json' with { type: 'json' }
import vtRegions from '../geojson/Polygon_VT_Biophysical_Regions.json' with { type: 'json' }
import fixture from './fixtures/checklists.js'
import CountyBarcharts from '../data/countyBarcharts.json' with { type: 'json' }

// Many of these functions mutate their input. Each test gets a fresh deep clone.
const clone = () => structuredClone(fixture)

// ===========================================================================
// dateFilter
// ===========================================================================

test('dateFilter { year: 2023 } keeps only 2023 checklists', () => {
  const result = dateFilter(clone(), { year: 2023 })
  assert.equal(result.length, 2)
  assert.ok(result.every(x => x.Date.startsWith('2023')))
})

test('dateFilter with no year/after returns the input unchanged', () => {
  const list = clone()
  const result = dateFilter(list, {})
  assert.equal(result.length, list.length)
})

test('dateFilter { after: "2024-01-01" } keeps only later checklists', () => {
  const result = dateFilter(clone(), { after: '2024-01-01' })
  assert.equal(result.length, 2)
  assert.ok(result.every(x => x.Date >= '2024-01-01'))
})

test('dateFilter { year } accepts both number and string', () => {
  const a = dateFilter(clone(), { year: 2023 })
  const b = dateFilter(clone(), { year: '2023' })
  assert.equal(a.length, b.length)
})

test('dateFilter { after } drops the boundary date itself (strict isAfter)', () => {
  // Fixture has 2023-06-15. after: "2023-06-15" should NOT include it.
  const result = dateFilter(clone(), { after: '2023-06-15' })
  assert.ok(result.every(x => x.Date !== '2023-06-15'))
})

test('dateFilter { year } that matches nothing returns an empty array', () => {
  const result = dateFilter(clone(), { year: 1999 })
  assert.deepEqual(result, [])
})

// ===========================================================================
// completeChecklistFilter
// ===========================================================================

test('completeChecklistFilter { complete: true } drops incomplete checklists', () => {
  const result = completeChecklistFilter(clone(), { complete: true })
  assert.equal(result.length, 3)
  assert.ok(result.every(x => parseInt(x['All Obs Reported']) === 1))
})

test('completeChecklistFilter with no opts returns input unchanged', () => {
  const list = clone()
  const result = completeChecklistFilter(list, {})
  assert.equal(result.length, list.length)
})

test('completeChecklistFilter { noIncidental: true } drops Incidental protocol', () => {
  const result = completeChecklistFilter(clone(), { noIncidental: true })
  assert.ok(result.every(x => x.Protocol !== 'Incidental'))
})

test('completeChecklistFilter { noIncidental: true } drops Historical protocol', () => {
  const list = [...clone(), { Protocol: 'Historical', 'All Obs Reported': 1, Date: '2024-01-01' }]
  const result = completeChecklistFilter(list, { noIncidental: true })
  assert.ok(result.every(x => x.Protocol !== 'Historical'))
})

test('completeChecklistFilter accepts All Obs Reported as string "1"', () => {
  const list = [{ 'All Obs Reported': '1', Protocol: 'Stationary' }]
  const result = completeChecklistFilter(list, { complete: true })
  assert.equal(result.length, 1)
})

// ===========================================================================
// locationFilter
// ===========================================================================

test('locationFilter { state: "Vermont" } keeps only VT checklists', () => {
  const result = locationFilter(clone(), { state: 'Vermont' })
  assert.equal(result.length, 3)
  assert.ok(result.every(x => x.State === 'Vermont'))
  // Point-in-polygon lookup should have populated Town for Vermont records.
  assert.ok(result.every(x => typeof x.Town === 'string' && x.Town.length > 0))
})

test('locationFilter populates Country from State/Province code', () => {
  const result = locationFilter(clone(), { state: 'Vermont' })
  assert.ok(result.every(x => x.Country === 'US'))
})

test('locationFilter populates Region (biophysical) for Vermont checklists', () => {
  const result = locationFilter(clone(), { state: 'Vermont' })
  assert.ok(result.every(x => typeof x.Region === 'string' && x.Region.length > 0))
})

test('locationFilter does not throw on a Vermont checklist with blank coordinates', (t) => {
  t.mock.method(console, 'error', () => {})
  const list = [
    { 'Submission ID': 'S_BLANK', Date: '2024-01-01', 'State/Province': 'US-VT', County: 'Addison', Latitude: '', Longitude: '' }
  ]
  assert.doesNotThrow(() => locationFilter(list, { state: 'Vermont' }))
})

test('locationFilter discards checklists with no Latitude', () => {
  const list = [
    ...clone(),
    { 'Submission ID': 'S_NO_LAT', Date: '2024-01-01', 'State/Province': 'US-VT', County: 'Washington' }
  ]
  const result = locationFilter(list, { state: 'Vermont' })
  assert.ok(result.every(x => x['Submission ID'] !== 'S_NO_LAT'))
})

// ===========================================================================
// orderByDate
// ===========================================================================

test('orderByDate sorts ascending by Date (oldest first)', () => {
  const result = orderByDate(clone())
  for (let i = 1; i < result.length; i++) {
    assert.ok(result[i - 1].Date <= result[i].Date)
  }
})

test('orderByDate on an empty array returns an empty array', () => {
  assert.deepEqual(orderByDate([]), [])
})

test('orderByDate on a single-element array returns it as-is', () => {
  const list = [{ Date: '2024-01-15' }]
  assert.deepEqual(orderByDate(list), list)
})

test('orderByDate handles slash-delimited dates (MyEBirdData format)', () => {
  const list = [
    { Date: '12/31/2023', label: 'a' },
    { Date: '01/01/2024', label: 'b' }
  ]
  const result = orderByDate(list)
  assert.equal(result[0].label, 'a')
  assert.equal(result[1].label, 'b')
})

test('orderByDate is stable for identical dates', () => {
  const list = [
    { Date: '2024-01-15', label: 'a' },
    { Date: '2024-01-15', label: 'b' },
    { Date: '2024-01-15', label: 'c' }
  ]
  const result = orderByDate(list)
  assert.deepEqual(result.map(x => x.label), ['a', 'b', 'c'])
})

// ===========================================================================
// durationFilter
// ===========================================================================

test('durationFilter throws on a duration that is not a number', () => {
  assert.throws(() => durationFilter(clone(), { duration: 'long' }), /must be a number of minutes, not "long"/)
})

test('durationFilter { duration: 30 } keeps checklists >= 30 min', () => {
  const result = durationFilter(clone(), { duration: 30 })
  assert.ok(result.every(x => parseInt(x['Duration (Min)']) >= 30))
})

test('durationFilter { duration: 60 } drops the 30-min and 45-min checklists', () => {
  const result = durationFilter(clone(), { duration: 60 })
  assert.equal(result.length, 1) // only the 60-min checklist remains
})

test('durationFilter is inclusive of the boundary (>= threshold)', () => {
  const list = [{ 'Duration (Min)': 30 }]
  const result = durationFilter(list, { duration: 30 })
  assert.equal(result.length, 1)
})

test('durationFilter with no opts.duration returns input unchanged', () => {
  const list = clone()
  const result = durationFilter(list, {})
  assert.equal(result.length, list.length)
})

test('durationFilter accepts string duration values', () => {
  const list = [{ 'Duration (Min)': '60' }, { 'Duration (Min)': '15' }]
  const result = durationFilter(list, { duration: 30 })
  assert.equal(result.length, 1)
})

test('durationFilter with threshold above all entries returns empty array', () => {
  const result = durationFilter(clone(), { duration: 9999 })
  assert.deepEqual(result, [])
})

// ===========================================================================
// createPeriodArray
// ===========================================================================

test('createPeriodArray returns one entry per input period', () => {
  const grouped = {
    '2024-01': [{ 'Scientific Name': 'Poecile atricapillus' }],
    '2024-02': [{ 'Scientific Name': 'Turdus migratorius' }]
  }
  const result = createPeriodArray(grouped)
  assert.equal(result.length, 2)
})

test('createPeriodArray sets Date to the period key', () => {
  const grouped = { '2024-01': [{ 'Scientific Name': 'Poecile atricapillus' }] }
  const result = createPeriodArray(grouped)
  assert.equal(result[0].Date, '2024-01')
})

test('createPeriodArray counts unique species via SpeciesTotal', () => {
  const grouped = {
    '2024-01': [
      { 'Scientific Name': 'Poecile atricapillus' },
      { 'Scientific Name': 'Poecile atricapillus' }, // duplicate
      { 'Scientific Name': 'Turdus migratorius' }
    ]
  }
  const result = createPeriodArray(grouped)
  assert.equal(result[0].SpeciesTotal, 2)
})

test('createPeriodArray sorts descending by SpeciesTotal', () => {
  const grouped = {
    small: [{ 'Scientific Name': 'Poecile atricapillus' }],
    big: [
      { 'Scientific Name': 'Poecile atricapillus' },
      { 'Scientific Name': 'Turdus migratorius' },
      { 'Scientific Name': 'Spinus tristis' }
    ]
  }
  const result = createPeriodArray(grouped)
  assert.equal(result[0].Date, 'big')
  assert.equal(result[1].Date, 'small')
})

test('createPeriodArray on empty object returns empty array', () => {
  assert.deepEqual(createPeriodArray({}), [])
})

test('createPeriodArray excludes spuhs from SpeciesTotal', () => {
  // SpeciesTotal goes through removeSpuh.
  const grouped = {
    '2024-01': [
      { 'Scientific Name': 'Poecile atricapillus' },
      { 'Scientific Name': 'Anas sp.' } // should be dropped
    ]
  }
  const result = createPeriodArray(grouped)
  assert.equal(result[0].SpeciesTotal, 1)
})

// ===========================================================================
// removeSpuh
// ===========================================================================

test('removeSpuh keeps a clean species record', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Poecile atricapillus' }])
  assert.equal(result.length, 1)
  assert.equal(result[0]['Scientific Name'], 'Poecile atricapillus')
})

test('removeSpuh drops records with "sp." (genus-level spuh)', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Anas sp.' }])
  assert.equal(result.length, 0)
})

test('removeSpuh drops records with " x " (hybrid)', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Common x Barrow Goldeneye' }])
  assert.equal(result.length, 0)
})

test('removeSpuh drops records with "hybrid" keyword (Lawrence\'s Warbler etc)', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Vermivora hybrid' }])
  assert.equal(result.length, 0)
})

test('removeSpuh drops records with "Domestic type"', () => {
  const result = removeSpuh([
    { 'Scientific Name': 'Anas platyrhynchos (Domestic type)' }
  ])
  assert.equal(result.length, 0)
})

test('removeSpuh drops genus-level slashes (Common/Barrow Goldeneye)', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Common/Barrow Goldeneye' }])
  assert.equal(result.length, 0)
})

test('removeSpuh truncates trinomial names to first two words', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Junco hyemalis hyemalis' }])
  assert.equal(result[0]['Scientific Name'], 'Junco hyemalis')
})

test('removeSpuh records the full trinomial in Subspecies', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Junco hyemalis hyemalis' }])
  assert.equal(result[0].Subspecies, 'Junco hyemalis hyemalis')
})

test('removeSpuh does not set Subspecies on a binomial species', () => {
  const result = removeSpuh([{ 'Scientific Name': 'Poecile atricapillus' }])
  assert.equal(result[0].Subspecies, undefined)
})

test('removeSpuh on empty array returns empty array', () => {
  assert.deepEqual(removeSpuh([]), [])
})

test('removeSpuh dedup is reference-based, not content-based', () => {
  // The function uses _.uniq under the hood, which compares objects by
  // reference (SameValueZero). Two distinct objects with identical contents
  // are kept; the same object reference appearing twice is deduped.
  const same = { 'Scientific Name': 'Poecile atricapillus' }
  const deduped = removeSpuh([same, same])
  assert.equal(deduped.length, 1)

  const distinct = removeSpuh([
    { 'Scientific Name': 'Poecile atricapillus' },
    { 'Scientific Name': 'Poecile atricapillus' }
  ])
  assert.equal(distinct.length, 2)
})

test('removeSpuh in reverse mode keeps everything (deduped, no truncation)', () => {
  // The "reverse" flag short-circuits the spuh filter; every input is kept.
  // This is how subspecies() in index.js gathers all identifications.
  const input = [
    { 'Scientific Name': 'Anas sp.' },
    { 'Scientific Name': 'Junco hyemalis hyemalis' },
    { 'Scientific Name': 'Common/Barrow Goldeneye' }
  ]
  const result = removeSpuh(structuredClone(input), true)
  assert.equal(result.length, 3)
  // Truncation does NOT happen in reverse mode.
  assert.equal(result.find(x => x['Scientific Name'].includes('Junco'))['Scientific Name'], 'Junco hyemalis hyemalis')
})

test('removeSpuh skips records with no Scientific Name field', () => {
  const result = removeSpuh([{ 'Common Name': 'Black-capped Chickadee' }])
  assert.equal(result.length, 0)
})

// ===========================================================================
// removeSpuhFromCounties
// ===========================================================================

test('removeSpuhFromCounties returns an object keyed by county', () => {
  const result = removeSpuhFromCounties(CountyBarcharts)
  assert.ok(typeof result === 'object')
  // Vermont has 14 counties.
  assert.ok(Object.keys(result).length > 0)
})

test('removeSpuhFromCounties yields a non-empty species list for Washington county', () => {
  const result = removeSpuhFromCounties(CountyBarcharts)
  assert.ok(Array.isArray(result.Washington))
  assert.ok(result.Washington.length > 0)
})

test('removeSpuhFromCounties uses the counties it is given, and leaves them unchanged', () => {
  const counties = {
    Testshire: { species: { 'Blue Jay': { 'Scientific Name': 'Cyanocitta cristata' }, 'duck sp.': { 'Scientific Name': 'Anatinae sp.' }, 'Dark-eyed Junco (Slate-colored)': { 'Scientific Name': 'Junco hyemalis hyemalis' } } }
  }
  const before = structuredClone(counties)
  assert.deepEqual(removeSpuhFromCounties(counties), { Testshire: ['Blue Jay', 'Dark-eyed Junco (Slate-colored)'] })
  assert.deepEqual(counties, before)
})

test('removeSpuhFromCounties species lists contain no sp./hybrid markers', () => {
  const result = removeSpuhFromCounties(CountyBarcharts)
  // Sample one county and assert no entry retains a spuh marker.
  const sample = result.Washington || Object.values(result)[0]
  assert.ok(!sample.some(name => name.includes('sp.')))
  assert.ok(!sample.some(name => name.includes(' x ')))
})

// ===========================================================================
// pointLookup
// ===========================================================================

const townsLookup = new GeoJsonGeometriesLookup(vtTowns)
const regionsLookup = new GeoJsonGeometriesLookup(vtRegions)

test('pointLookup resolves Burlington from its coordinates', () => {
  const result = pointLookup(vtTowns, townsLookup, { Latitude: 44.4759, Longitude: -73.2121 })
  assert.equal(result, 'BURLINGTON')
})

test('pointLookup resolves Montpelier from its coordinates', () => {
  const result = pointLookup(vtTowns, townsLookup, { Latitude: 44.2601, Longitude: -72.5754 })
  assert.equal(result, 'MONTPELIER')
})

test('pointLookup returns undefined for a point outside any Vermont polygon', () => {
  // Times Square, NY -- not in any VT town polygon.
  const result = pointLookup(vtTowns, townsLookup, { Latitude: 40.7831, Longitude: -73.9712 })
  assert.equal(result, undefined)
})

test('pointLookup accepts a GeoJSON Point shape directly', () => {
  const result = pointLookup(vtTowns, townsLookup, {
    type: 'Point',
    coordinates: [-73.2121, 44.4759]
  })
  assert.equal(result, 'BURLINGTON')
})

test('pointLookup resolves a biophysical region for Burlington coordinates', () => {
  // Burlington sits in the Champlain Valley region.
  const result = pointLookup(vtRegions, regionsLookup, { Latitude: 44.4759, Longitude: -73.2121 })
  assert.equal(result, 'Champlain Valley')
})

// ===========================================================================
// getPoint
// ===========================================================================

test('getPoint("towns", coords) returns the town for a clearly-inside point', () => {
  const result = getPoint('towns', { Latitude: 44.4759, Longitude: -73.2121 }, 7)
  assert.equal(result, 'BURLINGTON')
})

test('getPoint("regions", coords) returns the region for a clearly-inside point', () => {
  const result = getPoint('regions', { Latitude: 44.4759, Longitude: -73.2121 }, 7)
  assert.equal(result, 'Champlain Valley')
})

test('getPoint accepts UPPERCASE LATITUDE/LONGITUDE keys (eBird DB format)', () => {
  const result = getPoint('towns', { LATITUDE: 44.4759, LONGITUDE: -73.2121 }, 7)
  assert.equal(result, 'BURLINGTON')
})

test('getPoint looks up UPPERCASE keys by containment, not the nearest-town fallback', () => {
  // Inside West Haven, whose centroid is in New York, so the fallback finds nothing
  const coordinates = { LATITUDE: '43.6516261', LONGITUDE: '-73.3180830' }
  assert.equal(getPoint('towns', coordinates, 21), 'WEST HAVEN')
  assert.equal(getPoint('regions', coordinates, 21), 'Champlain Valley')
})

test('getPoint returns undefined, without logging an error, when there are no coordinates', (t) => {
  const error = t.mock.method(console, 'error', () => {})
  assert.equal(getPoint('towns', { Latitude: '', Longitude: '' }, 1), undefined)
  assert.equal(getPoint('regions', {}, 1), undefined)
  assert.equal(error.mock.calls.length, 0)
})

test('getPoint falls back to the nearest town anywhere when the county is unknown', () => {
  const result = getPoint('towns', { Latitude: 44.4759, Longitude: -73.50 }, NaN)
  assert.ok(typeof result === 'string' && result.length > 0)
})

test('getPoint falls back to nearest in-county town for a point on a river', () => {
  // Far-offshore point in Lake Champlain near Burlington (county code 7).
  // The initial polygon lookup misses, then nearestPoint fallback uses
  // county centroids to recover a sensible answer.
  const result = getPoint('towns', { Latitude: 44.4759, Longitude: -73.50 }, 7)
  assert.ok(typeof result === 'string' && result.length > 0)
})

// ===========================================================================
// getTownCentroids
// ===========================================================================

test('getTownCentroids() returns one feature per Vermont town', () => {
  const result = getTownCentroids()
  // 256 towns, cities, gores and grants, with Essex Junction (a city since 2022)
  assert.equal(result.length, 256)
})

test('getTownCentroids() puts every centre inside its own town', () => {
  // The bounding-box centre is outside some towns (West Haven's is in New
  // York; Rutland's is in Rutland City, which it surrounds)
  for (const c of getTownCentroids()) {
    const [lng, lat] = c.geometry.coordinates
    assert.equal(getPoint('towns', { Longitude: lng, Latitude: lat }, c.properties.county), c.properties.town)
  }
})

test('the town map has Essex Junction, separate from Essex', () => {
  // Essex Junction village, by its library; Essex town, at Essex Center
  assert.equal(getPoint('towns', { Latitude: 44.4903, Longitude: -73.1129 }, 7), 'ESSEX JUNCTION')
  assert.equal(getPoint('towns', { Latitude: 44.5195, Longitude: -73.0597 }, 7), 'ESSEX')
})

test('getPoint falls back to a town inside Vermont for a point just across the Poultney River', () => {
  // Outside every town polygon; West Haven is the nearest town in Rutland County
  assert.equal(getPoint('towns', { Latitude: 43.5922176, Longitude: -73.3818637 }, 21), 'WEST HAVEN')
})

test('getTownCentroids() centroids carry the town\'s properties', () => {
  const result = getTownCentroids()
  assert.ok(result.every(c => c.properties && c.properties.town))
})

test('getTownCentroids("Burlington") returns a single feature', () => {
  const result = getTownCentroids('Burlington')
  assert.ok(result && result.properties.town === 'BURLINGTON')
})

test('getTownCentroids("West Haven") returns a centroid inside Vermont', () => {
  // Regression for the centerOfMass -> turf.center bug fix in commit b46... :
  // West Haven's center-of-mass lands in New York (the polygon is concave on
  // Lake Champlain). turf.center uses the bounding-box center, which is in VT.
  const result = getTownCentroids('West Haven')
  const [lng, lat] = result.geometry.coordinates
  // West Haven sits roughly at -73.36, 43.62 (southwest Vermont).
  assert.ok(lng > -73.5 && lng < -73.2, `expected lng inside VT, got ${lng}`)
  assert.ok(lat > 43.5 && lat < 43.8, `expected lat inside VT, got ${lat}`)
})

test('getTownCentroids() returns Point Feature geometries', () => {
  const result = getTownCentroids()
  assert.ok(result.every(c => c.geometry && c.geometry.type === 'Point'))
})

test('getTownCentroids returns undefined for an unknown town', () => {
  const result = getTownCentroids('Atlantis')
  assert.equal(result, undefined)
})
