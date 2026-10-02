import test, { before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import moment from 'moment'
import {
  csvToJsonHotspots,
  hotspotsForTown,
  unbirdedHotspots,
  townHotspots,
  weeksYouveBirdedAtHotspot
} from '../hotspots.js'
import hotspotsDefault from '../hotspots.js'
import { eBirdCountyIds, getAllTowns } from '../index.js'
import { townHotspotCounts, unvisitedHotspotsByTown, weeksReport } from '../reports.js'
import VermontHotspots from '../data/hotspots.json' with { type: 'json' }
import townBoundaries from '../geojson/vt_towns.json' with { type: 'json' }

// ---------------------------------------------------------------------------
// Isolation strategy
// ---------------------------------------------------------------------------
//
// csvToJsonHotspots, hotspotsForTown and unbirdedHotspots read and write the
// hard-coded, cwd-relative paths data/hotspots.json, data/novisits-hotspots.json
// and data/hotspotsList.md. To keep the committed files in data/ untouched,
// every test that touches those paths runs inside a throwaway sandbox:
//
//   1. fs.mkdtemp() a directory under os.tmpdir()
//   2. create data/ inside it and seed it with fixture files
//   3. process.chdir() into it
//   4. afterEach chdirs back and removes the sandbox
//
// hotspots.js only uses cwd-relative paths for those fs calls; its own imports
// (./data/hotspots.json, ./geojson/vt_towns.json, ./index.js, ...) are resolved
// relative to the module file, so they keep working after the chdir.
// node:test runs each test file in its own process, so the chdir cannot leak
// into other test files. Fixture inputs are always passed as absolute paths.
//
// townHotspots and weeksYouveBirdedAtHotspot read the *bundled* hotspot list
// (the static JSON import of data/hotspots.json). That is read-only public
// hotspot data, so those tests use it as-is and derive their expectations from
// it. townHotspots used to mutate that shared in-memory array, so a pristine
// copy is still restored before every test as a guard.
//
// The final test in this file re-hashes the committed data/ files and asserts
// they are byte-for-byte unchanged.

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const fixtures = fileURLToPath(new URL('./fixtures/hotspots/', import.meta.url))
const fixture = name => path.join(fixtures, name)
const originalCwd = process.cwd()

const committedDataFiles = ['hotspots.json', 'novisits-hotspots.json', 'hotspotsList.md']
const sha = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex')
const committedHashes = {}
for (const f of committedDataFiles) {
  committedHashes[f] = await sha(path.join(repoRoot, 'data', f))
}

// Pristine copy of the bundled hotspots, taken before any test runs.
const pristineHotspots = structuredClone(VermontHotspots)
function restoreBundledHotspots () {
  VermontHotspots.forEach((h, i) => {
    for (const key of Object.keys(h)) delete h[key]
    Object.assign(h, structuredClone(pristineHotspots[i]))
  })
}

let sandboxDir

// Create a temp dir with data/ (unless { dataDir: false }), seed it with
// { 'data/hotspots.json': contents, ... } and chdir into it.
async function sandbox (seed = {}, { dataDir = true } = {}) {
  sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-hotspots-'))
  if (dataDir) await fs.mkdir(path.join(sandboxDir, 'data'))
  for (const [rel, contents] of Object.entries(seed)) {
    await fs.writeFile(path.join(sandboxDir, rel), contents)
  }
  process.chdir(sandboxDir)
  return sandboxDir
}

const seedFixture = async name => fs.readFile(fixture(name), 'utf8')
const readSandboxJson = async rel => JSON.parse(await fs.readFile(path.join(sandboxDir, rel), 'utf8'))

beforeEach(() => {
  restoreBundledHotspots()
})

afterEach(async () => {
  process.chdir(originalCwd)
  if (sandboxDir) {
    await fs.rm(sandboxDir, { recursive: true, force: true })
    sandboxDir = undefined
  }
})

// Silence console.log and return a function that yields the logged argument lists.
function captureLog (t) {
  t.mock.method(console, 'log', () => {})
  return () => console.log.mock.calls.map(c => c.arguments)
}

// Build a minimal "My eBird Data" CSV from { id, loc, date, sci? } rows.
const EBIRD_HEADER = 'Submission ID,Common Name,Scientific Name,Taxonomic Order,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported,Number of Observers'
function ebirdCsv (rows) {
  return [EBIRD_HEADER, ...rows.map((r, i) => [
    r.id || `S8${String(i).padStart(8, '0')}`,
    r.common || 'Black-capped Chickadee',
    r.sci || 'Poecile atricapillus',
    31000, 1, 'US-VT', 'Washington', r.loc, 'Test location', 44.26, -72.57,
    r.date, '08:00 AM', 'eBird - Stationary Count', 30, 1, 1
  ].join(','))].join('\n') + '\n'
}

// A fake "My eBird Data" export for the unbirdedHotspots { input } tests. It is
// written to a temp dir at test time, under eBird's standard export name, so no
// file called MyEBirdData.csv is ever committed (.gitignore excludes that name
// to keep real personal exports out of the repo).
const MY_EBIRD_DATA_ROWS = [
  'S900000001,Black-capped Chickadee,Poecile atricapillus,31000,2,US-VT,Washington,L9000001,Test Pond (Montpelier),44.2601,-72.5754,2023-01-04,08:00 AM,eBird - Stationary Count,30,1,1',
  'S900000001,American Robin,Turdus migratorius,32000,1,US-VT,Washington,L9000001,Test Pond (Montpelier),44.2601,-72.5754,2023-01-04,08:00 AM,eBird - Stationary Count,30,1,1',
  'S900000002,Blue Jay,Cyanocitta cristata,30000,3,US-VT,Washington,L9000001,Test Pond (Montpelier),44.2601,-72.5754,2023-03-15,09:00 AM,eBird - Stationary Count,20,1,1',
  'S900000003,Blue Jay,Cyanocitta cristata,30000,1,US-VT,Washington,L9000001,Test Pond (Montpelier),44.2601,-72.5754,2024-03-13,09:00 AM,eBird - Stationary Count,20,1,1',
  'S900000004,duck sp.,Anatinae sp.,5000,4,US-VT,Rutland,L9000004,Test Park (Rutland),43.6106,-72.9726,2023-05-10,07:00 AM,eBird - Traveling Count,45,1,1',
  'S900000005,Common Raven,Corvus corax,29000,1,US-VT,Washington,L9000002,"Fake Marsh, North End",44.2650,-72.5800,2022-06-01,06:30 AM,eBird - Traveling Count,60,1,1',
  'S900000006,Mallard,Anas platyrhynchos,5100,6,US-VT,Washington,L1234567,Somebody\'s Backyard (personal location),44.2700,-72.5900,2023-03-16,10:00 AM,eBird - Stationary Count,15,1,1'
]
let myEBirdDataDir
let myEBirdData
before(async () => {
  myEBirdDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-myebirddata-'))
  myEBirdData = path.join(myEBirdDataDir, 'MyEBirdData.csv')
  await fs.writeFile(myEBirdData, [EBIRD_HEADER, ...MY_EBIRD_DATA_ROWS].join('\n') + '\n')
})
after(async () => {
  await fs.rm(myEBirdDataDir, { recursive: true, force: true })
})

// 52 Wednesdays in 2023, one in each locale week 1..52.
const wednesdays2023 = Array.from({ length: 52 }, (_, i) => moment('2023-01-04').add(i * 7, 'days').format('YYYY-MM-DD'))

// ===========================================================================
// exports
// ===========================================================================

test('named exports are the five hotspot functions', () => {
  for (const fn of [csvToJsonHotspots, hotspotsForTown, unbirdedHotspots, townHotspots, weeksYouveBirdedAtHotspot]) {
    assert.equal(typeof fn, 'function')
  }
})

test('default export exposes the same five functions', () => {
  assert.deepEqual(Object.keys(hotspotsDefault).sort(), [
    'csvToJsonHotspots', 'hotspotsForTown', 'townHotspots', 'unbirdedHotspots', 'weeksYouveBirdedAtHotspot'
  ])
  assert.equal(hotspotsDefault.townHotspots, townHotspots)
})

// ===========================================================================
// csvToJsonHotspots
// ===========================================================================

test('csvToJsonHotspots writes one record per CSV row to data/hotspots.json', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  assert.equal(data.length, 5)
  assert.deepEqual(data.map(x => x.ID), ['L9000001', 'L9000002', 'L9000003', 'L9000004', 'L9000005'])
})

