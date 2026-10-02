import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import * as index from '../index.js'
import {
  biggestTime,
  firstTimes,
  daylistTargets
} from '../index.js'

// Tests for the time-period and "first sightings" functions in index.js:
//
//   biggestTime(timespan, opts)  -> the period (day / month / year) with the
//                                   most unique species
//   firstTimes(timespan, opts)   -> the period in which the most species were
//                                   seen for the first time ("lifers")
//   daylistTargets(opts)         -> with opts.today, logs every Vermont
//                                   species NOT yet recorded in Vermont on
//                                   today's calendar date (month + day, any
//                                   year) -- the day's targets
//
// All of them read an eBird "My eBird Data" CSV from opts.input via getData,
// which parses with Papa (header: true) and runs filters.removeSpuh (drops
// spuhs / hybrids / slashes / domestics and collapses trinomials to binomials).
//
// biggestTime and firstTimes return the first entry of
// filters.createPeriodArray, i.e. { Date, SpeciesTotal, Species }. That array
// is `_.sortBy(periods, 'SpeciesTotal').reverse()`, so on a TIE the period
// that was inserted LAST into the grouping object wins. For day and month keys
// ("2024-01-01", "2024-01") insertion order is file order (biggestTime) or
// chronological order (firstTimes). Year keys ("2023") are integer-like, so
// JavaScript orders them numerically regardless of insertion -- ties go to
// the later year.
//
// Fixtures live in test/fixtures/index-time/. Ad-hoc cases are written as CSV
// to a temp directory under os.tmpdir() and removed after the run.

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = name => path.join(here, 'fixtures', 'index-time', name)

const BASIC = fixture('basic.csv')
const BASIC_SLASH = fixture('basic-slash-dates.csv')
const HEADER_ONLY = fixture('header-only.csv')
const DAYLIST = fixture('daylist.csv')

// ---------------------------------------------------------------------------
// Temp CSV helper
// ---------------------------------------------------------------------------

const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-index-time-'))
let tmpCount = 0

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

// Montpelier, VT -- inside Washington County, so locationFilter's
// point-in-polygon lookups succeed.
const VT = { 'State/Province': 'US-VT', County: 'Washington', Latitude: '44.2601', Longitude: '-72.5754' }

function row (common, sci, date, extra = {}) {
  return {
    'Submission ID': extra['Submission ID'] || 'S999999999',
    'Common Name': common,
    'Scientific Name': sci,
    Count: '1',
    ...VT,
    Location: 'Test Location',
    Date: date,
    ...extra
  }
}

async function csv (rows) {
  const file = path.join(tmpDir, `data-${++tmpCount}.csv`)
  await fs.writeFile(file, Papa.unparse(rows))
  return file
}

const names = period => period.Species.map(s => s['Common Name']).sort()

// ===========================================================================
// biggestTime -- timespan options
// ===========================================================================

test('biggestTime("day") returns the day with the most unique species', async () => {
  const result = await biggestTime('day', { input: BASIC })
  assert.equal(result.Date, '2024-01-01')
  assert.equal(result.SpeciesTotal, 6)
})

test('biggestTime("month") returns the month with the most unique species', async () => {
  const result = await biggestTime('month', { input: BASIC })
  assert.equal(result.Date, '2024-01')
  assert.equal(result.SpeciesTotal, 6)
})

test('biggestTime("year") returns the year with the most unique species', async () => {
  const result = await biggestTime('year', { input: BASIC })
  assert.equal(result.Date, '2024')
  // 6 in January + Yellow Warbler, Song Sparrow, Common Yellowthroat,
  // Red-winged Blackbird in May. The spuh (Poecile sp.) is excluded.
  assert.equal(result.SpeciesTotal, 10)
})

test('biggestTime("year") counts a species seen in several months only once', async () => {
  const result = await biggestTime('year', { input: BASIC })
  const warblers = result.Species.filter(s => s['Common Name'] === 'Yellow Warbler')
  assert.equal(warblers.length, 1)
})

test('biggestTime rejects an unknown timespan', async () => {
  await assert.rejects(
    biggestTime('week', { input: BASIC }),
    /Unable to parse timespan\. Must be: year, month, or day\./
  )
})

test('biggestTime timespan is case-sensitive ("Day" is rejected)', async () => {
  await assert.rejects(biggestTime('Day', { input: BASIC }), /Unable to parse timespan/)
})

