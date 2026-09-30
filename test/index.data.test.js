import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  vt251,
  getData,
  countUniqueSpecies,
  getAllTowns,
  checklists,
  getLastDate,
  countTheBirds,
  datesSpeciesObserved
} from '../index.js'
import vtTowns from '../geojson/vt_towns.json' with { type: 'json' }
import townDataFor2022 from '../data/townDataFor2022-May-Export.json' with { type: 'json' }

// Tests for the data-loading and small utility functions in index.js.
//
// Most of these take `opts.input`, a path to an eBird "My eBird Data" CSV,
// which getData() parses with Papa (header: true) and then runs through
// filters.removeSpuh(). That means every CSV-driven function below silently
// drops spuhs ("gull sp."), slashes ("Alder/Willow Flycatcher"), hybrids and
// Domestic types, and trims trinomials down to the binomial (keeping the
// original in a new `Subspecies` field). The exceptions are checklists and
// countTheBirds, which call getData(input, { keepSpuh: true }) so that
// spuh-only checklists and spuh individuals are counted.
//
// Fixtures live in test/fixtures/index-data/ and use invented submission IDs
// and locations. Coordinates are town centres chosen to land inside the
// Burlington, Montpelier and Rutland City polygons in geojson/vt_towns.json,
// plus one point in New York.
//
// Not covered here: cleanCommonName, getSpeciesObjGivenName and
// getCountyForTown are not exported from index.js, so they can't be tested
// without changing production code.

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'index-data')
const fixture = (name) => path.join(FIXTURES, name)

const BASIC = fixture('basic.csv')
const DATES = fixture('dates.csv')
const VT251 = fixture('vt251.csv')
const SLASH_DATES = fixture('slash-dates.csv')
const HEADER_ONLY = fixture('header-only.csv')
const NO_SCI_NAME = fixture('no-scientific-name.csv')

const HEADER = 'Submission ID,Common Name,Scientific Name,Count,State/Province,County,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported'

// Write a throwaway CSV to os.tmpdir() and return its path. The caller's test
// context removes it when the test finishes.
async function tmpCsv (t, content) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-index-data-'))
  t.after(() => fsp.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'MyEBirdData.csv')
  await fsp.writeFile(file, content, 'utf8')
  return file
}

// A minimal in-memory row, as getData would produce it.
const row = (sci, date, extra = {}) => ({ 'Scientific Name': sci, 'Common Name': sci, Date: date, ...extra })

// Silence console.log and return the mock so calls can be inspected.
const muteLog = (t) => t.mock.method(console, 'log', () => {})

// Pin "now" so functions that call moment() are deterministic. Local-time
// noon avoids any timezone rollover.
const freezeNow = (t, y, m, d) => t.mock.timers.enable({ apis: ['Date'], now: new Date(y, m - 1, d, 12) })

// ===========================================================================
// getData
// ===========================================================================

test('getData parses a CSV into an array of row objects keyed by header', async () => {
  const data = await getData(BASIC)
  assert.ok(Array.isArray(data))
  assert.equal(data[0]['Submission ID'], 'S900000001')
  assert.equal(data[0]['Common Name'], 'American Robin')
  assert.equal(data[0].Date, '2022-05-01')
})

test('getData leaves every value as a string (no dynamic typing)', async () => {
  const [first] = await getData(BASIC)
  assert.equal(first.Count, '3')
  assert.equal(first.Latitude, '44.4759')
  assert.equal(first['Duration (Min)'], '30')
  assert.equal(first['All Obs Reported'], '1')
})

test('getData drops spuh, slash and hybrid rows', async () => {
  const data = await getData(BASIC)
  // 15 data rows: 2x "gull sp.", 1 slash, 1 hybrid removed.
  assert.equal(data.length, 11)
  const sci = data.map(x => x['Scientific Name'])
  assert.ok(!sci.includes('Larinae sp.'))
  assert.ok(!sci.some(s => s.includes('/')))
  assert.ok(!sci.some(s => s.includes(' x ')))
})

test('getData trims a trinomial to the binomial and keeps the original in Subspecies', async () => {
  const data = await getData(BASIC)
  const pigeon = data.find(x => x['Common Name'] === 'Rock Pigeon (Feral Pigeon)')
  assert.equal(pigeon['Scientific Name'], 'Columba livia')
  assert.equal(pigeon.Subspecies, 'Columba livia (Feral Pigeon)')
})