test('csvToJsonHotspots prepends the eBird API header so records have named keys', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const [first] = await readSandboxJson('data/hotspots.json')
  assert.deepEqual(Object.keys(first), [
    'ID', 'Country', 'State/Province', 'Region', 'Latitude', 'Longitude', 'Name', 'Last visited', 'Species', 'Checklists'
  ])
})

test('csvToJsonHotspots keeps every value as a string (no dynamic typing)', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const [first] = await readSandboxJson('data/hotspots.json')
  assert.deepEqual(first, {
    ID: 'L9000001',
    Country: 'US',
    'State/Province': 'US-VT',
    Region: 'US-VT-023',
    Latitude: '44.2601',
    Longitude: '-72.5754',
    Name: 'Test Pond (Montpelier)',
    'Last visited': '2023-07-01 11:42',
    Species: '58',
    Checklists: ''
  })
})

test('csvToJsonHotspots reads the current API format (Checklists column, bare never-visited rows)', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api-current.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  assert.equal(data.length, 3)
  assert.equal(data[0].Checklists, '15')
  assert.equal(data[1].Name, 'Fake Marsh, North End')
  assert.deepEqual(data[2], {
    ID: 'L9000003',
    Country: 'US',
    'State/Province': 'US-VT',
    Region: 'US-VT-007',
    Latitude: '44.4759',
    Longitude: '-73.2121',
    Name: 'Test Waterfront (Burlington)',
    'Last visited': '',
    Species: '',
    Checklists: ''
  })
  assert.deepEqual((await readSandboxJson('data/novisits-hotspots.json')).map(x => x.ID), ['L9000003'])
})

test('csvToJsonHotspots parses quoted names containing commas', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  assert.equal(data[1].Name, 'Fake Marsh, North End')
  assert.equal(data[1]['Last visited'], '2019-05-16 08:00')
})

test('csvToJsonHotspots stores never-visited hotspots with empty Last visited / Species', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  const unvisited = data.find(x => x.ID === 'L9000003')
  assert.equal(unvisited['Last visited'], '')
  assert.equal(unvisited.Species, '')
})

test('csvToJsonHotspots does not create an empty record from the trailing newline', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  assert.ok(data.every(x => x.ID))
})

test('csvToJsonHotspots writes only never-visited hotspots to data/novisits-hotspots.json', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const novisits = await readSandboxJson('data/novisits-hotspots.json')
  assert.deepEqual(novisits.map(x => x.ID), ['L9000003', 'L9000005'])
  assert.ok(novisits.every(x => x['Last visited'] === ''))
})

