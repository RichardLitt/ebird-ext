import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { promises as fsp } from 'node:fs'
import moment from 'moment'
import {
  towns,
  counties,
  regions,
  state,
  radialSearch,
  quadBirds,
  winterFinch
} from '../index.js'
import vtTowns from '../geojson/vt_towns.json' with { type: 'json' }
import townDataFor2022 from '../data/townDataFor2022-May-Export.json' with { type: 'json' }
import CountyBarcharts from '../data/countyBarcharts.json' with { type: 'json' }

// Fixtures live in test/fixtures/index-location/ and are hand-made CSVs in the
// "My eBird Data" shape (parsed by getData with Papa, header: true).
//
// sightings.csv -- one checklist per test point. Every coordinate was checked
// against geojson/vt_towns.json and Polygon_VT_Biophysical_Regions.json:
//
//   Sub.        Date        Town (county)            Region                     Species
//   S900000001  2023-05-10  BURLINGTON (Chittenden)  Champlain Valley           AMRO BCCH BLJA DEJU(Slate-colored)
//   S900000002  2024-01-15  BURLINGTON (Chittenden)  Champlain Valley           SNBU AMRO BOWA
//   S900000003  2023-06-01  MONTPELIER (Washington)  Northern Vermont Piedmont  CORA BADO   (incomplete, Incidental, 5 min)
//   S900000004  2024-02-20  MONTPELIER (Washington)  Northern Vermont Piedmont  EVGR BCCH
//   S900000005  2023-12-30  FAYSTON (Washington)     Northern Green Mountains   PIGR "Red Crossbill (Type 10)" EASO
//   S900000006  2024-04-05  BRATTLEBORO (Windham)    Southern Vermont Piedmont  WODU + duck sp. + a hybrid
//   S900000007  2023-08-12  BRIGHTON (Essex)         Northeastern Highlands     BOCH CAJA
//   S900000008  2023-09-09  Lake Champlain (water; no town/region polygon, falls back to nearest Chittenden town)  COLO
//   S900000009  2023-07-04  Hanover, NH (out of state)                          TUTI AMRO
//   S900000010  2023-03-03  no coordinates at all (discarded)                   RWBL
//   S900000011  2024-05-20  PAWLET (Rutland)         Taconic Mountains          CERW
//   S900000012  2024-06-10  MANCHESTER (Bennington)  Vermont Valley             ALFL (25 min)
//   S900000013  2024-06-11  WOODFORD (Bennington)    Southern Green Mountains   BLPW
//   S900000014  2023-10-10  FAIRFAX (Franklin)       Champlain Hills            WITU
//   S900000015  2024-03-15  NORWICH (Windsor)        Southern Vermont Piedmont  EABL (1.3 mi from Hanover, NH)
//
// Rows are deliberately NOT in date order, to exercise orderByDate.
// Vermont species total: 21 (13 first seen in 2023, 8 in 2024). 2024-only: 10.

const fixture = (name) => fileURLToPath(new URL(`./fixtures/index-location/${name}`, import.meta.url))
const SIGHTINGS = fixture('sightings.csv')
const EMPTY = fixture('empty.csv')
const SLASH_DATES = fixture('slash-dates.csv')
const QUAD_SIGHTINGS = fixture('quad-sightings.csv')
const QUAD_MEDIA = fixture('quad-media.csv')
const QUAD_BOTH = `${QUAD_SIGHTINGS},${QUAD_MEDIA}`

const BURLINGTON = [44.4759, -73.2121]
const HANOVER_NH = [43.7022, -72.2896]
const NEW_YORK_CITY = [40.7831, -73.9712]

const COUNTY_NAMES = Object.keys(CountyBarcharts)
const REGION_NAMES = [
  'Northeastern Highlands',
  'Champlain Valley',
  'Taconic Mountains',
  'Vermont Valley',
  'Champlain Hills',
  'Northern Green Mountains',
  'Northern Vermont Piedmont',
  'Southern Vermont Piedmont',
  'Southern Green Mountains'
]

// Silence console.log / console.error for the duration of a test. The mocks are
// restored automatically when the test ends. Read captured output back with
// logged() (raw argument arrays) or loggedLines() (arguments joined by spaces,
// as console.log would print them).
function quiet (t) {
  t.mock.method(console, 'error', () => {})
  t.mock.method(console, 'log', () => {})
}
const logged = () => console.log.mock.calls.map(c => c.arguments)
const loggedLines = () => console.log.mock.calls.map(c => c.arguments.join(' '))

// towns and counties await their fs.writeFile, so the output file must exist
// as soon as the returned promise resolves: read it once, without polling.
async function readJson (path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

// Replace fs.promises.writeFile (what index.js writes with) for one test.
function failWrites (t) {
  return t.mock.method(fsp, 'writeFile', async () => { throw new Error('disk full') })
}

async function tempDir (t) {
  const dir = await mkdtemp(join(tmpdir(), 'ebird-ext-index-location-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return dir
}

// ===========================================================================
// towns
// ===========================================================================

// ---------------------------------------------------------------------------
// towns -- option handling
// ---------------------------------------------------------------------------

test('towns defaults opts.state to "Vermont" when none is given', async (t) => {
  quiet(t)
  const opts = { input: SIGHTINGS }
  await towns(opts)
  assert.equal(opts.state, 'Vermont')
})

test('towns keeps a caller-supplied opts.state', async (t) => {
  quiet(t)
  const opts = { input: SIGHTINGS, state: 'New Hampshire', all: true }
  await towns(opts)
  assert.equal(opts.state, 'New Hampshire')
})

test('towns with a non-Vermont state finds nothing for any Vermont town', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, state: 'New Hampshire', all: true })
  assert.ok(Object.values(result).every(list => list.length === 0))
})