test('getData does not add a Subspecies field to plain binomials', async () => {
  const data = await getData(BASIC)
  const robin = data.find(x => x['Common Name'] === 'American Robin')
  assert.equal('Subspecies' in robin, false)
})

test('getData keeps a subspecies-level slash (only genus/species slashes are dropped)', async (t) => {
  const file = await tmpCsv(t, `${HEADER}
S1,Dark-eyed Junco (Slate-colored),Junco hyemalis hyemalis/carolinensis,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
`)
  const data = await getData(file)
  assert.equal(data.length, 1)
  assert.equal(data[0]['Scientific Name'], 'Junco hyemalis')
  assert.equal(data[0].Subspecies, 'Junco hyemalis hyemalis/carolinensis')
})

test('getData drops Domestic type rows', async (t) => {
  const file = await tmpCsv(t, `${HEADER}
S1,Mallard (Domestic type),Anas platyrhynchos (Domestic type),1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,Mallard,Anas platyrhynchos,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
`)
  const data = await getData(file)
  assert.deepEqual(data.map(x => x['Common Name']), ['Mallard'])
})

test('getData keeps rows with no location (it does not location-filter)', async () => {
  const data = await getData(BASIC)
  const audio = data.find(x => x['Submission ID'] === 'S900000005')
  assert.ok(audio)
  assert.equal(audio.Latitude, '')
})

test('getData handles quoted fields containing commas', async () => {
  const [first] = await getData(BASIC)
  assert.equal(first.Location, 'Test Park, Burlington')
})

test('getData keeps exact duplicate rows (uniq is by reference, not by value)', async () => {
  const data = await getData(DATES)
  const gamma = data.filter(x => x['Common Name'] === 'Gamma Test Bird')
  assert.equal(gamma.length, 2)
})

test('getData returns [] for a header-only CSV', async () => {
  assert.deepEqual(await getData(HEADER_ONLY), [])
})

test('getData returns [] for an empty file', async (t) => {
  const file = await tmpCsv(t, '')
  assert.deepEqual(await getData(file), [])
})

test('getData returns [] when there is no Scientific Name column', async () => {
  // removeSpuh requires a truthy Scientific Name, so every row is discarded.
  assert.deepEqual(await getData(NO_SCI_NAME), [])
})

test('getData skips blank lines', async (t) => {
  const file = await tmpCsv(t, `${HEADER}

S1,Mallard,Anas platyrhynchos,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0

`)
  const data = await getData(file)
  assert.equal(data.length, 1)
})

test('getData handles CRLF line endings', async (t) => {
  const file = await tmpCsv(t, `${HEADER}\r\nS1,Mallard,Anas platyrhynchos,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0\r\n`)
  const data = await getData(file)
  assert.equal(data.length, 1)
  assert.equal(data[0]['All Obs Reported'], '0')
})

test('getData still parses non-leading columns when the file starts with a UTF-8 BOM', async (t) => {
  const file = await tmpCsv(t, `﻿${HEADER}\nS1,Mallard,Anas platyrhynchos,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0\n`)
  const [first] = await getData(file)
  assert.equal(first['Common Name'], 'Mallard')
  assert.equal(first.Date, '2022-01-01')
})

test('getData strips a UTF-8 BOM so the first header is "Submission ID"', async (t) => {
  const file = await tmpCsv(t, `﻿${HEADER}\nS1,Mallard,Anas platyrhynchos,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0\n`)
  const [first] = await getData(file)
  assert.equal(first['Submission ID'], 'S1')
  assert.ok(!Object.keys(first).some(k => k.startsWith('﻿')))
})

test('getData rejects with ENOENT for a missing file', async () => {
  await assert.rejects(getData(fixture('does-not-exist.csv')), { code: 'ENOENT' })
})

test('getData(array) skips reading and removes spuhs from the given rows', async () => {
  const rows = [
    { 'Common Name': 'Mallard', 'Scientific Name': 'Anas platyrhynchos' },
    { 'Common Name': 'duck sp.', 'Scientific Name': 'Anatinae sp.' }
  ]
  const out = await getData(rows)
  assert.deepEqual(out.map(r => r['Common Name']), ['Mallard'])
})