test('csvToJsonHotspots writes the hotspot names, newline-separated, to data/hotspotsList.md', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const list = await fs.readFile(path.join(sandboxDir, 'data/hotspotsList.md'), 'utf8')
  assert.equal(list, [
    'Test Pond (Montpelier)',
    'Fake Marsh, North End',
    'Test Waterfront (Burlington)',
    'Test Park (Rutland)',
    'Test Gorge (Middlebury)'
  ].join('\n'))
})

test('csvToJsonHotspots writes compact (single-line) JSON', async () => {
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const raw = await fs.readFile(path.join(sandboxDir, 'data/hotspots.json'), 'utf8')
  assert.ok(!raw.includes('\n'))
})

test('csvToJsonHotspots resolves to undefined and logs nothing', async (t) => {
  const logs = captureLog(t)
  await sandbox()
  assert.equal(await csvToJsonHotspots({ input: fixture('hotspots-api.csv') }), undefined)
  assert.equal(logs().length, 0)
})

test('csvToJsonHotspots overwrites existing output files', async () => {
  await sandbox({
    'data/hotspots.json': '"stale"',
    'data/novisits-hotspots.json': '"stale"',
    'data/hotspotsList.md': 'stale'
  })
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  assert.equal((await readSandboxJson('data/hotspots.json')).length, 5)
  assert.equal((await readSandboxJson('data/novisits-hotspots.json')).length, 2)
  const list = await fs.readFile(path.join(sandboxDir, 'data/hotspotsList.md'), 'utf8')
  assert.ok(!list.includes('stale'))
})

test('csvToJsonHotspots on an empty input writes empty outputs', async () => {
  await sandbox({ 'empty.csv': '' })
  await csvToJsonHotspots({ input: path.join(sandboxDir, 'empty.csv') })
  assert.deepEqual(await readSandboxJson('data/hotspots.json'), [])
  assert.deepEqual(await readSandboxJson('data/novisits-hotspots.json'), [])
  assert.equal(await fs.readFile(path.join(sandboxDir, 'data/hotspotsList.md'), 'utf8'), '')
})

test('csvToJsonHotspots treats a header row in the input as data (it expects headerless API output)', async () => {
  const withHeader = 'ID,Country,State/Province,Region,Latitude,Longitude,Name,Last visited,Species\n' +
    await seedFixture('hotspots-api.csv')
  await sandbox({ 'with-header.csv': withHeader })
  await csvToJsonHotspots({ input: path.join(sandboxDir, 'with-header.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  assert.equal(data.length, 6)
  assert.equal(data[0].ID, 'ID')
  assert.equal(data[0].Name, 'Name')
})

test('csvToJsonHotspots writes relative to the cwd: rejects with ENOENT when ./data is missing', async () => {
  await sandbox({}, { dataDir: false })
  await assert.rejects(csvToJsonHotspots({ input: fixture('hotspots-api.csv') }), { code: 'ENOENT' })
})

test('csvToJsonHotspots rejects with ENOENT when the input file does not exist', async () => {
  await sandbox()
  await assert.rejects(csvToJsonHotspots({ input: path.join(sandboxDir, 'nope.csv') }), { code: 'ENOENT' })
  await assert.rejects(fs.access(path.join(sandboxDir, 'data/hotspots.json')))
})

test('csvToJsonHotspots strips \\r from CRLF input (the last column, Species, used to keep a trailing "\\r")', async () => {
  const crlf = (await seedFixture('hotspots-api.csv')).replace(/\n/g, '\r\n')
  await sandbox({ 'crlf.csv': crlf })
  await csvToJsonHotspots({ input: path.join(sandboxDir, 'crlf.csv') })
  const data = await readSandboxJson('data/hotspots.json')
  assert.equal(data[0].Species, '58')
})

// ===========================================================================
// hotspotsForTown
// ===========================================================================

test('hotspotsForTown reads data/hotspots.json from the cwd: rejects with ENOENT when absent', async () => {
  await sandbox()
  await assert.rejects(hotspotsForTown({ town: 'Montpelier' }), { code: 'ENOENT' })
})

test('hotspotsForTown returns the hotspots in the requested town (eBird API lat/lng records)', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  const result = await hotspotsForTown({ town: 'Montpelier' })
  assert.deepEqual(result.map(x => x.locId), ['L9000001', 'L9000002'])
})

test('hotspotsForTown matches the town name case-insensitively', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  const lower = await hotspotsForTown({ town: 'burlington' })
  const upper = await hotspotsForTown({ town: 'BURLINGTON' })
  assert.deepEqual(lower.map(x => x.locId), ['L9000003'])
  assert.deepEqual(upper.map(x => x.locId), ['L9000003'])
})

test('hotspotsForTown copies lat/lng into Latitude/Longitude and tags State and Town', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  const [rutland] = await hotspotsForTown({ town: 'Rutland City' })
  assert.equal(rutland.locId, 'L9000004')
  assert.equal(rutland.Latitude, 43.6106)
  assert.equal(rutland.Longitude, -72.9726)
  assert.equal(rutland.State, 'Vermont')
  assert.equal(rutland.Town, 'RUTLAND CITY')
  assert.equal(typeof rutland.Region, 'string')
})

test('hotspotsForTown accepts an array of towns', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  const result = await hotspotsForTown({ town: ['Montpelier', 'Rutland City'] })
  assert.deepEqual(result.map(x => x.locId).sort(), ['L9000001', 'L9000002', 'L9000004'])
})

test('hotspotsForTown returns [] for a town with no hotspots', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  assert.deepEqual(await hotspotsForTown({ town: 'Fayston' }), [])
})

test('hotspotsForTown with no town filter returns every hotspot that has coordinates', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  const result = await hotspotsForTown({})
  assert.deepEqual(result.map(x => x.locId), ['L9000001', 'L9000002', 'L9000003', 'L9000004'])
})