test('towns with neither all nor town returns undefined and logs nothing', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS })
  assert.equal(result, undefined)
  assert.equal(console.log.mock.calls.length, 0)
})

// ---------------------------------------------------------------------------
// towns { all: true } -- return shape
// ---------------------------------------------------------------------------

test('towns { all } returns one key per town in vt_towns.json', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  const expected = [...new Set(vtTowns.features.map(f => f.properties.town))].sort()
  assert.deepEqual(Object.keys(result).sort(), expected)
})

test('towns { all } keys are the upper-case town names from the geojson', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok('BURLINGTON' in result)
  assert.ok(!('Burlington' in result))
  assert.ok(Object.keys(result).every(k => k === k.toUpperCase()))
})

test('towns { all } maps every town to an array', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok(Object.values(result).every(Array.isArray))
})

test('towns { all } leaves towns without sightings as empty arrays', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.deepEqual(result.STOWE, [])
  assert.deepEqual(result.CANAAN, [])
})

test('towns { all } on an empty CSV gives every town an empty array', async (t) => {
  quiet(t)
  const result = await towns({ input: EMPTY, all: true })
  assert.ok(Object.keys(result).length > 200)
  assert.ok(Object.values(result).every(list => list.length === 0))
})

// ---------------------------------------------------------------------------
// towns { all: true } -- contents
// ---------------------------------------------------------------------------

test('towns { all } lists banding codes in first-seen order for Burlington', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  // 2023-05-10 checklist first, then the Lake Champlain loon (2023-09-09,
  // credited via the nearest-town fallback), then the new species from 2024-01-15.
  assert.deepEqual(result.BURLINGTON, [
    'AMRO', 'BCCH', 'BLJA', 'DEJU', 'COLO', 'SNBU', 'BOWA'
  ])
})

test('towns { all } counts a species only once per town', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.equal(result.BURLINGTON.filter(c => c === 'AMRO').length, 1)
})

test('towns { all } credits a species to each town it was seen in', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok(result.BURLINGTON.includes('BCCH'))
  assert.ok(result.MONTPELIER.includes('BCCH'))
})

test('towns { all } resolves each test point to the expected town', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.deepEqual(result.MONTPELIER, ['CORA', 'BADO', 'EVGR', 'BCCH'])
  assert.deepEqual(result.BRIGHTON, ['BOCH', 'CAJA'])
  assert.deepEqual(result.FAIRFAX, ['WITU'])
  assert.deepEqual(result.PAWLET, ['CERW'])
  assert.deepEqual(result.MANCHESTER, ['ALFL'])
  assert.deepEqual(result.WOODFORD, ['BLPW'])
  assert.deepEqual(result.NORWICH, ['EABL'])
})

test('towns { all } drops spuhs and hybrids', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.deepEqual(result.BRATTLEBORO, ['WODU'])
})

test('towns { all } never credits an out-of-state sighting to a Vermont town', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok(Object.values(result).every(list => !list.includes('TUTI')))
})

test('towns { all } discards rows that have no coordinates', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok(Object.values(result).every(list => !list.includes('RWBL')))
})

// An already-parsed row at the Burlington test point, for towns({ input: [...] }).
function burlingtonRow (common, sci, date = '2023-05-10') {
  return {
    'Submission ID': 'S999999999',
    'Common Name': common,
    'Scientific Name': sci,
    'State/Province': 'US-VT',
    County: 'Chittenden',
    Latitude: '44.4759',
    Longitude: '-73.2121',
    Date: date
  }
}

test('towns { all } reduces subspecies-level common names to the species banding code', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.deepEqual(result.FAYSTON, ['PIGR', 'RECR', 'EASO'])
  assert.ok(result.BURLINGTON.includes('DEJU'))
  assert.ok(Object.values(result).flat().every(code => !code.includes('(')))
})

test('towns { all } lists a species once when it was seen both as a subspecies and plain', async (t) => {
  quiet(t)
  const result = await towns({
    input: [
      burlingtonRow('Dark-eyed Junco (Slate-colored)', 'Junco hyemalis hyemalis/carolinensis'),
      burlingtonRow('Dark-eyed Junco', 'Junco hyemalis', '2023-06-01')
    ],
    all: true
  })
  assert.deepEqual(result.BURLINGTON, ['DEJU'])
})

test('towns { all, baseData } does not double-count a subspecies against the 2022 base data', async (t) => {
  quiet(t)
  assert.ok(townDataFor2022.BURLINGTON.includes('DEJU'))
  const result = await towns({ input: SIGHTINGS, all: true, baseData: true })
  assert.equal(result.BURLINGTON.filter(c => c === 'DEJU').length, 1)
  assert.ok(!result.BURLINGTON.includes('Dark-eyed Junco (Slate-colored)'))
})

test('towns { all } falls back to the raw common name when no banding code exists', async (t) => {
  quiet(t)
  const result = await towns({ input: [burlingtonRow('Zzyzx Test Bird', 'Testus zzyzx')], all: true })
  assert.deepEqual(result.BURLINGTON, ['Zzyzx Test Bird'])
})

// ---------------------------------------------------------------------------
// towns { all: true } -- filters
// ---------------------------------------------------------------------------

test('towns { all, complete } drops incomplete checklists', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true, complete: true })
  // S900000003 (All Obs Reported = 0) contributed CORA and BADO.
  assert.deepEqual(result.MONTPELIER, ['EVGR', 'BCCH'])
})