test('getData(rows, { keepSpuh: true }) keeps spuhs, slashes and hybrids', async () => {
  const rows = [
    { 'Common Name': 'Mallard', 'Scientific Name': 'Anas platyrhynchos' },
    { 'Common Name': 'duck sp.', 'Scientific Name': 'Anatinae sp.' },
    { 'Common Name': 'Mallard x American Black Duck (hybrid)', 'Scientific Name': 'Anas platyrhynchos x rubripes' }
  ]
  const out = await getData(rows, { keepSpuh: true })
  assert.equal(out.length, 3)
})

test('getData(file, { keepSpuh: true }) keeps spuh rows from a CSV', async () => {
  const all = await getData(fixture('basic.csv'), { keepSpuh: true })
  const species = await getData(fixture('basic.csv'))
  assert.ok(all.length > species.length)
  assert.ok(all.some(r => r['Scientific Name'].includes('sp.')))
})

// ===========================================================================
// countUniqueSpecies
// ===========================================================================

test('countUniqueSpecies groups first sightings by period', () => {
  const data = [
    row('Turdus migratorius', '2022-05-01'),
    row('Poecile atricapillus', '2022-05-01'),
    row('Cyanocitta cristata', '2022-05-02')
  ]
  const result = countUniqueSpecies(data, 'YYYY-MM-DD')
  assert.deepEqual(Object.keys(result), ['2022-05-01', '2022-05-02'])
  assert.equal(result['2022-05-01'].length, 2)
  assert.equal(result['2022-05-02'].length, 1)
})

test('countUniqueSpecies records each species only once (its first appearance)', () => {
  const data = [
    row('Turdus migratorius', '2022-05-01'),
    row('Turdus migratorius', '2022-05-01'),
    row('Turdus migratorius', '2022-06-01')
  ]
  const result = countUniqueSpecies(data, 'YYYY-MM-DD')
  assert.deepEqual(Object.keys(result), ['2022-05-01'])
  assert.equal(result['2022-05-01'].length, 1)
})

test('countUniqueSpecies keys uniqueness on Scientific Name, not Common Name', () => {
  const data = [
    { 'Scientific Name': 'Columba livia', 'Common Name': 'Rock Pigeon', Date: '2022-05-01' },
    { 'Scientific Name': 'Columba livia', 'Common Name': 'Rock Pigeon (Feral Pigeon)', Date: '2022-05-02' },
    { 'Scientific Name': 'Columba palumbus', 'Common Name': 'Rock Pigeon', Date: '2022-05-03' }
  ]
  const result = countUniqueSpecies(data, 'YYYY-MM-DD')
  assert.deepEqual(Object.keys(result), ['2022-05-01', '2022-05-03'])
})

test('countUniqueSpecies with "YYYY" groups by year', () => {
  const data = [
    row('A a', '2022-01-01'),
    row('B b', '2022-12-31'),
    row('C c', '2023-01-01')
  ]
  const result = countUniqueSpecies(data, 'YYYY')
  assert.deepEqual(Object.keys(result), ['2022', '2023'])
  assert.equal(result['2022'].length, 2)
})

test('countUniqueSpecies with "YYYY-MM" groups by month', () => {
  const data = [row('A a', '2022-01-01'), row('B b', '2022-01-31'), row('C c', '2022-02-01')]
  const result = countUniqueSpecies(data, 'YYYY-MM')
  assert.deepEqual(Object.keys(result), ['2022-01', '2022-02'])
})

test('countUniqueSpecies accepts MM/DD/YYYY dates', () => {
  const data = [row('A a', '05/01/2022'), row('B b', '05/01/2022')]
  const result = countUniqueSpecies(data, 'YYYY-MM-DD')
  assert.deepEqual(Object.keys(result), ['2022-05-01'])
  assert.equal(result['2022-05-01'].length, 2)
})

test('countUniqueSpecies handles a leap day', () => {
  const result = countUniqueSpecies([row('A a', '2024-02-29')], 'YYYY-MM-DD')
  assert.deepEqual(Object.keys(result), ['2024-02-29'])
})