test('biggestTime rejects the timespan before touching the input file', async () => {
  // A nonexistent input would reject with ENOENT; the timespan error wins.
  await assert.rejects(
    biggestTime('fortnight', { input: path.join(tmpDir, 'does-not-exist.csv') }),
    /Unable to parse timespan/
  )
})

test('biggestTime with no timespan groups by full local ISO timestamp (per day)', async () => {
  // parseDateFormat returns undefined for a falsy timespan, and
  // moment#format(undefined) emits an ISO-8601 string with the local offset.
  const result = await biggestTime(undefined, { input: BASIC })
  assert.match(result.Date, /^2024-01-01T00:00:00[+-]\d{2}:\d{2}$/)
  assert.equal(result.SpeciesTotal, 6)
})

// ===========================================================================
// biggestTime -- return shape
// ===========================================================================

test('biggestTime returns an object with exactly Date, SpeciesTotal, Species', async () => {
  const result = await biggestTime('day', { input: BASIC })
  assert.deepEqual(Object.keys(result), ['Date', 'SpeciesTotal', 'Species'])
  assert.equal(typeof result.Date, 'string')
  assert.equal(typeof result.SpeciesTotal, 'number')
  assert.ok(Array.isArray(result.Species))
})

test('biggestTime SpeciesTotal equals Species.length', async () => {
  for (const span of ['day', 'month', 'year']) {
    const result = await biggestTime(span, { input: BASIC })
    assert.equal(result.SpeciesTotal, result.Species.length, span)
  }
})

test('biggestTime Species entries are the raw CSV row objects', async () => {
  const result = await biggestTime('day', { input: BASIC })
  const nuthatch = result.Species.find(s => s['Common Name'] === 'White-breasted Nuthatch')
  assert.equal(nuthatch['Scientific Name'], 'Sitta carolinensis')
  assert.equal(nuthatch['Submission ID'], 'S900000003')
  assert.equal(nuthatch.County, 'Washington')
  assert.equal(nuthatch.Date, '2024-01-01')
})

test('biggestTime lists the expected species for the biggest day', async () => {
  const result = await biggestTime('day', { input: BASIC })
  assert.deepEqual(names(result), [
    'American Crow',
    'Black-capped Chickadee',
    'Blue Jay',
    'Downy Woodpecker',
    'Hairy Woodpecker',
    'White-breasted Nuthatch'
  ])
})

test('biggestTime does not log to the console', async (t) => {
  t.mock.method(console, 'log', () => {})
  await biggestTime('day', { input: BASIC })
  assert.equal(console.log.mock.calls.length, 0)
})

// ===========================================================================
// biggestTime -- species counting rules
// ===========================================================================

test('biggestTime counts a species seen on several checklists in one day once', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01', { 'Submission ID': 'S1' }),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01', { 'Submission ID': 'S2' }),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01', { 'Submission ID': 'S3' })
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.SpeciesTotal, 1)
  // _.uniqBy keeps the first occurrence.
  assert.equal(result.Species[0]['Submission ID'], 'S1')
})

test('biggestTime excludes spuhs, hybrids, slashes and domestic types', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01'),
    row('duck sp.', 'Anatidae sp.', '2024-06-01'),
    row('Mallard x American Black Duck (hybrid)', 'Anas platyrhynchos x rubripes', '2024-06-01'),
    row('Brewster\'s Warbler (hybrid)', 'Vermivora chrysoptera x cyanoptera', '2024-06-01'),
    row('Greater/Lesser Yellowlegs', 'Tringa melanoleuca/flavipes', '2024-06-01'),
    row('Mallard (Domestic type)', 'Anas platyrhynchos (Domestic type)', '2024-06-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.SpeciesTotal, 1)
  assert.equal(result.Species[0]['Common Name'], 'Blue Jay')
})