test('hotspotsForTown drops hotspots without coordinates', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots-latlng.json') })
  const result = await hotspotsForTown({})
  assert.ok(!result.some(x => x.locId === 'L9000006'))
})

test('hotspotsForTown on an empty hotspot list returns []', async () => {
  await sandbox({ 'data/hotspots.json': '[]' })
  assert.deepEqual(await hotspotsForTown({ town: 'Montpelier' }), [])
})

test('hotspotsForTown works on the data/hotspots.json that csvToJsonHotspots writes (Latitude / Longitude records)', async () => {
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots.json') })
  const result = await hotspotsForTown({ town: 'Montpelier' })
  assert.deepEqual(result.map(x => x.ID), ['L9000001', 'L9000002'])
})

// ===========================================================================
// unbirdedHotspots
// ===========================================================================

async function runUnbirded (t, opts, hotspots) {
  const logs = captureLog(t)
  await sandbox({
    'data/hotspots.json': hotspots ? JSON.stringify(hotspots) : await seedFixture('hotspots.json')
  })
  const ret = await unbirdedHotspots(opts)
  assert.equal(logs().length, 0)
  // As the CLI prints it: one array of "Name, Last visited"
  return { ret, logs: [[ret.map(x => `${x.Name}, ${x['Last visited']}`)]] }
}

const hs = (ID, lastVisited, Name = `Hotspot ${ID}`) => ({ ID, Name, 'Last visited': lastVisited })

test('unbirdedHotspots reads data/hotspots.json from the cwd: rejects with ENOENT when absent', async (t) => {
  captureLog(t)
  await sandbox()
  await assert.rejects(unbirdedHotspots({}), { code: 'ENOENT' })
})

test('unbirdedHotspots returns the hotspot records, without logging', async (t) => {
  const { ret } = await runUnbirded(t, {})
  assert.ok(ret.length > 0)
  assert.ok(ret.every(x => x.ID && x.Name))
})

test('unbirdedHotspots with no filters lists every hotspot as "Name, Last visited", oldest first', async (t) => {
  const { logs } = await runUnbirded(t, {})
  assert.deepEqual(logs[0][0], [
    'Test Park (Rutland), 2010-03-13 16:20',
    'Fake Marsh, North End, 2019-05-16 08:00',
    'Test Field (Burlington), 2021-09-10 07:15',
    'Test Pond (Montpelier), 2023-07-01 11:42'
  ])
})

test('unbirdedHotspots reads the sandbox hotspot list, not the bundled one', async (t) => {
  const { logs } = await runUnbirded(t, {}, [hs('L1', '2020-01-01 10:00', 'Only Sandbox Hotspot')])
  assert.deepEqual(logs[0][0], ['Only Sandbox Hotspot, 2020-01-01 10:00'])
})

test('unbirdedHotspots defaults opts.state to "Vermont" (mutating the caller\'s opts)', async (t) => {
  const opts = {}
  await runUnbirded(t, opts)
  assert.equal(opts.state, 'Vermont')
})

test('unbirdedHotspots keeps a caller-supplied state', async (t) => {
  const opts = { state: 'New Hampshire' }
  await runUnbirded(t, opts)
  assert.equal(opts.state, 'New Hampshire')
})

test('unbirdedHotspots prints never-visited hotspots with an empty date', async (t) => {
  const { logs } = await runUnbirded(t, {}, [hs('L1', '', 'Nobody Goes Here')])
  assert.deepEqual(logs[0][0], ['Nobody Goes Here, '])
})

test('unbirdedHotspots on an empty list prints []', async (t) => {
  const { logs } = await runUnbirded(t, {}, [])
  assert.deepEqual(logs[0][0], [])
})

test('unbirdedHotspots { input } drops hotspots you have a checklist at', async (t) => {
  const { logs } = await runUnbirded(t, { input: myEBirdData })
  // L9000001 and L9000002 have real-species checklists in MyEBirdData.csv;
  // L9000004 has a spuh-only checklist, which still counts as a visit.
  assert.deepEqual(logs[0][0], [
    'Test Field (Burlington), 2021-09-10 07:15'
  ])
})

test('unbirdedHotspots { input } ignores checklists at personal (non-hotspot) locations', async (t) => {
  const { logs } = await runUnbirded(t, { input: myEBirdData }, [hs('L9000007', '2021-09-10 07:15', 'Untouched')])
  assert.deepEqual(logs[0][0], ['Untouched, 2021-09-10 07:15'])
})

test('unbirdedHotspots { input } rejects with ENOENT when the eBird export is missing', async (t) => {
  captureLog(t)
  await sandbox({ 'data/hotspots.json': await seedFixture('hotspots.json') })
  await assert.rejects(unbirdedHotspots({ input: path.join(sandboxDir, 'missing.csv') }), { code: 'ENOENT' })
})

test('unbirdedHotspots { input } counts a checklist that only recorded a spuh as a visit (the "duck sp."-only checklist at L9000004)', async (t) => {
  const { logs } = await runUnbirded(t, { input: myEBirdData })
  assert.ok(!logs[0][0].some(line => line.startsWith('Test Park (Rutland)')))
})

test('unbirdedHotspots { currentYear } drops hotspots visited this calendar year', async (t) => {
  const thisYear = moment().year()
  const { logs } = await runUnbirded(t, { currentYear: true }, [
    hs('L1', `${thisYear}-01-02 08:00`, 'Visited This Year'),
    hs('L2', `${thisYear - 1}-12-31 08:00`, 'Visited Last Year')
  ])
  assert.deepEqual(logs[0][0], [`Visited Last Year, ${thisYear - 1}-12-31 08:00`])
})