test('towns { all, duration: 30 } drops checklists shorter than 30 minutes', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true, duration: 30 })
  assert.deepEqual(result.BRATTLEBORO, []) // 20 min
  assert.deepEqual(result.MANCHESTER, []) // 25 min
  assert.deepEqual(result.MONTPELIER, ['EVGR', 'BCCH']) // 5 min checklist gone
  assert.deepEqual(result.WOODFORD, ['BLPW']) // 35 min kept
  assert.equal(result.BURLINGTON.length, 6) // 60 and 30 min kept (boundary inclusive)
})

test('towns { all, year } keeps only that year, in checklist row order', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true, year: 2024 })
  assert.deepEqual(result.BURLINGTON, ['SNBU', 'AMRO', 'BOWA'])
  assert.deepEqual(result.BRIGHTON, [])
})

test('towns { all, baseData: true } unions in the 2022 town data', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true, baseData: true })
  const base = townDataFor2022.BURLINGTON
  assert.ok(Array.isArray(base) && base.length > 0)
  for (const code of base) assert.ok(result.BURLINGTON.includes(code), `missing ${code}`)
  for (const code of ['SNBU', 'BOWA']) assert.ok(result.BURLINGTON.includes(code))
  assert.equal(new Set(result.BURLINGTON).size, result.BURLINGTON.length, 'no duplicates')
})

test('towns { all } without baseData does not include the 2022 town data', async (t) => {
  quiet(t)
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok(result.STOWE.length === 0)
  assert.ok(townDataFor2022.STOWE.length > 0)
})

test('towns { all, output } writes the result to <output>.json', async (t) => {
  quiet(t)
  const dir = await tempDir(t)
  const result = await towns({ input: SIGHTINGS, all: true, output: join(dir, 'towns.json') })
  const written = await readJson(join(dir, 'towns.json'))
  assert.deepEqual(written, result)
})

test('towns { all, output } appends .json when the output path has no extension', async (t) => {
  quiet(t)
  const dir = await tempDir(t)
  await towns({ input: SIGHTINGS, all: true, output: join(dir, 'towns') })
  const written = await readJson(join(dir, 'towns.json'))
  assert.deepEqual(written.BRIGHTON, ['BOCH', 'CAJA'])
})

test('towns { all } credits a sighting outside every town polygon to the nearest town', async (t) => {
  quiet(t)
  // The Lake Champlain point is outside every town boundary; filters.js falls
  // back to the nearest town, which must use the same upper-case key.
  const result = await towns({ input: SIGHTINGS, all: true })
  assert.ok(result.BURLINGTON.includes('COLO'))
})

test('towns { all, output } rejects when the file write fails', async (t) => {
  quiet(t)
  failWrites(t)
  await assert.rejects(towns({ input: SIGHTINGS, all: true, output: 'unused.json' }), /disk full/)
})

test('towns { town, output } rejects when the file write fails', async (t) => {
  quiet(t)
  failWrites(t)
  await assert.rejects(towns({ input: SIGHTINGS, town: 'Montpelier', output: 'unused.json' }), /disk full/)
})

test('counties { output } rejects when the file write fails', async (t) => {
  quiet(t)
  failWrites(t)
  await assert.rejects(counties({ input: SIGHTINGS, output: 'unused.json' }), /disk full/)
})

// ---------------------------------------------------------------------------
// towns { town } -- console output
// ---------------------------------------------------------------------------

test('towns { town } logs one numbered line per first-seen species', async (t) => {
  quiet(t)
  await towns({ input: SIGHTINGS, town: 'Fayston' })
  // locationFilter (filters.js) also logs "Wrong state ..." noise for the
  // out-of-state rows, so keep only the numbered species lines.
  assert.deepEqual(loggedLines().filter(l => /^\d+ \|/.test(l)), [
    '1 | Pine Grosbeak - Pinicola enucleator | Fayston, Washington, Vermont | 2023-12-30',
    '2 | Red Crossbill (Type 10) - Loxia curvirostra | Fayston, Washington, Vermont | 2023-12-30',
    '3 | Eastern Screech-Owl - Megascops asio | Fayston, Washington, Vermont | 2023-12-30'
  ])
})

test('towns { town } numbers species across dates in chronological order', async (t) => {
  quiet(t)
  await towns({ input: SIGHTINGS, town: 'Montpelier' })
  const lines = loggedLines().filter(l => /^\d+ \|/.test(l))
  assert.deepEqual(lines.map(l => l.split(' | ')[1].split(' - ')[0]), [
    'Common Raven', 'Barred Owl', 'Evening Grosbeak', 'Black-capped Chickadee'
  ])
  assert.ok(lines[0].endsWith('2023-06-01'))
  assert.ok(lines[3].endsWith('2024-02-20'))
})

test('towns { town } matches the town name case-insensitively', async (t) => {
  quiet(t)
  await towns({ input: SIGHTINGS, town: 'fayston' })
  const lines = loggedLines().filter(l => /^\d+ \|/.test(l))
  assert.equal(lines.length, 3)
  assert.ok(lines[0].includes('| fayston, Washington, Vermont |'))
})

test('towns { town } returns undefined', async (t) => {
  quiet(t)
  assert.equal(await towns({ input: SIGHTINGS, town: 'Fayston' }), undefined)
})

test('towns { town } for a town with no sightings logs no species lines', async (t) => {
  quiet(t)
  await towns({ input: SIGHTINGS, town: 'Stowe' })
  assert.equal(loggedLines().filter(l => /^\d+ \|/.test(l)).length, 0)
})