test('biggestTime collapses a subspecies and its nominate species into one', async () => {
  const file = await csv([
    row('Dark-eyed Junco (Slate-colored)', 'Junco hyemalis hyemalis', '2024-06-01'),
    row('Dark-eyed Junco', 'Junco hyemalis', '2024-06-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.SpeciesTotal, 1)
  // The first row wins, with its trinomial preserved under Subspecies.
  assert.equal(result.Species[0]['Scientific Name'], 'Junco hyemalis')
  assert.equal(result.Species[0].Subspecies, 'Junco hyemalis hyemalis')
})

test('biggestTime counts by Scientific Name, not Common Name', async () => {
  const file = await csv([
    row('Rock Pigeon', 'Columba livia', '2024-06-01'),
    row('Rock Pigeon (Feral Pigeon)', 'Columba livia', '2024-06-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.SpeciesTotal, 1)
})

test('biggestTime drops rows with no Scientific Name', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01'),
    row('Mystery Bird', '', '2024-06-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.SpeciesTotal, 1)
})

// ===========================================================================
// biggestTime -- year boundaries and leap days
// ===========================================================================

test('biggestTime("day") keeps Dec 31 and Jan 1 as separate days', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2023-12-31'),
    row('American Crow', 'Corvus brachyrhynchos', '2023-12-31'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2024-01-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.Date, '2023-12-31')
  assert.equal(result.SpeciesTotal, 2)
})

test('biggestTime("month") keeps December and the following January separate', async () => {
  const result = await biggestTime('month', { input: BASIC })
  // December 2023 has 5 species, January 2024 has 6; merged they would be 7.
  assert.equal(result.Date, '2024-01')
  assert.equal(result.SpeciesTotal, 6)
})

test('biggestTime("month") does not merge the same month across years', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2022-05-10'),
    row('American Crow', 'Corvus brachyrhynchos', '2022-05-10'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-05-10'),
    row('Song Sparrow', 'Melospiza melodia', '2023-05-11'),
    row('Yellow Warbler', 'Setophaga petechia', '2023-05-12')
  ])
  const result = await biggestTime('month', { input: file })
  assert.equal(result.Date, '2023-05')
  assert.equal(result.SpeciesTotal, 3)
})

test('biggestTime("year") splits on the Dec 31 / Jan 1 boundary', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2023-12-31'),
    row('American Crow', 'Corvus brachyrhynchos', '2024-01-01'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2024-01-01')
  ])
  const result = await biggestTime('year', { input: file })
  assert.equal(result.Date, '2024')
  assert.equal(result.SpeciesTotal, 2)
})

test('biggestTime("day") handles a leap day', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-02-28'),
    row('Wild Turkey', 'Meleagris gallopavo', '2024-02-29'),
    row('American Crow', 'Corvus brachyrhynchos', '2024-02-29'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2024-03-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.Date, '2024-02-29')
  assert.equal(result.SpeciesTotal, 2)
})

test('biggestTime("month") includes a leap day in February', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-02-01'),
    row('Wild Turkey', 'Meleagris gallopavo', '2024-02-29'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2024-03-01')
  ])
  const result = await biggestTime('month', { input: file })
  assert.equal(result.Date, '2024-02')
  assert.equal(result.SpeciesTotal, 2)
})

test('biggestTime skips impossible dates (Feb 29 in a non-leap year) instead of forming an "Invalid date" period', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const file = await csv([
    row('Wild Turkey', 'Meleagris gallopavo', '2023-02-29', { 'Submission ID': 'S1' }),
    row('Blue Jay', 'Cyanocitta cristata', '2023-02-30', { 'Submission ID': 'S2' }),
    row('American Crow', 'Corvus brachyrhynchos', '2023-02-30', { 'Submission ID': 'S2' }),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-03-01', { 'Submission ID': 'S3' })
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.Date, '2023-03-01')
  assert.equal(result.SpeciesTotal, 1)
})

test('biggestTime warns once with the skipped count and Submission IDs', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const file = await csv([
    row('Wild Turkey', 'Meleagris gallopavo', '2023-02-29', { 'Submission ID': 'S1' }),
    row('Blue Jay', 'Cyanocitta cristata', '2023-02-30', { 'Submission ID': 'S2' }),
    row('American Crow', 'Corvus brachyrhynchos', '2023-02-30', { 'Submission ID': 'S2' }),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-03-01', { 'Submission ID': 'S3' })
  ])
  await biggestTime('day', { input: file })
  assert.equal(warn.mock.calls.length, 1)
  const msg = warn.mock.calls[0].arguments[0]
  assert.match(msg, /\b3 row/)
  assert.match(msg, /S1, S2/)
  assert.ok(!msg.includes('S3'))
})

test('biggestTime lists at most five Submission IDs in the warning', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const rows = Array.from({ length: 7 }, (_, i) =>
    row('Wild Turkey', 'Meleagris gallopavo', '2023-02-29', { 'Submission ID': `S${i + 1}` }))
  rows.push(row('Snow Bunting', 'Plectrophenax nivalis', '2023-03-01', { 'Submission ID': 'S99' }))
  await biggestTime('day', { input: await csv(rows) })
  const msg = warn.mock.calls[0].arguments[0]
  assert.match(msg, /\b7 row/)
  assert.match(msg, /S1, S2, S3, S4, S5, \.\.\./)
  assert.ok(!msg.includes('S6'))
})