test('countUniqueSpecies keeps the first sighting in INPUT order, not date order', () => {
  // The function doesn't sort; callers are expected to orderByDate first.
  const data = [row('A a', '2022-06-01'), row('A a', '2022-01-01')]
  const result = countUniqueSpecies(data, 'YYYY-MM-DD')
  assert.deepEqual(Object.keys(result), ['2022-06-01'])
})

test('countUniqueSpecies returns {} for empty input', () => {
  assert.deepEqual(countUniqueSpecies([], 'YYYY-MM-DD'), {})
})

test('countUniqueSpecies stores the original row objects (by reference)', () => {
  const a = row('A a', '2022-05-01')
  const result = countUniqueSpecies([a], 'YYYY-MM-DD')
  assert.equal(result['2022-05-01'][0], a)
})

test('countUniqueSpecies does not mutate its input', () => {
  const data = [row('A a', '2022-05-01'), row('A a', '2022-05-02')]
  const before = structuredClone(data)
  countUniqueSpecies(data, 'YYYY-MM-DD')
  assert.deepEqual(data, before)
})

test('countUniqueSpecies with no dateFormat keys by moment\'s default ISO string', () => {
  const result = countUniqueSpecies([row('A a', '2022-05-01')])
  const [key] = Object.keys(result)
  assert.match(key, /^2022-05-01T00:00:00/)
})

test('countUniqueSpecies throws on a date with no - or / separator', () => {
  assert.throws(() => countUniqueSpecies([row('A a', '20220501')], 'YYYY'), /Invalid Date String/)
})

// ===========================================================================
// getAllTowns
// ===========================================================================

test('getAllTowns returns one key per distinct town in the real Vermont geojson', () => {
  const towns = getAllTowns(vtTowns)
  const distinct = new Set(vtTowns.features.map(x => x.properties.town))
  assert.equal(Object.keys(towns).length, distinct.size)
  assert.ok(Object.keys(towns).length > 200)
})

test('getAllTowns uses the geojson\'s upper-case town names as keys', () => {
  const towns = getAllTowns(vtTowns)
  assert.ok('BURLINGTON' in towns)
  assert.ok('MONTPELIER' in towns)
  assert.equal('Burlington' in towns, false)
})

test('getAllTowns maps every town to its own empty object', () => {
  const towns = getAllTowns({
    features: [{ properties: { town: 'A' } }, { properties: { town: 'B' } }]
  })
  assert.deepEqual(towns, { A: {}, B: {} })
  assert.notEqual(towns.A, towns.B)
})

test('getAllTowns collapses duplicate town names', () => {
  const towns = getAllTowns({
    features: [{ properties: { town: 'A' } }, { properties: { town: 'A' } }]
  })
  assert.deepEqual(Object.keys(towns), ['A'])
})

test('getAllTowns returns {} for a collection with no features', () => {
  assert.deepEqual(getAllTowns({ features: [] }), {})
})

test('getAllTowns throws when given something without a features array', () => {
  assert.throws(() => getAllTowns({}), TypeError)
})

// ===========================================================================
// checklists
// ===========================================================================

test('checklists returns one entry per Submission ID with the documented shape', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC })
  assert.deepEqual(result[0], {
    'Submission ID': 'S900000001',
    Date: '2022-05-01',
    Time: '07:00 AM',
    Location: 'Test Park, Burlington',
    'All Obs Reported': '1'
  })
  const ids = result.map(x => x['Submission ID'])
  assert.equal(new Set(ids).size, ids.length)
})

test('checklists with no filters drops rows without coordinates', async (t) => {
  muteLog(t)
  const ids = (await checklists({ input: BASIC })).map(x => x['Submission ID'])
  assert.deepEqual(ids, ['S900000001', 'S900000002', 'S900000003', 'S900000004', 'S900000006'])
  assert.ok(!ids.includes('S900000005'))
})

test('checklists are returned in date order regardless of file order', async (t) => {
  muteLog(t)
  const dates = (await checklists({ input: DATES })).map(x => x.Date)
  assert.deepEqual(dates, [
    '2020-05-01', '2021-05-01', '2022-01-01', '2022-03-01', '2022-04-01',
    '2022-04-02', '2022-05-01', '2022-06-15', '2022-12-31', '2024-02-29'
  ])
})