test('towns { town, output } writes the species-by-date object', async (t) => {
  quiet(t)
  const dir = await tempDir(t)
  await towns({ input: SIGHTINGS, town: 'Montpelier', output: join(dir, 'montpelier') })
  const written = await readJson(join(dir, 'montpelier.json'))
  assert.deepEqual(Object.keys(written), ['2023-06-01', '2024-02-20'])
  assert.deepEqual(written['2024-02-20'].map(r => r['Common Name']), ['Evening Grosbeak', 'Black-capped Chickadee'])
})

test('towns { town: "Burlington" } includes the Lake Champlain Common Loon (nearest-town fallback)', async (t) => {
  quiet(t)
  await towns({ input: SIGHTINGS, town: 'Burlington' })
  const lines = loggedLines().filter(l => /^\d+ \|/.test(l))
  assert.ok(lines.some(l => l.includes('Common Loon - Gavia immer')))
})

// ===========================================================================
// counties
// ===========================================================================

// ---------------------------------------------------------------------------
// counties -- return shape
// ---------------------------------------------------------------------------

test('counties returns an object keyed by all 14 Vermont counties', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  assert.deepEqual(Object.keys(result), COUNTY_NAMES)
  assert.equal(COUNTY_NAMES.length, 14)
})

test('counties entries have { county, collectiveTotal, species, speciesTotal }', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  for (const name of COUNTY_NAMES) {
    const entry = result[name]
    assert.deepEqual(Object.keys(entry).sort(), ['collectiveTotal', 'county', 'species', 'speciesTotal'])
    assert.equal(entry.county, name)
    assert.ok(Array.isArray(entry.species))
    assert.equal(typeof entry.collectiveTotal, 'number')
  }
})

test('counties speciesTotal always equals species.length', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  for (const name of COUNTY_NAMES) {
    assert.equal(result[name].speciesTotal, result[name].species.length, name)
  }
})

test('counties collectiveTotal is the county barchart species count, independent of input', async (t) => {
  quiet(t)
  const withData = await counties({ input: SIGHTINGS })
  const empty = await counties({ input: EMPTY })
  for (const name of COUNTY_NAMES) {
    assert.ok(withData[name].collectiveTotal > 100, name)
    assert.equal(withData[name].collectiveTotal, empty[name].collectiveTotal, name)
  }
})

test('counties on an empty CSV gives every county zero species', async (t) => {
  quiet(t)
  const result = await counties({ input: EMPTY })
  assert.ok(Object.values(result).every(c => c.speciesTotal === 0 && c.species.length === 0))
})

// ---------------------------------------------------------------------------
// counties -- contents
// ---------------------------------------------------------------------------

test('counties lists Chittenden species in first-seen order, deduplicated', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  // The Lake Champlain point has no town polygon, but County comes straight
  // from the CSV column, so it is counted here.
  assert.deepEqual(result.Chittenden.species, [
    'American Robin', 'Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)',
    'Common Loon', 'Snow Bunting', 'Bohemian Waxwing'
  ])
})

test('counties combines checklists from several towns in the same county', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  // Montpelier and Fayston are both in Washington County.
  assert.deepEqual(result.Washington.species, [
    'Common Raven', 'Barred Owl', 'Pine Grosbeak', 'Red Crossbill (Type 10)',
    'Eastern Screech-Owl', 'Evening Grosbeak', 'Black-capped Chickadee'
  ])
})

test('counties gives the expected totals for every county', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  const totals = Object.fromEntries(COUNTY_NAMES.map(n => [n, result[n].speciesTotal]))
  assert.deepEqual(totals, {
    Addison: 0,
    Bennington: 2,
    Caledonia: 0,
    Chittenden: 7,
    Essex: 2,
    Franklin: 1,
    'Grand Isle': 0,
    Lamoille: 0,
    Orange: 0,
    Orleans: 0,
    Rutland: 1,
    Washington: 7,
    Windham: 1,
    Windsor: 1
  })
})

test('counties excludes out-of-state checklists', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  assert.ok(!('Grafton' in result))
  assert.ok(Object.values(result).every(c => !c.species.includes('Tufted Titmouse')))
})

test('counties discards rows without coordinates even if the County column is set', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS })
  assert.deepEqual(result.Addison.species, [])
})

test('counties forces opts.state to "Vermont"', async (t) => {
  quiet(t)
  const opts = { input: SIGHTINGS, state: 'New Hampshire' }
  const result = await counties(opts)
  assert.equal(opts.state, 'Vermont')
  assert.equal(result.Chittenden.speciesTotal, 7)
})

test('counties { year } counts only that year', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS, year: 2023 })
  assert.deepEqual(result.Chittenden.species, [
    'American Robin', 'Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)', 'Common Loon'
  ])
  assert.equal(result.Bennington.speciesTotal, 0)
})

// ---------------------------------------------------------------------------
// counties -- options
// ---------------------------------------------------------------------------

test('counties { county } returns and logs just that county', async (t) => {
  quiet(t)
  const result = await counties({ input: SIGHTINGS, county: 'Essex' })
  assert.deepEqual(result.species, ['Boreal Chickadee', 'Canada Jay'])
  assert.equal(result.county, 'Essex')
  assert.equal(console.log.mock.calls.length, 1)
  assert.deepEqual(logged()[0][0], result)
})

test('counties { ticks } logs the sum of species totals across counties', async (t) => {
  quiet(t)
  await counties({ input: SIGHTINGS, ticks: true })
  assert.deepEqual(loggedLines(), ['Total ticks: 22.'])
})

test('counties { ticks, year } logs ticks for that year only', async (t) => {
  quiet(t)
  await counties({ input: SIGHTINGS, ticks: true, year: 2024 })
  // Chittenden 3, Washington 2, Windham 1, Windsor 1, Rutland 1, Bennington 2
  assert.deepEqual(loggedLines(), ['Total ticks: 10.'])
})