test('biggestTime does not warn when every date is valid', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  await biggestTime('day', { input: BASIC })
  assert.equal(warn.mock.calls.length, 0)
})

test('biggestTime skips impossible dates for month and year periods too', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const file = await csv([
    row('Wild Turkey', 'Meleagris gallopavo', '2023-02-29'),
    row('Blue Jay', 'Cyanocitta cristata', '2023-04-31'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-03-01')
  ])
  for (const timespan of ['month', 'year']) {
    const result = await biggestTime(timespan, { input: file })
    assert.notEqual(result.Date, 'Invalid date')
    assert.equal(result.SpeciesTotal, 1)
  }
})

test('firstTimes skips impossible dates and warns once', async (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const file = await csv([
    row('Wild Turkey', 'Meleagris gallopavo', '2023-02-29', { 'Submission ID': 'S1' }),
    row('Blue Jay', 'Cyanocitta cristata', '2023-02-29', { 'Submission ID': 'S1' }),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-03-01', { 'Submission ID': 'S2' })
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2023-03-01')
  assert.deepEqual(result.Species.map(x => x['Common Name']), ['Snow Bunting'])
  assert.equal(warn.mock.calls.length, 1)
  assert.match(warn.mock.calls[0].arguments[0], /\b2 row.*S1/)
})

test('firstTimes does not let an impossible date claim a species first seen later', async (t) => {
  t.mock.method(console, 'warn', () => {})
  const file = await csv([
    row('Wild Turkey', 'Meleagris gallopavo', '2023-02-29'),
    row('Wild Turkey', 'Meleagris gallopavo', '2023-05-01'),
    row('Blue Jay', 'Cyanocitta cristata', '2023-05-01')
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2023-05-01')
  assert.equal(result.SpeciesTotal, 2)
})

// ===========================================================================
// biggestTime -- ties
// ===========================================================================

test('biggestTime("day") tie goes to the day that appears LAST in the file', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01'),
    row('American Crow', 'Corvus brachyrhynchos', '2024-06-01'),
    row('Song Sparrow', 'Melospiza melodia', '2024-06-02'),
    row('Yellow Warbler', 'Setophaga petechia', '2024-06-02')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.Date, '2024-06-02')
})

test('biggestTime("day") tie-break follows file order, not chronology', async () => {
  // Same data as above, but the later date is written first.
  const file = await csv([
    row('Song Sparrow', 'Melospiza melodia', '2024-06-02'),
    row('Yellow Warbler', 'Setophaga petechia', '2024-06-02'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01'),
    row('American Crow', 'Corvus brachyrhynchos', '2024-06-01')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.Date, '2024-06-01')
})

test('biggestTime("year") tie goes to the later year regardless of file order', async () => {
  // Year keys are integer-like, so object iteration is numeric ascending.
  const file = await csv([
    row('Song Sparrow', 'Melospiza melodia', '2024-06-02'),
    row('Blue Jay', 'Cyanocitta cristata', '2022-06-01')
  ])
  const result = await biggestTime('year', { input: file })
  assert.equal(result.Date, '2024')
})

// ===========================================================================
// biggestTime -- date formats and input handling
// ===========================================================================

test('biggestTime accepts MM/DD/YYYY dates and outputs ISO-style period keys', async () => {
  const day = await biggestTime('day', { input: BASIC_SLASH })
  const month = await biggestTime('month', { input: BASIC_SLASH })
  const year = await biggestTime('year', { input: BASIC_SLASH })
  assert.equal(day.Date, '2024-01-01')
  assert.equal(month.Date, '2024-01')
  assert.equal(year.Date, '2024')
})

test('biggestTime gives identical totals for YYYY-MM-DD and MM/DD/YYYY input', async () => {
  for (const span of ['day', 'month', 'year']) {
    const a = await biggestTime(span, { input: BASIC })
    const b = await biggestTime(span, { input: BASIC_SLASH })
    assert.equal(a.SpeciesTotal, b.SpeciesTotal, span)
    assert.deepEqual(names(a), names(b), span)
  }
})

test('biggestTime merges mixed date formats that refer to the same day', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01'),
    row('American Crow', 'Corvus brachyrhynchos', '06/01/2024'),
    row('Song Sparrow', 'Melospiza melodia', '2024-06-02')
  ])
  const result = await biggestTime('day', { input: file })
  assert.equal(result.Date, '2024-06-01')
  assert.equal(result.SpeciesTotal, 2)
})

test('biggestTime rejects a date with no "-" or "/" separator', async () => {
  const file = await csv([row('Blue Jay', 'Cyanocitta cristata', '20240601')])
  await assert.rejects(biggestTime('day', { input: file }), /Invalid Date String/)
})

test('biggestTime returns undefined for a header-only CSV', async () => {
  assert.equal(await biggestTime('day', { input: HEADER_ONLY }), undefined)
})

test('biggestTime returns undefined when every row is a spuh', async () => {
  const file = await csv([
    row('duck sp.', 'Anatidae sp.', '2024-06-01'),
    row('gull sp.', 'Larinae sp.', '2024-06-02')
  ])
  assert.equal(await biggestTime('year', { input: file }), undefined)
})

test('biggestTime rejects with ENOENT for a missing input file', async () => {
  await assert.rejects(
    biggestTime('day', { input: path.join(tmpDir, 'nope.csv') }),
    { code: 'ENOENT' }
  )
})

// ===========================================================================
// firstTimes -- timespan options
// ===========================================================================

test('firstTimes("day") returns the day with the most first-ever sightings', async () => {
  const result = await firstTimes('day', { input: BASIC })
  // Crow, Downy Woodpecker and Tufted Titmouse are new on 2023-12-31.
  assert.equal(result.Date, '2023-12-31')
  assert.equal(result.SpeciesTotal, 3)
  assert.deepEqual(names(result), ['American Crow', 'Downy Woodpecker', 'Tufted Titmouse'])
})

test('firstTimes("month") returns the month with the most first-ever sightings', async () => {
  const result = await firstTimes('month', { input: BASIC })
  assert.equal(result.Date, '2023-12')
  assert.equal(result.SpeciesTotal, 5)
})

test('firstTimes("year") returns the year with the most first-ever sightings', async () => {
  const result = await firstTimes('year', { input: BASIC })
  assert.equal(result.Date, '2024')
  // 2024 total is 10 species, but 4 were already seen in 2023.
  assert.equal(result.SpeciesTotal, 6)
  assert.deepEqual(names(result), [
    'Common Yellowthroat',
    'Hairy Woodpecker',
    'Red-winged Blackbird',
    'Song Sparrow',
    'White-breasted Nuthatch',
    'Yellow Warbler'
  ])
})

test('firstTimes differs from biggestTime: repeat species are not counted', async () => {
  const biggest = await biggestTime('day', { input: BASIC })
  const first = await firstTimes('day', { input: BASIC })
  assert.equal(biggest.Date, '2024-01-01')
  assert.notEqual(first.Date, biggest.Date)
})

test('firstTimes rejects an unknown timespan', async () => {
  await assert.rejects(firstTimes('decade', { input: BASIC }), /Unable to parse timespan/)
})

test('firstTimes with no timespan groups by full local ISO timestamp', async () => {
  const result = await firstTimes(undefined, { input: BASIC })
  assert.match(result.Date, /^2023-12-31T00:00:00[+-]\d{2}:\d{2}$/)
  assert.equal(result.SpeciesTotal, 3)
})

// ===========================================================================
// firstTimes -- return shape
// ===========================================================================

test('firstTimes returns an object with exactly Date, SpeciesTotal, Species', async () => {
  const result = await firstTimes('month', { input: BASIC })
  assert.deepEqual(Object.keys(result), ['Date', 'SpeciesTotal', 'Species'])
  assert.equal(result.SpeciesTotal, result.Species.length)
})

test('firstTimes Species entries are the earliest row for each species', async () => {
  const result = await firstTimes('month', { input: BASIC })
  const chickadee = result.Species.find(s => s['Common Name'] === 'Black-capped Chickadee')
  assert.equal(chickadee.Date, '2023-12-30')
  assert.equal(chickadee['Submission ID'], 'S900000001')
})

test('firstTimes does not log to the console', async (t) => {
  t.mock.method(console, 'log', () => {})
  await firstTimes('year', { input: BASIC })
  assert.equal(console.log.mock.calls.length, 0)
})

// ===========================================================================
// firstTimes -- ordering and first-sighting rules
// ===========================================================================

test('firstTimes sorts by date first, so file order does not matter', async () => {
  const text = await fs.readFile(BASIC, 'utf8')
  const [header, ...lines] = text.trim().split('\n')
  const file = path.join(tmpDir, 'reversed.csv')
  await fs.writeFile(file, [header, ...lines.reverse()].join('\n'))
  for (const span of ['day', 'month', 'year']) {
    const a = await firstTimes(span, { input: BASIC })
    const b = await firstTimes(span, { input: file })
    assert.equal(b.Date, a.Date, span)
    assert.equal(b.SpeciesTotal, a.SpeciesTotal, span)
    assert.deepEqual(names(b), names(a), span)
  }
})

test('firstTimes counts species first seen on the same day on different checklists', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01', { 'Submission ID': 'S1' }),
    row('American Crow', 'Corvus brachyrhynchos', '2024-06-01', { 'Submission ID': 'S2' }),
    row('Song Sparrow', 'Melospiza melodia', '2024-06-01', { 'Submission ID': 'S3' }),
    row('Yellow Warbler', 'Setophaga petechia', '2024-06-02', { 'Submission ID': 'S4' })
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2024-06-01')
  assert.equal(result.SpeciesTotal, 3)
})