test('unbirdedHotspots { currentYear } keeps never-visited hotspots', async (t) => {
  const { logs } = await runUnbirded(t, { currentYear: true }, [hs('L1', '', 'Never Visited')])
  assert.deepEqual(logs[0][0], ['Never Visited, '])
})

test('unbirdedHotspots { currentYear } understands MM/DD/YYYY dates', async (t) => {
  const thisYear = moment().year()
  const { logs } = await runUnbirded(t, { currentYear: true }, [
    hs('L1', `01/02/${thisYear}`, 'US Format This Year')
  ])
  assert.deepEqual(logs[0][0], [])
})

test('unbirdedHotspots { currentYear } follows the (mocked) clock', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2019-08-01T12:00:00') })
  const { logs } = await runUnbirded(t, { currentYear: true })
  assert.ok(!logs[0][0].some(line => line.includes('2019-05-16')))
  assert.equal(logs[0][0].length, 3)
})

test('unbirdedHotspots { sinceYear } keeps hotspots last visited in or before that year', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: 2019 })
  assert.deepEqual(logs[0][0], [
    'Test Park (Rutland), 2010-03-13 16:20',
    'Fake Marsh, North End, 2019-05-16 08:00'
  ])
})

test('unbirdedHotspots { sinceYear } boundary: a visit during sinceYear itself is kept', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: 2023 })
  assert.equal(logs[0][0].length, 4)
})

test('unbirdedHotspots { sinceYear } drops everything visited after an early year', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: 2000 })
  assert.deepEqual(logs[0][0], [])
})

test('unbirdedHotspots { sinceYear } accepts the year as a string (as the CLI passes it)', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: '2019' })
  assert.equal(logs[0][0].length, 2)
})

test('unbirdedHotspots { sinceYear } understands MM/DD/YYYY dates', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: 2015 }, [
    hs('L1', '03/13/2010', 'Old US Format'),
    hs('L2', '03/13/2020', 'New US Format')
  ])
  assert.deepEqual(logs[0][0], ['Old US Format, 03/13/2010'])
})

test('unbirdedHotspots { sinceYear } keeps never-visited hotspots, like { currentYear } does', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: 2019 }, [hs('L1', '', 'Never Visited')])
  assert.deepEqual(logs[0][0], ['Never Visited, '])
})

test('unbirdedHotspots combines { sinceYear } with { input }', async (t) => {
  const { logs } = await runUnbirded(t, { sinceYear: 2021, input: myEBirdData })
  // 2019 Fake Marsh and 2010 Test Park (spuh-only) are dropped by the eBird
  // export; 2023 Test Pond by sinceYear.
  assert.deepEqual(logs[0][0], [
    'Test Field (Burlington), 2021-09-10 07:15'
  ])
})

test('unbirdedHotspots combines { currentYear } with { sinceYear }', async (t) => {
  const thisYear = moment().year()
  const { logs } = await runUnbirded(t, { currentYear: true, sinceYear: thisYear - 5 }, [
    hs('L1', `${thisYear}-01-02 08:00`, 'This Year'),
    hs('L2', `${thisYear - 3}-01-02 08:00`, 'Three Years Ago'),
    hs('L3', `${thisYear - 10}-01-02 08:00`, 'Ten Years Ago'),
    hs('L4', '', 'Never')
  ])
  assert.deepEqual(logs[0][0], ['Never, ', `Ten Years Ago, ${thisYear - 10}-01-02 08:00`])
})

test('unbirdedHotspots sorts a list mixing visited and never-visited hotspots consistently', async (t) => {
  const { logs } = await runUnbirded(t, {}, [
    hs('L1', '2020-01-01 08:00', 'Newer'),
    hs('L2', '', 'Never'),
    hs('L3', '2010-01-01 08:00', 'Older')
  ])
  const dated = logs[0][0].filter(line => !line.endsWith(', '))
  assert.deepEqual(dated, ['Older, 2010-01-01 08:00', 'Newer, 2020-01-01 08:00'])
})

test('unbirdedHotspots lists never-visited hotspots first, then oldest visit first', async (t) => {
  const { logs } = await runUnbirded(t, {}, [
    hs('L1', '2020-01-01 08:00', 'Newer'),
    hs('L2', '', 'Never'),
    hs('L3', '2010-01-01 08:00', 'Older'),
    hs('L4', '', 'Also Never')
  ])
  assert.deepEqual(logs[0][0], ['Never, ', 'Also Never, ', 'Older, 2010-01-01 08:00', 'Newer, 2020-01-01 08:00'])
})

// ===========================================================================
// townHotspots (reads the bundled data/hotspots.json import)
// ===========================================================================

const pristineUnvisitedIds = () => pristineHotspots.filter(x => !x['Last visited']).map(x => x.ID).sort()
const allTowns = Object.keys(getAllTowns(townBoundaries)).sort((a, b) => a.localeCompare(b))

test('townHotspots with no mode option returns the located hotspots and logs nothing', async (t) => {
  const logs = captureLog(t)
  const result = await townHotspots({})
  assert.ok(result.length > 0)
  assert.ok(result.every(x => x.State === 'Vermont'))
  assert.equal(logs().length, 0)
})

test('townHotspots defaults opts.state to "Vermont" (mutating the caller\'s opts)', async (t) => {
  captureLog(t)
  const opts = {}
  await townHotspots(opts)
  assert.equal(opts.state, 'Vermont')
})