test('checklists { complete: true } keeps only All Obs Reported = 1', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC, complete: true })
  assert.deepEqual(result.map(x => x['Submission ID']), ['S900000001', 'S900000002', 'S900000004', 'S900000006'])
  assert.ok(result.every(x => x['All Obs Reported'] === '1'))
})

test('checklists { duration } keeps checklists at least that many minutes long', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC, duration: 45 })
  assert.deepEqual(result.map(x => x['Submission ID']), ['S900000002', 'S900000004'])
})

test('checklists { year } filters by year', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC, year: 2022 })
  assert.deepEqual(result.map(x => x['Submission ID']), ['S900000001', 'S900000002'])
})

test('checklists { state } filters by full state name', async (t) => {
  muteLog(t)
  const ny = await checklists({ input: BASIC, state: 'New York' })
  assert.deepEqual(ny.map(x => x['Submission ID']), ['S900000004', 'S900000006'])
  const vt = await checklists({ input: BASIC, state: 'Vermont' })
  assert.deepEqual(vt.map(x => x['Submission ID']), ['S900000001', 'S900000002', 'S900000003'])
})

test('checklists { town } matches the geocoded town case-insensitively', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC, town: 'Burlington' })
  assert.deepEqual(result.map(x => x['Submission ID']), ['S900000001'])
})

test('checklists { county } accepts an array of counties', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC, county: ['Chittenden', 'Washington'] })
  assert.deepEqual(result.map(x => x['Submission ID']), ['S900000001', 'S900000002'])
})

test('checklists combines filters (year + complete + duration)', async (t) => {
  muteLog(t)
  const result = await checklists({ input: BASIC, year: 2022, complete: true, duration: 45 })
  assert.deepEqual(result.map(x => x['Submission ID']), ['S900000002'])
})

test('checklists returns [] when nothing matches', async (t) => {
  muteLog(t)
  assert.deepEqual(await checklists({ input: BASIC, year: 1999 }), [])
})

test('checklists returns [] for a header-only CSV', async (t) => {
  muteLog(t)
  assert.deepEqual(await checklists({ input: HEADER_ONLY }), [])
})

test('checklists accepts MM/DD/YYYY dates and keeps them in their original format', async (t) => {
  muteLog(t)
  const result = await checklists({ input: SLASH_DATES })
  assert.deepEqual(result.map(x => x.Date), ['05/01/2022', '12/31/2022'])
})

test('checklists includes checklists whose only observations are spuhs/slashes/hybrids', async (t) => {
  // S900000006 in basic.csv reports only "gull sp.".
  muteLog(t)
  const result = await checklists({ input: BASIC })
  assert.deepEqual(result.find(x => x['Submission ID'] === 'S900000006'), {
    'Submission ID': 'S900000006',
    Date: '2023-08-01',
    Time: '10:00 AM',
    Location: 'Test Meadow',
    'All Obs Reported': '1'
  })
})

// ===========================================================================
// countTheBirds
// ===========================================================================

test('countTheBirds logs the total individual count and resolves undefined', async (t) => {
  const log = muteLog(t)
  const result = await countTheBirds({ input: BASIC })
  assert.equal(result, undefined)
  // 14 (S1, "X" ignored, incl. 5 gull sp.) + 4 (S2, incl. 1 hybrid)
  // + 3 (S3, incl. 1 slash) + 30 (S4) + 50 (S6, gull sp.); S5 has no coordinates.
  assert.deepEqual(log.mock.calls.at(-1).arguments, [101])
})

test('countTheBirds { year } counts only that year', async (t) => {
  const log = muteLog(t)
  await countTheBirds({ input: BASIC, year: 2022 })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [18])
})

test('countTheBirds { state } counts only that state', async (t) => {
  const log = muteLog(t)
  await countTheBirds({ input: BASIC, state: 'Vermont' })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [21])
})

test('countTheBirds { county } counts only that county', async (t) => {
  const log = muteLog(t)
  await countTheBirds({ input: BASIC, county: 'Chittenden' })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [14])
})

test('countTheBirds ignores "X" and blank counts, and truncates decimals', async (t) => {
  const file = await tmpCsv(t, `${HEADER}
S1,A,Testus a,X,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,B,Testus b,,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,C,Testus c,2.9,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,D,Testus d,5,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
`)
  const log = muteLog(t)
  await countTheBirds({ input: file })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [7])
})