test('firstTimes counts a species once even if seen on several checklists its first day', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01', { 'Submission ID': 'S1' }),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01', { 'Submission ID': 'S2' })
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.SpeciesTotal, 1)
  assert.equal(result.Species[0]['Submission ID'], 'S1')
})

test('firstTimes credits a species to its earliest date even when listed later in the file', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-05'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01')
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2024-06-01')
})

test('firstTimes treats a subspecies as the same species as its nominate form', async () => {
  const file = await csv([
    row('Dark-eyed Junco (Slate-colored)', 'Junco hyemalis hyemalis', '2024-01-05'),
    row('Dark-eyed Junco', 'Junco hyemalis', '2024-02-05'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-02-05')
  ])
  const result = await firstTimes('month', { input: file })
  // Without the collapse, February would have 2 "first" species and win.
  // With it, January (1) and February (1) tie and the later month wins.
  assert.equal(result.Date, '2024-02')
  assert.equal(result.SpeciesTotal, 1)
  assert.equal(result.Species[0]['Common Name'], 'Blue Jay')
})

test('firstTimes ignores spuhs entirely', async () => {
  const file = await csv([
    row('duck sp.', 'Anatidae sp.', '2024-06-01'),
    row('gull sp.', 'Larinae sp.', '2024-06-01'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-02')
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2024-06-02')
  assert.equal(result.SpeciesTotal, 1)
})

test('firstTimes("year") splits first sightings at the Dec 31 / Jan 1 boundary', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2023-12-31'),
    row('American Crow', 'Corvus brachyrhynchos', '2023-12-31'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-01-01'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2024-01-01')
  ])
  const result = await firstTimes('year', { input: file })
  assert.equal(result.Date, '2023')
  assert.equal(result.SpeciesTotal, 2)
})

test('firstTimes("day") handles a leap-day first sighting', async () => {
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2024-02-28'),
    row('Wild Turkey', 'Meleagris gallopavo', '2024-02-29'),
    row('American Crow', 'Corvus brachyrhynchos', '2024-02-29'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-02-29')
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2024-02-29')
  assert.equal(result.SpeciesTotal, 2)
})

test('firstTimes orders MM/DD/YYYY dates chronologically across years', async () => {
  // Lexicographically "01/05/2024" < "12/31/2023"; chronologically it is later.
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '01/05/2024'),
    row('American Crow', 'Corvus brachyrhynchos', '01/05/2024'),
    row('Blue Jay', 'Cyanocitta cristata', '12/31/2023')
  ])
  const result = await firstTimes('year', { input: file })
  // Blue Jay's first sighting is 2023; only the crow is new in 2024.
  // 2023 and 2024 tie at 1, and the later year wins the tie.
  assert.equal(result.Date, '2024')
  assert.deepEqual(names(result), ['American Crow'])
})