test('counties without ticks or county logs nothing', async (t) => {
  quiet(t)
  await counties({ input: SIGHTINGS })
  assert.equal(console.log.mock.calls.length, 0)
})

test('counties { output } writes an array of county entries', async (t) => {
  quiet(t)
  const dir = await tempDir(t)
  const result = await counties({ input: SIGHTINGS, output: join(dir, 'counties.json') })
  const written = await readJson(join(dir, 'counties.json'))
  assert.ok(Array.isArray(written))
  assert.equal(written.length, 14)
  assert.deepEqual(written.find(c => c.county === 'Essex'), result.Essex)
})

test('counties { county } matches the county name case-insensitively', async (t) => {
  quiet(t)
  const lower = await counties({ input: SIGHTINGS, county: 'washington' })
  assert.equal(lower.county, 'Washington')
  assert.equal(lower.speciesTotal, 7)
  const upper = await counties({ input: SIGHTINGS, county: 'ESSEX' })
  assert.deepEqual(upper.species, ['Boreal Chickadee', 'Canada Jay'])
})

test('counties { county } for a county not in Vermont returns undefined', async (t) => {
  quiet(t)
  assert.equal(await counties({ input: SIGHTINGS, county: 'Grafton' }), undefined)
})

// ===========================================================================
// regions
// ===========================================================================

// ---------------------------------------------------------------------------
// regions -- return shape
// ---------------------------------------------------------------------------

test('regions returns all nine biophysical regions', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS })
  assert.deepEqual(Object.keys(result), REGION_NAMES)
})

test('regions entries have { region, species, speciesByDate, speciesTotal }', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS })
  for (const name of REGION_NAMES) {
    const entry = result[name]
    assert.deepEqual(Object.keys(entry).sort(), ['region', 'species', 'speciesByDate', 'speciesTotal'])
    assert.equal(entry.region, name)
    assert.equal(entry.speciesTotal, entry.species.length)
  }
})

test('regions speciesByDate is keyed by YYYY-MM-DD with the raw rows as values', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS })
  const cv = result['Champlain Valley'].speciesByDate
  assert.deepEqual(Object.keys(cv), ['2023-05-10', '2023-09-09', '2024-01-15'])
  assert.equal(cv['2023-09-09'][0]['Submission ID'], 'S900000008')
})

test('regions on an empty CSV gives every region zero species', async (t) => {
  quiet(t)
  const result = await regions({ input: EMPTY })
  for (const name of REGION_NAMES) {
    assert.equal(result[name].speciesTotal, 0)
    assert.deepEqual(result[name].speciesByDate, {})
  }
})

// ---------------------------------------------------------------------------
// regions -- one test point per region
// ---------------------------------------------------------------------------

const expectedRegionSpecies = {
  'Northeastern Highlands': ['Boreal Chickadee', 'Canada Jay'],
  'Champlain Valley': [
    'American Robin', 'Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)',
    'Common Loon', 'Snow Bunting', 'Bohemian Waxwing'
  ],
  'Taconic Mountains': ['Cerulean Warbler'],
  'Vermont Valley': ['Alder Flycatcher'],
  'Champlain Hills': ['Wild Turkey'],
  'Northern Green Mountains': ['Pine Grosbeak', 'Red Crossbill (Type 10)', 'Eastern Screech-Owl'],
  'Northern Vermont Piedmont': ['Common Raven', 'Barred Owl', 'Evening Grosbeak', 'Black-capped Chickadee'],
  'Southern Vermont Piedmont': ['Eastern Bluebird', 'Wood Duck'],
  'Southern Green Mountains': ['Blackpoll Warbler']
}

for (const [region, species] of Object.entries(expectedRegionSpecies)) {
  test(`regions assigns the ${region} test point(s) correctly`, async (t) => {
    quiet(t)
    const result = await regions({ input: SIGHTINGS })
    assert.deepEqual(result[region].species, species)
  })
}

// ---------------------------------------------------------------------------
// regions -- edge cases and filters
// ---------------------------------------------------------------------------

test('regions assigns a point on Lake Champlain (outside every polygon) via the nearest-town fallback', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS })
  assert.ok(result['Champlain Valley'].species.includes('Common Loon'))
})

test('regions excludes out-of-state checklists even when they are near a region', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS })
  const all = Object.values(result).flatMap(r => r.species)
  assert.ok(!all.includes('Tufted Titmouse'))
  assert.equal(all.length, 22) // 21 species; Black-capped Chickadee is in two regions
})

test('regions { year } counts only that year', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS, year: 2023 })
  assert.deepEqual(result['Champlain Valley'].species, [
    'American Robin', 'Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)', 'Common Loon'
  ])
  assert.equal(result['Taconic Mountains'].speciesTotal, 0)
})

test('regions { region } restricts the data to that region', async (t) => {
  quiet(t)
  const result = await regions({ input: SIGHTINGS, region: 'Northeastern Highlands' })
  assert.equal(result['Northeastern Highlands'].speciesTotal, 2)
  for (const name of REGION_NAMES.filter(n => n !== 'Northeastern Highlands')) {
    assert.equal(result[name].speciesTotal, 0, name)
  }
})

test('regions forces opts.state to "Vermont"', async (t) => {
  quiet(t)
  const opts = { input: SIGHTINGS, state: 'New Hampshire' }
  const result = await regions(opts)
  assert.equal(opts.state, 'Vermont')
  assert.equal(result['Vermont Valley'].speciesTotal, 1)
})

// ===========================================================================
// state
// ===========================================================================