test('townHotspots { noVisits } returns exactly the bundled hotspots with no Last visited', async (t) => {
  captureLog(t)
  const result = await townHotspots({ noVisits: true })
  assert.deepEqual(result.map(x => x.ID).sort(), pristineUnvisitedIds())
})

test('townHotspots { noVisits } without { print } logs nothing', async (t) => {
  const logs = captureLog(t)
  await townHotspots({ noVisits: true })
  assert.equal(logs().length, 0)
})

test('townHotspots { noVisits } derives County from the eBird region code', async (t) => {
  captureLog(t)
  const result = await townHotspots({ noVisits: true })
  const regionById = Object.fromEntries(pristineHotspots.map(x => [x.ID, x.Region]))
  for (const h of result) {
    assert.equal(h.County, eBirdCountyIds[Number(regionById[h.ID].split('US-VT-')[1])])
  }
})

test('townHotspots { noVisits } tags each hotspot with a Town and a biophysical Region', async (t) => {
  captureLog(t)
  const result = await townHotspots({ noVisits: true })
  assert.ok(result.length > 0)
  for (const h of result) {
    assert.equal(h.State, 'Vermont')
    assert.equal(typeof h.Town, 'string')
    // locationFilter overwrites the eBird region code with a biophysical region name.
    assert.ok(!h.Region.startsWith('US-VT-'))
  }
})

test('townHotspots { noVisits, county } narrows to one county', async (t) => {
  captureLog(t)
  const result = await townHotspots({ noVisits: true, county: 'Chittenden' })
  const expected = pristineHotspots.filter(x => !x['Last visited'] && x.Region === 'US-VT-007').map(x => x.ID).sort()
  assert.deepEqual(result.map(x => x.ID).sort(), expected)
  assert.ok(result.every(x => x.County === 'Chittenden'))
})

test('townHotspots { noVisits, print } prints a header, then "Town: N" and links per town', async (t) => {
  captureLog(t)
  const result = await townHotspots({ noVisits: true, print: true })
  const lines = unvisitedHotspotsByTown(result, allTowns)
  assert.equal(lines[0], 'Towns with unvisited hotspots:')
  const countLines = lines.filter(l => /^[A-Z][^:]*: \d+$/.test(l))
  assert.ok(countLines.length > 0)
  const linkLines = lines.filter(l => l.includes('https://ebird.org/hotspot/'))
  // One indented link line per hotspot, under its town's count
  assert.equal(linkLines.length, countLines.reduce((sum, l) => sum + Number(l.split(': ')[1]), 0))
  assert.equal(lines.length, 1 + countLines.length + linkLines.length)
  // Every printed link refers to a returned (unvisited) hotspot.
  const ids = new Set(result.map(x => x.ID))
  for (const m of linkLines.join('\n').matchAll(/https:\/\/ebird\.org\/hotspot\/(L\d+)/g)) {
    assert.ok(ids.has(m[1]))
  }
})

test('townHotspots { noVisits, print } lists towns alphabetically with Title Case names', async (t) => {
  captureLog(t)
  const lines = unvisitedHotspotsByTown(await townHotspots({ noVisits: true, print: true }), allTowns)
  const towns = lines.filter(l => /^[A-Z][^:]*: \d+$/.test(l)).map(l => l.split(':')[0])
  assert.deepEqual(towns, [...towns].sort((a, b) => a.localeCompare(b)))
  assert.ok(towns.every(t => t !== t.toUpperCase() || t.length === 1))
})

test('townHotspots { noVisits } takes precedence over { all }', async (t) => {
  const logs = captureLog(t)
  const result = await townHotspots({ noVisits: true, all: true })
  assert.equal(logs().length, 0)
  assert.deepEqual(result.map(x => x.ID).sort(), pristineUnvisitedIds())
})

test('townHotspots { noVisits, town } returns only that town\'s unvisited hotspots (town is also a location filter)', async (t) => {
  const logs = captureLog(t)
  const all = await townHotspots({ noVisits: true })
  const town = all[0].Town
  const expected = all.filter(x => x.Town === town).map(x => x.ID).sort()
  restoreBundledHotspots()
  const result = await townHotspots({ noVisits: true, town })
  assert.equal(logs().length, 0)
  assert.deepEqual(result.map(x => x.ID).sort(), expected)
})

test('townHotspots { all } prints a header and one "Town: N" line per Vermont town', async (t) => {
  captureLog(t)
  const lines = townHotspotCounts(await townHotspots({ all: true }), allTowns)
  assert.equal(lines[0], 'Town hotspots:')
  assert.equal(lines.length, 1 + allTowns.length)
  assert.ok(lines.slice(1).every(l => /^.+: \d+$/.test(l)))
})

test('townHotspots { all } prints towns in alphabetical order', async (t) => {
  captureLog(t)
  const lines = townHotspotCounts(await townHotspots({ all: true }), allTowns)
  const names = lines.slice(1).map(l => l.split(':')[0].toUpperCase())
  assert.deepEqual(names, allTowns)
})

test('townHotspots { all } per-town count matches { town } for the same town', async (t) => {
  captureLog(t)
  const line = townHotspotCounts(await townHotspots({ all: true }), allTowns).find(l => l.startsWith('Montpelier:'))
  const allCount = Number(line.split(': ')[1])
  restoreBundledHotspots()
  assert.equal((await townHotspots({ town: 'Montpelier' })).length, allCount)
  assert.ok(allCount > 0)
})

test('townHotspots { town } returns the hotspots in that town, without logging', async (t) => {
  const logs = captureLog(t)
  const hotspots = await townHotspots({ town: 'Middlebury' })
  assert.equal(logs().length, 0)
  assert.ok(hotspots.length > 0)
  assert.ok(hotspots.every(x => x.Town === 'MIDDLEBURY' && x.County === 'Addison'))
})