test('firstTimes gives identical results for YYYY-MM-DD and MM/DD/YYYY input', async () => {
  for (const span of ['day', 'month', 'year']) {
    const a = await firstTimes(span, { input: BASIC })
    const b = await firstTimes(span, { input: BASIC_SLASH })
    assert.equal(a.Date, b.Date, span)
    assert.deepEqual(names(a), names(b), span)
  }
})

test('firstTimes("day") tie goes to the chronologically later day', async () => {
  const file = await csv([
    row('Song Sparrow', 'Melospiza melodia', '2024-06-02'),
    row('Yellow Warbler', 'Setophaga petechia', '2024-06-02'),
    row('Blue Jay', 'Cyanocitta cristata', '2024-06-01'),
    row('American Crow', 'Corvus brachyrhynchos', '2024-06-01')
  ])
  const result = await firstTimes('day', { input: file })
  assert.equal(result.Date, '2024-06-02')
})

test('firstTimes returns undefined for a header-only CSV', async () => {
  assert.equal(await firstTimes('day', { input: HEADER_ONLY }), undefined)
})

test('firstTimes rejects with ENOENT for a missing input file', async () => {
  await assert.rejects(
    firstTimes('day', { input: path.join(tmpDir, 'nope.csv') }),
    { code: 'ENOENT' }
  )
})