test('countTheBirds logs 0 for a header-only CSV', async (t) => {
  const log = muteLog(t)
  await countTheBirds({ input: HEADER_ONLY })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [0])
})

test('countTheBirds logs 0 when the filters match nothing', async (t) => {
  const log = muteLog(t)
  await countTheBirds({ input: BASIC, year: 1999 })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [0])
})

test('countTheBirds includes individuals reported as spuhs/slashes/hybrids', async (t) => {
  const file = await tmpCsv(t, `${HEADER}
S1,gull sp.,Larinae sp.,5,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,Alder/Willow Flycatcher,Empidonax alnorum/traillii,2,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,Brewster's Warbler (hybrid),Vermivora chrysoptera x cyanoptera,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
S1,Blue Jay,Cyanocitta cristata,3,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-01,,Incidental,,0
`)
  const log = muteLog(t)
  await countTheBirds({ input: file })
  assert.deepEqual(log.mock.calls.at(-1).arguments, [11])
})

// ===========================================================================
// datesSpeciesObserved
// ===========================================================================

test('datesSpeciesObserved logs "Species: <distinct days of year seen>", most-seen first', async (t) => {
  freezeNow(t, 2025, 6, 15) // non-leap current year
  const log = muteLog(t)
  const result = await datesSpeciesObserved({ input: DATES })
  assert.equal(result, undefined)
  assert.equal(log.mock.calls.length, 1)
  assert.deepEqual(log.mock.calls[0].arguments[0], [
    'Alpha Test Bird: 3',
    'Beta Test Bird: 1',
    'Gamma Test Bird: 1',
    'Epsilon Test Bird: 1'
  ])
})

test('datesSpeciesObserved counts the same month-day in different years once', async (t) => {
  freezeNow(t, 2025, 6, 15)
  const log = muteLog(t)
  await datesSpeciesObserved({ input: DATES })
  // Alpha: 05-01 in 2020, 2021 and 2022, plus 06-15 and 12-31.
  assert.ok(log.mock.calls[0].arguments[0].includes('Alpha Test Bird: 3'))
})

test('datesSpeciesObserved only considers US-VT rows', async (t) => {
  freezeNow(t, 2025, 6, 15)
  const log = muteLog(t)
  await datesSpeciesObserved({ input: DATES })
  assert.ok(!log.mock.calls[0].arguments[0].some(s => s.startsWith('Delta Test Bird')))
})

test('datesSpeciesObserved excludes spuhs and keeps rows without coordinates', async (t) => {
  freezeNow(t, 2025, 6, 15)
  const log = muteLog(t)
  await datesSpeciesObserved({ input: DATES })
  const lines = log.mock.calls[0].arguments[0]
  assert.ok(!lines.some(s => s.startsWith('test bird sp.')))
  assert.ok(lines.includes('Epsilon Test Bird: 1'))
})

test('datesSpeciesObserved caps the list at 20 species', async (t) => {
  const rows = Array.from({ length: 25 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return `S${n},Species ${n},Testus s${n},1,US-VT,Chittenden,X,44.4759,-73.2121,2022-01-${n},,Incidental,,0`
  })
  // Give Species 25 extra days so it sorts to the top.
  rows.push('S99,Species 25,Testus s25,1,US-VT,Chittenden,X,44.4759,-73.2121,2022-02-01,,Incidental,,0')
  const file = await tmpCsv(t, `${HEADER}\n${rows.join('\n')}\n`)
  freezeNow(t, 2025, 6, 15)
  const log = muteLog(t)
  await datesSpeciesObserved({ input: file })
  const lines = log.mock.calls[0].arguments[0]
  assert.equal(lines.length, 20)
  assert.equal(lines[0], 'Species 25: 2')
  assert.equal(lines[1], 'Species 01: 1')
})

test('datesSpeciesObserved logs [] when there are no Vermont rows', async (t) => {
  freezeNow(t, 2025, 6, 15)
  const log = muteLog(t)
  await datesSpeciesObserved({ input: HEADER_ONLY })
  assert.deepEqual(log.mock.calls[0].arguments[0], [])
})