test('state logs the Vermont species total first', async (t) => {
  quiet(t)
  await state({ input: SIGHTINGS })
  assert.deepEqual(logged()[0], [21])
})

test('state logs one line per date, oldest first, listing first-seen species', async (t) => {
  quiet(t)
  await state({ input: SIGHTINGS })
  assert.deepEqual(loggedLines().slice(1), [
    '2023-05-10: American Robin, Black-capped Chickadee, Blue Jay, Dark-eyed Junco (Slate-colored).',
    '2023-06-01: Common Raven, Barred Owl.',
    '2023-08-12: Boreal Chickadee, Canada Jay.',
    '2023-09-09: Common Loon.',
    '2023-10-10: Wild Turkey.',
    '2023-12-30: Pine Grosbeak, Red Crossbill (Type 10), Eastern Screech-Owl.',
    '2024-01-15: Snow Bunting, Bohemian Waxwing.',
    '2024-02-20: Evening Grosbeak.',
    '2024-03-15: Eastern Bluebird.',
    '2024-04-05: Wood Duck.',
    '2024-05-20: Cerulean Warbler.',
    '2024-06-10: Alder Flycatcher.',
    '2024-06-11: Blackpoll Warbler.'
  ])
})

test('state excludes out-of-state sightings, spuhs, hybrids and rows without coordinates', async (t) => {
  quiet(t)
  await state({ input: SIGHTINGS })
  const text = loggedLines().join('\n')
  for (const name of ['Tufted Titmouse', 'Red-winged Blackbird', 'duck sp.', 'Mallard x American Black Duck']) {
    assert.ok(!text.includes(name), name)
  }
})

test('state { year } counts only that year', async (t) => {
  quiet(t)
  await state({ input: SIGHTINGS, year: 2024 })
  const calls = logged()
  assert.deepEqual(calls[0], [10])
  assert.equal(calls[1][0], '2024-01-15: Snow Bunting, American Robin, Bohemian Waxwing.')
})

test('state forces opts.state to "Vermont"', async (t) => {
  quiet(t)
  const opts = { input: SIGHTINGS, state: 'New Hampshire' }
  await state(opts)
  assert.equal(opts.state, 'Vermont')
  assert.deepEqual(logged()[0], [21])
})

test('state normalises MM/DD/YYYY dates to YYYY-MM-DD and sorts them', async (t) => {
  quiet(t)
  await state({ input: SLASH_DATES })
  assert.deepEqual(loggedLines(), [
    '2',
    '2022-04-15: Song Sparrow.',
    '2022-05-02: Hermit Thrush.'
  ])
})

test('state on an empty CSV logs 0 and nothing else', async (t) => {
  quiet(t)
  await state({ input: EMPTY })
  assert.deepEqual(logged(), [[0]])
})

test('state resolves to { species, speciesByDate }', async (t) => {
  quiet(t)
  const result = await state({ input: SIGHTINGS })
  assert.deepEqual(Object.keys(result).sort(), ['species', 'speciesByDate'])
  assert.equal(result.species.length, 21)
  assert.deepEqual(result.species.slice(0, 4), ['American Robin', 'Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)'])
  assert.equal(new Set(result.species).size, 21)
})

test('state returns speciesByDate keyed by date with the first-seen rows', async (t) => {
  quiet(t)
  const result = await state({ input: SIGHTINGS, year: 2024 })
  assert.equal(result.species.length, 10)
  assert.deepEqual(result.speciesByDate['2024-01-15'].map(r => r['Common Name']), ['Snow Bunting', 'American Robin', 'Bohemian Waxwing'])
})

// ===========================================================================
// radialSearch
// ===========================================================================

// ---------------------------------------------------------------------------
// radialSearch -- return shape and logging
// ---------------------------------------------------------------------------

test('radialSearch logs the date format and centre coordinates', async (t) => {
  quiet(t)
  await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON })
  assert.deepEqual(logged()[0], ['YYYY-MM-DD', 44.4759, -73.2121])
})

test('radialSearch returns { species, speciesByDate, speciesTotal }', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON })
  assert.deepEqual(Object.keys(result).sort(), ['species', 'speciesByDate', 'speciesTotal'])
  assert.equal(result.speciesTotal, result.species.length)
})

test('radialSearch speciesByDate is keyed by date in chronological order', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON })
  assert.deepEqual(Object.keys(result.speciesByDate), ['2023-05-10', '2023-09-09', '2024-01-15'])
})

// ---------------------------------------------------------------------------
// radialSearch -- radius
// ---------------------------------------------------------------------------

test('radialSearch defaults to a 10-mile radius', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON })
  // Burlington points (0 mi) plus the Lake Champlain point (~6 mi).
  assert.deepEqual(result.species, [
    'American Robin', 'Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)',
    'Common Loon', 'Snow Bunting', 'Bohemian Waxwing'
  ])
})

test('radialSearch { distance: 1 } excludes the lake point ~6 miles away', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: 1 })
  assert.equal(result.speciesTotal, 6)
  assert.ok(!result.species.includes('Common Loon'))
})

test('radialSearch { distance: 20 } reaches Fairfax (~17 miles) but not Fayston (~26 miles)', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: 20 })
  assert.ok(result.species.includes('Wild Turkey'))
  assert.ok(!result.species.includes('Pine Grosbeak'))
})

test('radialSearch { distance: 40 } reaches Fayston and Montpelier (~35 miles)', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: 40 })
  for (const name of ['Pine Grosbeak', 'Common Raven', 'Evening Grosbeak']) {
    assert.ok(result.species.includes(name), name)
  }
  assert.ok(!result.species.includes('Wood Duck')) // Brattleboro is far south
})