// ===========================================================================
// firstTimeList -- removed
// ===========================================================================

test('firstTimeList is no longer exported (it was an empty stub)', () => {
  assert.ok(!('firstTimeList' in index))
  assert.ok(!('firstTimeList' in index.default))
})

// ===========================================================================
// daylistTargets
// ===========================================================================
//
// With opts.today, daylistTargets logs one line per Vermont species that has
// NOT been recorded in Vermont on today's month + day in any year. "Today" is controlled by
// mocking Date with t.mock.timers (moment() reads the mocked clock).

function today (t, year, monthIndex, day) {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(year, monthIndex, day, 12) })
  t.mock.method(console, 'log', () => {})
}

// With opts.today, daylistTargets returns the species; the CLI prints one per line
let returned = []
const logged = () => returned
const targets = async opts => {
  returned = await daylistTargets(opts)
  return returned
}

test('daylistTargets with opts.today returns an array, and logs nothing', async (t) => {
  today(t, 2024, 9, 1)
  assert.ok(Array.isArray(await targets({ input: DAYLIST, today: true })))
  assert.equal(console.log.mock.calls.length, 0)
})

test('daylistTargets prints nothing without opts.today', async (t) => {
  today(t, 2024, 9, 1)
  await daylistTargets({ input: DAYLIST })
  assert.equal(console.log.mock.calls.length, 0)
})

// Vermont species in daylist.csv (with coordinates, not spuhs), in file order.
const DAYLIST_VT = [
  'Black-capped Chickadee',
  'Blue Jay',
  'Dark-eyed Junco (Slate-colored)',
  'Wild Turkey',
  'Snow Bunting',
  'Common Redpoll',
  'American Robin',
  'Brown Creeper'
]
const except = (...names) => DAYLIST_VT.filter(x => !names.includes(x))

test('daylistTargets logs Vermont species not yet seen on today\'s date', async (t) => {
  today(t, 2024, 9, 1) // Oct 1
  await targets({ input: DAYLIST, today: true, state: 'Vermont' })
  assert.deepEqual(logged(), [
    'Wild Turkey',
    'Snow Bunting',
    'Common Redpoll',
    'American Robin'
  ])
})

test('daylistTargets returns species names as strings', async (t) => {
  today(t, 2024, 9, 1)
  const result = await targets({ input: DAYLIST, today: true, state: 'Vermont' })
  assert.ok(result.length > 0)
  assert.ok(result.every(x => typeof x === 'string'))
})

test('daylistTargets logs each target once', async (t) => {
  today(t, 2024, 6, 4) // Jul 4, nothing seen
  await targets({ input: DAYLIST, today: true, state: 'Vermont' })
  assert.deepEqual(logged(), DAYLIST_VT)
})

test('daylistTargets does not log species seen on today\'s date in any earlier year', async (t) => {
  // Black-capped Chickadee was seen on Oct 1 in both 2022 and 2023.
  today(t, 2024, 9, 1)
  await targets({ input: DAYLIST, today: true, state: 'Vermont' })
  const out = logged()
  for (const name of ['Black-capped Chickadee', 'Blue Jay', 'Dark-eyed Junco (Slate-colored)', 'Brown Creeper']) {
    assert.ok(!out.includes(name), name)
  }
})

test('daylistTargets ignores species seen only outside Vermont', async (t) => {
  today(t, 2024, 9, 1)
  await targets({ input: DAYLIST, today: true })
  assert.ok(!logged().includes('Northern Cardinal'))
})

test('daylistTargets excludes spuhs', async (t) => {
  today(t, 2024, 6, 4)
  await targets({ input: DAYLIST, today: true })
  assert.ok(!logged().includes('chickadee sp.'))
})

test('daylistTargets drops rows with no Latitude (via locationFilter)', async (t) => {
  // The Hermit Thrush row has blank coordinates.
  today(t, 2024, 6, 4)
  await targets({ input: DAYLIST, today: true })
  assert.ok(!logged().includes('Hermit Thrush'))
})