test('townHotspots { town } is case-insensitive', async (t) => {
  captureLog(t)
  const lower = (await townHotspots({ town: 'middlebury' })).map(x => x.ID)
  restoreBundledHotspots()
  assert.deepEqual((await townHotspots({ town: 'MIDDLEBURY' })).map(x => x.ID), lower)
})

test('townHotspots { town } returns [] for a name that is not a Vermont town', async (t) => {
  captureLog(t)
  assert.deepEqual(await townHotspots({ town: 'Atlantis' }), [])
})

test('townHotspots does not mutate the shared bundled hotspot records', async (t) => {
  captureLog(t)
  await townHotspots({ noVisits: true })
  assert.deepEqual(VermontHotspots, pristineHotspots)
})

test('townHotspots is callable twice in one process, with the same result', async (t) => {
  captureLog(t)
  const first = await townHotspots({ noVisits: true })
  const second = await townHotspots({ noVisits: true })
  assert.deepEqual(second, first)
})

test('townHotspots { all } counts every hotspot, including towns resolved by the nearest-town fallback', async (t) => {
  captureLog(t)
  const lines = townHotspotCounts(await townHotspots({ all: true }), allTowns)
  const total = lines.slice(1).reduce((sum, l) => sum + Number(l.split(': ')[1]), 0)
  assert.equal(total, pristineHotspots.length)
})

// ===========================================================================
// weeksYouveBirdedAtHotspot
// ===========================================================================

async function runWeeks (t, opts, rows) {
  const logs = captureLog(t)
  let input = opts.input
  if (rows) {
    await sandbox({ 'MyEBirdData.csv': ebirdCsv(rows) })
    input = path.join(sandboxDir, 'MyEBirdData.csv')
  }
  const ret = await weeksYouveBirdedAtHotspot({ ...opts, input })
  // What the CLI prints; the function itself logs nothing
  assert.equal(logs().length, 0)
  return { ret, lines: weeksReport(ret) }
}

const unbirdedLine = lines => lines.find(l => typeof l === 'string' && l.startsWith("You've not birded here on weeks:"))
const unbirdedWeeks = lines => unbirdedLine(lines).replace("You've not birded here on weeks: ", '').replace(/\.$/, '').split(', ').map(Number)
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

test('weeksYouveBirdedAtHotspot lists the weeks you have not birded at the location', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L9000001', input: myEBirdData })
  // Test Pond has checklists in week 1 (2023-01-04) and week 11 (2023-03-15, 2024-03-13).
  assert.deepEqual(unbirdedWeeks(lines), [...range(2, 10), ...range(12, 52)])
})

test('weeksYouveBirdedAtHotspot returns the unbirded weeks and the next one', async (t) => {
  const { ret } = await runWeeks(t, { id: 'L9000001', input: myEBirdData })
  assert.deepEqual(Object.keys(ret).sort(), ['id', 'name', 'nextWeek', 'nextWeekStart', 'unbirdedWeeks'])
  assert.equal(ret.id, 'L9000001')
  assert.ok(ret.unbirdedWeeks.includes(ret.nextWeek))
  assert.match(ret.nextWeekStart, /^\d{4}-\d{2}-\d{2}$/)
})

test('weeksYouveBirdedAtHotspot counts the same week-of-year across different years once', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L1' }, [
    { loc: 'L1', date: '2023-03-15' },
    { loc: 'L1', date: '2024-03-13' }
  ])
  assert.equal(unbirdedWeeks(lines).length, 51)
  assert.ok(!unbirdedWeeks(lines).includes(11))
})

test('weeksYouveBirdedAtHotspot counts several checklists in one week once', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L1' }, [
    { loc: 'L1', date: '2023-03-12' },
    { loc: 'L1', date: '2023-03-15' },
    { loc: 'L1', date: '2023-03-18' }
  ])
  assert.deepEqual(unbirdedWeeks(lines), [...range(1, 10), ...range(12, 52)])
})

test('weeksYouveBirdedAtHotspot uses Sunday-start locale weeks', async (t) => {
  // Sat 2023-03-11 is week 10; Sun 2023-03-12 starts week 11.
  const { lines } = await runWeeks(t, { id: 'L1' }, [{ loc: 'L1', date: '2023-03-11' }])
  assert.ok(!unbirdedWeeks(lines).includes(10))
  assert.ok(unbirdedWeeks(lines).includes(11))
})

test('weeksYouveBirdedAtHotspot ignores checklists at other locations', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L1' }, [
    { loc: 'L2', date: '2023-03-15' },
    { loc: 'L1', date: '2023-01-04' }
  ])
  assert.deepEqual(unbirdedWeeks(lines), range(2, 52))
})

test('weeksYouveBirdedAtHotspot with no checklists at the location lists all 52 weeks', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L9999999', input: myEBirdData })
  assert.deepEqual(unbirdedWeeks(lines), range(1, 52))
})

test('weeksYouveBirdedAtHotspot "next unbirded week" follows the mocked year', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2023-06-01T12:00:00') })
  const { lines } = await runWeeks(t, { id: 'L9999999', input: myEBirdData })
  // 2023-06-01 is a Thursday in week 22; week 23 starts Sunday, June 4th.
  assert.ok(lines.includes('The next unbirded week (#23) starts on Sunday, June 4th.'))
})