test('radialSearch counts each species once, at its first date in range', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: 40 })
  assert.equal(result.species.filter(s => s === 'Black-capped Chickadee').length, 1)
  assert.equal(new Set(result.species).size, result.species.length)
})

test('radialSearch accepts the distance as a string', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: '1' })
  assert.equal(result.speciesTotal, 6)
})

// ---------------------------------------------------------------------------
// radialSearch -- edge cases
// ---------------------------------------------------------------------------

test('radialSearch includes out-of-state sightings inside the radius', async (t) => {
  quiet(t)
  // Hanover, NH is ~1.3 miles across the Connecticut River from the Norwich point.
  const result = await radialSearch({ input: SIGHTINGS, coordinates: HANOVER_NH, distance: 5 })
  assert.deepEqual(result.species, ['Tufted Titmouse', 'American Robin', 'Eastern Bluebird'])
})

test('radialSearch with a large radius covers every located sighting but not the row without coordinates', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: 1000 })
  assert.ok(!result.species.includes('Red-winged Blackbird'))
  assert.equal(result.speciesTotal, 22) // 21 Vermont species + Tufted Titmouse
})

test('radialSearch skips a row with blank coordinates instead of placing it at 0,0 ("Null Island")', async (t) => {
  quiet(t)
  // compare-latlong would coerce '' to 0, so the no-coordinates row must be
  // skipped before measuring.
  const nearNullIsland = await radialSearch({ input: SIGHTINGS, coordinates: [0, 0], distance: 1 })
  assert.deepEqual(nearNullIsland.species, [])
  const everywhere = await radialSearch({ input: SIGHTINGS, coordinates: [0, 0], distance: 100000 })
  assert.ok(!everywhere.species.includes('Red-winged Blackbird'))
  assert.equal(everywhere.speciesTotal, 22)
})

test('radialSearch with a centre far from every sighting returns nothing', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: NEW_YORK_CITY })
  assert.deepEqual(result.species, [])
  assert.equal(result.speciesTotal, 0)
  assert.deepEqual(result.speciesByDate, {})
})

test('radialSearch on an empty CSV returns an empty result', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: EMPTY, coordinates: BURLINGTON })
  assert.equal(result.speciesTotal, 0)
})

test('radialSearch { year } keeps only that year\'s sightings', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, year: 2024 })
  assert.deepEqual(result.species, ['Snow Bunting', 'American Robin', 'Bohemian Waxwing'])
  assert.deepEqual(Object.keys(result.speciesByDate), ['2024-01-15'])
})

test('radialSearch { after } keeps only sightings after that date', async (t) => {
  quiet(t)
  const result = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, after: '2023-06-01' })
  assert.deepEqual(Object.keys(result.speciesByDate), ['2023-09-09', '2024-01-15'])
  assert.deepEqual(result.species, ['Common Loon', 'Snow Bunting', 'American Robin', 'Bohemian Waxwing'])
})

test('radialSearch { distance: 0 } is a zero-mile radius, not the 10-mile default', async (t) => {
  quiet(t)
  // Only the sightings exactly at the centre; the lake point ~6 miles away is out.
  const atCentre = await radialSearch({ input: SIGHTINGS, coordinates: BURLINGTON, distance: 0 })
  assert.equal(atCentre.speciesTotal, 6)
  assert.ok(!atCentre.species.includes('Common Loon'))
  const nearby = await radialSearch({ input: SIGHTINGS, coordinates: [44.48, -73.21], distance: 0 })
  assert.equal(nearby.speciesTotal, 0)
})

// ===========================================================================
// quadBirds
// ===========================================================================

// A species "quads" once it has been seen on an eBird checklist (row with a
// Submission ID), photographed (Format = Photo) and audio-recorded
// (Format = Audio). quad-sightings.csv has the checklist rows,
// quad-media.csv has the media rows (no Submission ID).
//
//   Barred Owl      seen 2023-01-05, photo 2023-02-10, audio 2023-03-15 -> 2023-03-15
//   Tufted Titmouse seen 2023-02-02, photo 2023-02-03, audio 2023-02-04 -> 2023-02-04 (NH)
//   Wood Thrush     seen 2023-05-20, audio 2023-05-21, photo 2023-06-30 -> 2023-06-30
//   Veery           seen, photo and audio all on 2024-06-01              -> 2024-06-01
//   Blue Jay        seen + photo only                                    -> not complete
//   Common Loon     photo + audio but never on a checklist               -> not complete
//   gull sp.        spuh                                                 -> ignored

const summaryLine = () => loggedLines().at(-1)

test('quadBirds counts species seen, photographed and recorded across comma-separated files', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH })
  assert.equal(summaryLine(), 'You have seen, photographed, and recorded a total of 4 species.')
})

test('quadBirds with only checklist data (no media) counts zero', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_SIGHTINGS })
  assert.equal(summaryLine(), 'You have seen, photographed, and recorded a total of 0 species.')
})

test('quadBirds with only media data (no checklists) counts zero', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_MEDIA })
  assert.equal(summaryLine(), 'You have seen, photographed, and recorded a total of 0 species.')
})

test('quadBirds gives the same answer regardless of input file order', async (t) => {
  quiet(t)
  await quadBirds({ input: `${QUAD_MEDIA},${QUAD_SIGHTINGS}`, list: true })
  assert.deepEqual(loggedLines(), [
    '2023-02-04: Tufted Titmouse.',
    '2023-03-15: Barred Owl.',
    '2023-06-30: Wood Thrush.',
    '2024-06-01: Veery.',
    'You have seen, photographed, and recorded a total of 4 species.'
  ])
})