test('daylistTargets keeps subspecies common names as-is (not merged with the species)', async (t) => {
  today(t, 2024, 6, 4)
  await targets({ input: DAYLIST, today: true })
  assert.ok(logged().includes('Dark-eyed Junco (Slate-colored)'))
  assert.ok(!logged().includes('Dark-eyed Junco'))
})

test('daylistTargets honors a county filter', async (t) => {
  // Brown Creeper is the only Chittenden species, and was seen on Oct 1.
  today(t, 2024, 9, 1)
  await targets({ input: DAYLIST, today: true, county: 'Chittenden' })
  assert.deepEqual(logged(), [])
  console.log.mock.resetCalls()
  t.mock.timers.setTime(new Date(2024, 6, 4, 12).getTime())
  await targets({ input: DAYLIST, today: true, county: 'Chittenden' })
  assert.deepEqual(logged(), ['Brown Creeper'])
})

test('daylistTargets county filter is case-insensitive', async (t) => {
  today(t, 2024, 6, 4)
  await targets({ input: DAYLIST, today: true, county: 'washington' })
  assert.ok(!logged().includes('Brown Creeper'))
  assert.ok(logged().includes('Blue Jay'))
})

test('daylistTargets does not count an out-of-state sighting toward a Vermont species\' dates', async (t) => {
  // American Robin was seen in VT on Apr 10 and in NY on Oct 1, so Oct 1 is
  // still a Vermont target for it.
  today(t, 2024, 9, 1)
  await targets({ input: DAYLIST, today: true })
  assert.ok(logged().includes('American Robin'))
})

test('daylistTargets uses only US-VT rows for observed dates', async (t) => {
  today(t, 2024, 9, 1)
  const NY = { 'State/Province': 'US-NY', County: 'New York', Latitude: '40.7831', Longitude: '-73.9712' }
  const file = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2023-10-01'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-12-31'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-10-01', NY)
  ])
  await targets({ input: file, today: true })
  assert.deepEqual(logged(), ['Snow Bunting'])
})

test('daylistTargets handles Dec 31', async (t) => {
  today(t, 2024, 11, 31)
  await targets({ input: DAYLIST, today: true })
  assert.deepEqual(logged(), except('Snow Bunting'))
})

test('daylistTargets handles Jan 1', async (t) => {
  today(t, 2025, 0, 1)
  await targets({ input: DAYLIST, today: true })
  assert.deepEqual(logged(), except('Common Redpoll'))
})

test('daylistTargets matches a leap-day sighting when today is Feb 29', async (t) => {
  today(t, 2024, 1, 29)
  await targets({ input: DAYLIST, today: true })
  assert.deepEqual(logged(), except('Wild Turkey'))
})

test('daylistTargets does not carry a leap-day sighting over to Feb 28 in a non-leap year', async (t) => {
  today(t, 2025, 1, 28)
  await targets({ input: DAYLIST, today: true })
  assert.deepEqual(logged(), DAYLIST_VT)
})

test('daylistTargets logs every Vermont species on a date with no sightings', async (t) => {
  today(t, 2024, 6, 4) // Jul 4
  await targets({ input: DAYLIST, today: true })
  assert.deepEqual(logged(), DAYLIST_VT)
})

test('daylistTargets logs nothing for a header-only CSV', async (t) => {
  today(t, 2024, 9, 1)
  await targets({ input: HEADER_ONLY, today: true })
  assert.equal(console.log.mock.calls.length, 0)
})

test('daylistTargets accepts MM/DD/YYYY dates like the rest of index.js', async (t) => {
  // A slash-dated file must give the same result as the same rows dash-dated.
  today(t, 2024, 9, 1)
  const dashed = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '2023-10-01'),
    row('Snow Bunting', 'Plectrophenax nivalis', '2023-12-31')
  ])
  const slashed = await csv([
    row('Blue Jay', 'Cyanocitta cristata', '10/01/2023'),
    row('Snow Bunting', 'Plectrophenax nivalis', '12/31/2023')
  ])
  await targets({ input: dashed, today: true })
  const expected = logged()
  console.log.mock.resetCalls()
  await targets({ input: slashed, today: true })
  assert.deepEqual(logged(), expected)
  assert.equal(expected.length, 1)
})

test('daylistTargets rejects with ENOENT for a missing input file', async () => {
  await assert.rejects(
    daylistTargets({ input: path.join(tmpDir, 'nope.csv'), today: true }),
    { code: 'ENOENT' }
  )
})