test.todo('datesSpeciesObserved supports MM/DD/YYYY dates like the rest of the toolkit (index.js:945 splits on "-" only, so slash-dates.csv throws a TypeError reading observedDates[undefined])')

test.todo('datesSpeciesObserved counts a Feb 29 sighting when the current year is not a leap year (month lengths come from moment() at index.js:953, so 29 is outside the February chart and Beta Test Bird in dates.csv reports 1 day instead of 2)')

test.todo('datesSpeciesObserved reports correct day counts when the current year is a leap year (index.js:968 hard-codes 365 while the chart built at index.js:953 has 366 days, so every count is one too low)')

// ===========================================================================
// getLastDate
// ===========================================================================

test('getLastDate logs today\'s date as "MMMM Do, YYYY"', async (t) => {
  freezeNow(t, 2024, 3, 5)
  const log = muteLog(t)
  await getLastDate()
  assert.deepEqual(log.mock.calls[0].arguments, ['March 5th, 2024'])
})

test('getLastDate uses ordinal suffixes', async (t) => {
  freezeNow(t, 2023, 12, 22)
  const log = muteLog(t)
  await getLastDate({ input: BASIC })
  assert.deepEqual(log.mock.calls[0].arguments, ['December 22nd, 2023'])
})

test('getLastDate resolves undefined and ignores opts', async (t) => {
  freezeNow(t, 2024, 1, 1)
  const log = muteLog(t)
  assert.equal(await getLastDate({ input: 'no-such-file.csv' }), undefined)
  assert.equal(log.mock.calls.length, 1)
})

// ===========================================================================
// vt251
// ===========================================================================
//
// vt251 runs towns() with a fixed 2022 / complete / >=5 minute config and
// writes data/vt_town_counts.json. fs.promises.writeFile is mocked so nothing
// is written to the repository.

async function runVt251 (t) {
  muteLog(t)
  const write = t.mock.method(fsp, 'writeFile', async () => {})
  const result = await vt251(VT251)
  assert.equal(write.mock.calls.length, 1)
  const [file, json, encoding] = write.mock.calls[0].arguments
  return { result, file, encoding, towns: JSON.parse(json) }
}

test('vt251 writes data/vt_town_counts.json as utf8 and resolves undefined', async (t) => {
  const { result, file, encoding } = await runVt251(t)
  assert.equal(result, undefined)
  assert.equal(file, 'data/vt_town_counts.json')
  assert.equal(encoding, 'utf8')
})

test('vt251 output has an array for every Vermont town', async (t) => {
  const { towns } = await runVt251(t)
  const expected = new Set([...Object.keys(getAllTowns(vtTowns)), ...Object.keys(townDataFor2022)])
  assert.deepEqual(new Set(Object.keys(towns)), expected)
  assert.ok(Object.values(towns).every(Array.isArray))
})

test('vt251 adds 2022 complete checklist species to the geocoded town', async (t) => {
  const { towns } = await runVt251(t)
  // Unknown names fall back to the common name instead of a banding code.
  assert.ok(towns.BURLINGTON.includes('Zzyzx Test Bird'))
  assert.ok(towns.MONTPELIER.includes('Second Town Test Bird'))
})

test('vt251 excludes other years, incomplete, short, out-of-state and spuh records', async (t) => {
  const { towns } = await runVt251(t)
  const all = Object.values(towns).flat()
  for (const name of ['Yearfiltered Test Bird', 'Incomplete Test Bird', 'Short Test Bird', 'Out Of State Test Bird', 'test bird sp.']) {
    assert.ok(!all.includes(name), `${name} should not appear`)
  }
})

test('vt251 merges in the May 2022 base data without duplicates', async (t) => {
  const { towns } = await runVt251(t)
  // No fixture rows fall in Addison, so it is exactly the (deduped) base data.
  assert.deepEqual(towns.ADDISON, [...new Set(townDataFor2022.ADDISON)])
  for (const list of Object.values(towns)) {
    assert.equal(new Set(list).size, list.length)
  }
})

test.todo('vt251 resolves only after data/vt_town_counts.json is written (towns() calls fs.writeFile without await at index.js:211, so vt251 resolves early and write errors become unhandled rejections)')