test('quadBirds { list } logs each completion date (the later of photo/audio), oldest first', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, list: true })
  const lines = loggedLines()
  assert.equal(lines.length, 5)
  assert.ok(lines.includes('2023-03-15: Barred Owl.')) // audio after photo
  assert.ok(lines.includes('2023-06-30: Wood Thrush.')) // photo after audio
})

test('quadBirds completes a species when photo and audio are on the same day', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, list: true })
  assert.ok(loggedLines().includes('2024-06-01: Veery.'))
})

test('quadBirds does not count a species that was never on a checklist', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, list: true })
  assert.ok(!loggedLines().some(l => l.includes('Common Loon')))
})

test('quadBirds does not count a species missing audio', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, list: true })
  assert.ok(!loggedLines().some(l => l.includes('Blue Jay')))
})

test('quadBirds ignores spuhs', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, list: true })
  assert.ok(!loggedLines().some(l => l.includes('gull')))
})

test('quadBirds without list logs only the summary line', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH })
  assert.equal(console.log.mock.calls.length, 1)
})

test('quadBirds { year } in the past says "saw" and names the year', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, year: 2023 })
  assert.equal(summaryLine(), 'You saw, photographed, and recorded a total of 3 species in 2023.')
})

test('quadBirds { year } equal to the current year says "have seen"', async (t) => {
  quiet(t)
  const year = moment().format('YYYY')
  await quadBirds({ input: QUAD_BOTH, year: Number(year) })
  assert.equal(summaryLine(), `You have seen, photographed, and recorded a total of 0 species in ${year}.`)
})

test('quadBirds { state: "Vermont" } drops the out-of-state species', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, state: 'Vermont', list: true })
  assert.ok(!loggedLines().some(l => l.includes('Tufted Titmouse')))
  assert.equal(summaryLine(), 'You have seen, photographed, and recorded a total of 3 species.')
})

test('quadBirds { county } restricts to that county', async (t) => {
  quiet(t)
  await quadBirds({ input: QUAD_BOTH, county: 'Chittenden' })
  assert.equal(summaryLine(), 'You have seen, photographed, and recorded a total of 0 species.')
})

test('quadBirds resolves to undefined', async (t) => {
  quiet(t)
  assert.equal(await quadBirds({ input: QUAD_BOTH }), undefined)
})

// ===========================================================================
// winterFinch
// ===========================================================================

test('winterFinch logs a finch block, a blank line, then an owl block (one line per county each)', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS })
  const lines = loggedLines()
  assert.equal(lines.length, COUNTY_NAMES.length * 2 + 1)
  assert.equal(lines[COUNTY_NAMES.length], '')
  assert.deepEqual(lines.slice(0, 14).map(l => l.split(' (')[0]), COUNTY_NAMES)
  assert.deepEqual(lines.slice(15).map(l => l.split(' (')[0]), COUNTY_NAMES)
})

test('winterFinch lists the winter finches found in each county', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS })
  const finches = loggedLines().slice(0, 14)
  assert.ok(finches.includes('Chittenden (2): Bohemian Waxwing, Snow Bunting.'))
  assert.ok(finches.includes('Essex (1): Boreal Chickadee.'))
  assert.ok(finches.includes('Washington (3): Evening Grosbeak, Pine Grosbeak, Red Crossbill.'))
})

test('winterFinch orders species by its own list, not by observation order', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS })
  // Snow Bunting was observed before Bohemian Waxwing, but waxwing comes first in the list.
  assert.ok(loggedLines().includes('Chittenden (2): Bohemian Waxwing, Snow Bunting.'))
})

test('winterFinch strips subspecies/type suffixes before matching ("Red Crossbill (Type 10)")', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS })
  const washington = loggedLines().find(l => l.startsWith('Washington'))
  assert.ok(washington.includes('Red Crossbill.'))
  assert.ok(!washington.includes('Type 10'))
})

test('winterFinch prints "(0)" with no colon for counties without matches', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS })
  const lines = loggedLines()
  assert.equal(lines[0], 'Addison (0)')
  assert.equal(lines[15], 'Addison (0)')
})

test('winterFinch lists owls in the second block', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS })
  const owls = loggedLines().slice(15)
  assert.ok(owls.find(l => l.startsWith('Washington')).includes(': Barred Owl'))
  assert.equal(owls.filter(l => !l.endsWith('(0)')).length, 1)
})

test('winterFinch { year } passes the year through to counties', async (t) => {
  quiet(t)
  await winterFinch({ input: SIGHTINGS, year: 2023 })
  const lines = loggedLines()
  assert.ok(lines.includes('Chittenden (0)')) // SNBU/BOWA were 2024
  assert.ok(lines.includes('Washington (2): Pine Grosbeak, Red Crossbill.')) // EVGR was 2024
})

test('winterFinch on an empty CSV prints (0) for every county', async (t) => {
  quiet(t)
  await winterFinch({ input: EMPTY })
  const lines = loggedLines().filter(l => l !== '')
  assert.equal(lines.length, 28)
  assert.ok(lines.every(l => l.endsWith('(0)')))
})

test('winterFinch resolves to undefined', async (t) => {
  quiet(t)
  assert.equal(await winterFinch({ input: SIGHTINGS }), undefined)
})

test.todo('winterFinch never matches Eastern Screech-Owl: its owl list spells it "Eastern Screech-owl" (index.js:289) but eBird uses "Eastern Screech-Owl", so the Fayston screech-owl is missing from the Washington owl line')

test.todo('winterFinch { county } throws "Cannot read properties of undefined (reading \'map\')": counties returns a single county entry when opts.county is set (index.js:270-272), and winterFinch (index.js:318-320) iterates its keys as if they were county names')