test('weeksYouveBirdedAtHotspot "next unbirded week" skips weeks you have birded', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2024-03-06T12:00:00') })
  const { lines } = await runWeeks(t, { id: 'L9000001', input: myEBirdData })
  // 2024-03-06 is in week 10; week 11 is birded, so the next is week 12 (Sunday, March 17th).
  assert.ok(lines.includes('The next unbirded week (#12) starts on Sunday, March 17th.'))
})

test('weeksYouveBirdedAtHotspot "next unbirded week" wraps to next year after the last unbirded week', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2023-12-28T12:00:00') })
  const { lines } = await runWeeks(t, { id: 'L9000001', input: myEBirdData })
  // 2023-12-28 is in week 52; week 1 is birded, so the next is week 2 of 2024.
  assert.ok(lines.includes('The next unbirded week (#2) starts on Sunday, January 7th.'))
})

test('weeksYouveBirdedAtHotspot "next unbirded week" uses the week-year for late-December days in week 1', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2023-12-31T12:00:00') })
  const { lines } = await runWeeks(t, { id: 'L9999999', input: myEBirdData })
  // Sunday 2023-12-31 starts week 1 of 2024, so the next unbirded week is week 2 of 2024.
  assert.ok(lines.includes('The next unbirded week (#2) starts on Sunday, January 7th.'))
})

test('weeksYouveBirdedAtHotspot frames its output with blank lines and a caveat', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L9000001', input: myEBirdData })
  assert.equal(lines[0], '')
  assert.equal(lines.at(-1), '')
  assert.equal(lines.at(-2), 'Note this only takes into account your bird sightings, not the databases.')
  assert.equal(lines.length, 5)
})

test('weeksYouveBirdedAtHotspot congratulates you by hotspot name after all 52 weeks', async (t) => {
  const hotspot = pristineHotspots[0]
  const { lines } = await runWeeks(t, { id: hotspot.ID }, wednesdays2023.map(date => ({ loc: hotspot.ID, date })))
  assert.ok(lines.includes(`You've birded at ${hotspot.Name} every week of the calendar year!`))
  assert.equal(unbirdedLine(lines), undefined)
})

test('weeksYouveBirdedAtHotspot rejects with ENOENT when the eBird export is missing', async (t) => {
  captureLog(t)
  await assert.rejects(weeksYouveBirdedAtHotspot({ id: 'L1', input: path.join(os.tmpdir(), 'ebird-ext-does-not-exist.csv') }), { code: 'ENOENT' })
})

test('weeksYouveBirdedAtHotspot rejects when no --id is given', async (t) => {
  captureLog(t)
  await assert.rejects(weeksYouveBirdedAtHotspot({ input: myEBirdData }), /Get the ID for this location first, manually\. Send it as --id\./)
})

test('weeksYouveBirdedAtHotspot falls back to the generic message after 52 weeks at a non-hotspot location', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L1234567' }, wednesdays2023.map(date => ({ loc: 'L1234567', date })))
  assert.ok(lines.includes("You've birded at this location every week of the year!"))
})

test('weeksYouveBirdedAtHotspot folds locale week 53 (e.g. 2022-12-31) into week 52', async (t) => {
  const hotspot = pristineHotspots[0]
  const dates = [...wednesdays2023, '2022-12-31']
  const { lines } = await runWeeks(t, { id: hotspot.ID }, dates.map(date => ({ loc: hotspot.ID, date })))
  assert.ok(lines.includes(`You've birded at ${hotspot.Name} every week of the calendar year!`))
})

test('weeksYouveBirdedAtHotspot does not claim "every week" when a week is missing but a week-53 visit is present', async (t) => {
  const hotspot = pristineHotspots[0]
  const dates = [...wednesdays2023.filter((_, i) => i !== 29), '2022-12-31']
  const { lines } = await runWeeks(t, { id: hotspot.ID }, dates.map(date => ({ loc: hotspot.ID, date })))
  assert.deepEqual(unbirdedWeeks(lines), [30])
})

test('weeksYouveBirdedAtHotspot "next unbirded week" is the next one after today, not the first of the year', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2024-06-01T12:00:00') })
  const { lines } = await runWeeks(t, { id: 'L9000001', input: myEBirdData })
  // 2024-06-01 is a Saturday in week 22; week 23 starts Sunday, June 2nd.
  assert.ok(lines.includes('The next unbirded week (#23) starts on Sunday, June 2nd.'))
})

test('weeksYouveBirdedAtHotspot counts a week whose only checklist recorded a spuh', async (t) => {
  const { lines } = await runWeeks(t, { id: 'L9000004', input: myEBirdData })
  // The only checklist at L9000004 is a "duck sp." on 2023-05-10 (week 19).
  assert.ok(!unbirdedWeeks(lines).includes(19))
})

// ===========================================================================
// Integration and isolation guard
// ===========================================================================

test('csvToJsonHotspots output feeds unbirdedHotspots in the same sandbox', async (t) => {
  const logs = captureLog(t)
  await sandbox()
  await csvToJsonHotspots({ input: fixture('hotspots-api.csv') })
  const printed = (await unbirdedHotspots({ sinceYear: 2019 })).map(x => `${x.Name}, ${x['Last visited']}`)
  assert.equal(logs().length, 0)
  assert.ok(printed.includes('Test Park (Rutland), 2010-03-13 16:20'))
  assert.ok(printed.includes('Fake Marsh, North End, 2019-05-16 08:00'))
  assert.ok(!printed.some(l => l.startsWith('Test Pond')))
})

test('the committed data/ files were not modified by this test file', async () => {
  assert.equal(process.cwd(), originalCwd)
  for (const f of committedDataFiles) {
    assert.equal(await sha(path.join(repoRoot, 'data', f)), committedHashes[f], `data/${f} changed`)
  }
})
