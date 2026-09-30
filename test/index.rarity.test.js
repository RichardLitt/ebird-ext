import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { rare, rareAZ, subspecies, isSpeciesSightingRare } from '../index.js'
import VermontRecords from '../data/vermont_records.json' with { type: 'json' }
import VermontSubspecies from '../data/vermont_records_subspecies.json' with { type: 'json' }

// Rarity is decided against the bundled records files:
//
//   data/vermont_records.json            Reporting: 'V' anywhere in Vermont,
//                                        'C' outside the Champlain Valley,
//                                        'K' outside the NEK counties,
//                                        'N' only when breeding, '' never.
//                                        Breeding: '*' = confirmed breeder.
//                                        Occurrence: expected-date ranges.
//   data/arizona_records.json            Reporting: 'V' anywhere in Arizona.
//                                        Breeding: 'n' = known breeder.
//   data/vermont_records_subspecies.json Target / Vermont subspecies lists.
//
// Species used below (and why):
//   Canada Goose       Branta canadensis        common breeder, never rare
//   King Eider         Somateria spectabilis    'V', no occurrence limit
//   Harlequin Duck     Histrionicus histrionicus 'C', occurrence 10D-5B
//   Tufted Duck        Aythya fuligula          'C', occurrence 12B-4B
//   Spruce Grouse      Canachites canadensis    'K', resident
//   Black-backed Wpkr  Picoides arcticus        'K', resident
//   Mute Swan          Cygnus olor              'N', confirmed breeder
//   Trumpeter Swan     Cygnus buccinator        'N', not a confirmed breeder
//   Common Nighthawk   Chordeiles minor         summer only (5C-9B)
//   Snow Goose         Anser caerulescens       two migration windows
//   Gadwall            Mareca strepera          open-ended ("+") occurrence
//
// Fixture CSVs under test/fixtures/index-rarity/ are hand-made and use fake
// Submission IDs and location names.

const here = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.join(here, 'fixtures', 'index-rarity')
const VT_CSV = path.join(fixtureDir, 'vermont.csv')
const AZ_CSV = path.join(fixtureDir, 'arizona.csv')
const LIFE_CSV = path.join(fixtureDir, 'lifelist.csv')

const BUCKETS = ['Breeding', 'Vermont', 'Burlington', 'Champlain', 'NEK', 'Unknown', 'Subspecies', 'OutsideExpectedDates']
const AZ_BUCKETS = ['Breeding', 'Arizona', 'Unknown', 'Subspecies']

// Build a sighting in the shape isSpeciesSightingRare hands to rare().
function sighting (overrides = {}) {
  return {
    County: 'Chittenden',
    Date: '2024-01-15',
    Region: 'Champlain Valley',
    Town: 'Burlington',
    ...overrides
  }
}

async function rareManual (...data) {
  return rare({ manual: true, data })
}

const ids = list => list.map(x => x['Submission ID'])

// Map every bucket to the Submission IDs it holds, dropping empty buckets.
function summarize (output) {
  const out = {}
  for (const [k, v] of Object.entries(output)) {
    if (v.length) out[k] = ids(v)
  }
  return out
}

// Which buckets contain this exact entry?
function bucketsOf (output, entry) {
  return Object.keys(output).filter(k => output[k].includes(entry))
}

const CSV_HEADER = 'Submission ID,Common Name,Scientific Name,State/Province,County,Latitude,Longitude,Date,Breeding Code'
const BURLINGTON = { state: 'US-VT', county: 'Chittenden', lat: '44.4759', lon: '-73.2121' }

// Write a small throwaway CSV to os.tmpdir(); removed when the test ends.
async function tmpCsv (t, rows, { trailingNewline = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-rarity-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const lines = rows.map((r, i) => {
    const loc = { ...BURLINGTON, ...r }
    return [
      r.id || `T9000000${String(i).padStart(2, '0')}`,
      r.common || 'Test Bird',
      r.sci,
      loc.state,
      loc.county,
      loc.lat,
      loc.lon,
      r.date || '2024-01-15',
      r.code || ''
    ].join(',')
  })
  const file = path.join(dir, 'MyEBirdData.csv')
  await fs.writeFile(file, [CSV_HEADER, ...lines].join('\n') + (trailingNewline ? '\n' : ''), 'utf8')
  return { file, dir }
}

// rareAZ doesn't return anything; it console.logs its output object.
async function runRareAZ (t, opts) {
  t.mock.method(console, 'log', () => {})
  const ret = await rareAZ(opts)
  const calls = console.log.mock.calls
  return { ret, calls, output: calls.length ? calls[calls.length - 1].arguments[0] : undefined }
}

// ===========================================================================
// rare: return shape and manual-mode defaults
// ===========================================================================

test('rare returns an object with exactly the eight rarity buckets', async () => {
  const out = await rareManual()
  assert.deepEqual(Object.keys(out), BUCKETS)
  for (const k of BUCKETS) assert.ok(Array.isArray(out[k]), `${k} is an array`)
})

test('rare with manual: true and no data falls back to the Pine Marten spoof in Unknown', async () => {
  const out = await rare({ manual: true })
  assert.equal(out.Unknown.length, 1)
  assert.equal(out.Unknown[0].Species, 'Pine Marten')
  assert.equal(out.Unknown[0]['Scientific Name'], 'Martes martes')
  for (const k of BUCKETS.filter(k => k !== 'Unknown')) assert.equal(out[k].length, 0)
})

test('rare with an empty data array reports nothing', async () => {
  const out = await rare({ manual: true, data: [] })
  for (const k of BUCKETS) assert.equal(out[k].length, 0)
})

test('rare sets opts.state to "Vermont" on the caller\'s opts object', async () => {
  const opts = { manual: true, data: [], state: 'Arizona' }
  await rare(opts)
  assert.equal(opts.state, 'Vermont')
})

test('rare returns the same entry objects it was given, not copies', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis' })
  const out = await rareManual(e)
  assert.equal(out.Vermont[0], e)
})

test('rare does not console.log anything', async (t) => {
  t.mock.method(console, 'log', () => {})
  await rareManual(sighting({ 'Scientific Name': 'Somateria spectabilis' }))
  assert.equal(console.log.mock.calls.length, 0)
})

// ---------------------------------------------------------------------------
// Common species: never reported
// ---------------------------------------------------------------------------

test('rare: a common breeder (Canada Goose) in season is not reported anywhere', async () => {
  const e = sighting({ 'Scientific Name': 'Branta canadensis', Date: '2024-04-15' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: a confirmed breeder (Breeding "*") with a confirmed breeding code is not reported', async () => {
  const e = sighting({ 'Scientific Name': 'Branta canadensis', Date: '2024-05-15', 'Breeding Code': 'NY Nest with Young (Confirmed)' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: an open-ended ("+") occurrence (Gadwall) is never outside expected dates', async () => {
  const jan = sighting({ 'Scientific Name': 'Mareca strepera', Date: '2024-01-15' })
  const jul = sighting({ 'Scientific Name': 'Mareca strepera', Date: '2024-07-15' })
  const out = await rareManual(jan, jul)
  assert.equal(out.OutsideExpectedDates.length, 0)
  assert.deepEqual(bucketsOf(out, jan), [])
  assert.deepEqual(bucketsOf(out, jul), [])
})

// ---------------------------------------------------------------------------
// Reporting 'V': anywhere in Vermont
// ---------------------------------------------------------------------------

test('rare: a "V" species (King Eider) goes to the Vermont bucket', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Vermont'])
})

test('rare: a "V" species with no Occurrence limit is reportable in any month', async () => {
  const dates = ['2024-01-15', '2024-04-15', '2024-07-15', '2024-10-15']
  const entries = dates.map(Date => sighting({ 'Scientific Name': 'Somateria spectabilis', Date }))
  const out = await rareManual(...entries)
  assert.equal(out.Vermont.length, 4)
  assert.equal(out.OutsideExpectedDates.length, 0)
})

test('rare: a "V" species is reported regardless of town, county or region', async () => {
  const a = sighting({ 'Scientific Name': 'Somateria spectabilis', Town: 'Brighton', County: 'Essex', Region: 'Northeastern Highlands' })
  const b = sighting({ 'Scientific Name': 'Somateria spectabilis', Town: 'Burlington', County: 'Chittenden', Region: 'Champlain Valley' })
  const out = await rareManual(a, b)
  assert.deepEqual(out.Vermont, [a, b])
})

test('rare: a non-breeder "V" species with a confirmed breeding code goes to Breeding, not Vermont', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis', 'Breeding Code': 'NY Nest with Young (Confirmed)' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Breeding'])
})

test('rare: an ignored long-form breeding code ("F Flyover") does not trigger Breeding', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis', 'Breeding Code': 'F Flyover' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Vermont'])
})

test('rare: every ignored short breeding code (S H F S7 M P T C N A B) is ignored', async () => {
  const codes = ['S', 'H', 'F', 'S7', 'M', 'P', 'T', 'C', 'N', 'A', 'B']
  const entries = codes.map(code => sighting({ 'Scientific Name': 'Somateria spectabilis', 'Breeding Code': code }))
  const out = await rareManual(...entries)
  assert.equal(out.Breeding.length, 0)
  assert.equal(out.Vermont.length, codes.length)
})

test('rare: an empty-string breeding code is treated as no code', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis', 'Breeding Code': '' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Vermont'])
})

// ---------------------------------------------------------------------------
// Reporting 'C': outside the Champlain Valley
// ---------------------------------------------------------------------------

test('rare: a "C" species (Harlequin Duck) outside the Champlain Valley goes to Champlain', async () => {
  const e = sighting({ 'Scientific Name': 'Histrionicus histrionicus', Region: 'Northern Vermont Piedmont', Town: 'Montpelier', County: 'Washington' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Champlain'])
})

test('rare: a "C" species inside the Champlain Valley is not reported', async () => {
  const e = sighting({ 'Scientific Name': 'Histrionicus histrionicus', Region: 'Champlain Valley' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: a "C" species with no Region at all counts as outside the Champlain Valley', async () => {
  const e = sighting({ 'Scientific Name': 'Histrionicus histrionicus', Region: undefined })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Champlain'])
})

test('rare: the Champlain Valley match is case-sensitive', async () => {
  const e = sighting({ 'Scientific Name': 'Histrionicus histrionicus', Region: 'CHAMPLAIN VALLEY' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Champlain'])
})

test('rare: a "C" species with a year-wrapping occurrence (Tufted Duck, 12B-4B) is fine in January', async () => {
  const e = sighting({ 'Scientific Name': 'Aythya fuligula', Date: '2024-01-15', Region: 'Southern Vermont Piedmont' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Champlain'])
})

// ---------------------------------------------------------------------------
// Reporting 'K': outside the Northeast Kingdom
// ---------------------------------------------------------------------------

test('rare: a "K" species (Spruce Grouse) in any NEK county is not reported', async () => {
  const entries = ['Essex', 'Caledonia', 'Orleans'].map(County => sighting({ 'Scientific Name': 'Canachites canadensis', County }))
  const out = await rareManual(...entries)
  for (const e of entries) assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: a "K" species outside the NEK goes to NEK', async () => {
  const e = sighting({ 'Scientific Name': 'Canachites canadensis', County: 'Addison' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['NEK'])
})

test('rare: Black-backed Woodpecker (also "K") in Windham goes to NEK', async () => {
  const e = sighting({ 'Scientific Name': 'Picoides arcticus', County: 'Windham' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['NEK'])
})

test('rare: the NEK check uses County, not Town (Essex town is in Chittenden)', async () => {
  const e = sighting({ 'Scientific Name': 'Canachites canadensis', Town: 'Essex', County: 'Chittenden' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['NEK'])
})

// ---------------------------------------------------------------------------
// Reporting 'N': only when breeding
// ---------------------------------------------------------------------------

test('rare: an "N" confirmed breeder (Mute Swan) with a confirmed code goes to Breeding', async () => {
  const e = sighting({ 'Scientific Name': 'Cygnus olor', Date: '2024-05-10', 'Breeding Code': 'NY Nest with Young (Confirmed)' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Breeding'])
})

test('rare: an "N" species with no breeding code is not reported', async () => {
  const e = sighting({ 'Scientific Name': 'Cygnus olor', Date: '2024-05-10' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: an "N" species with an ignored breeding code (S7) is not reported', async () => {
  const e = sighting({ 'Scientific Name': 'Cygnus olor', Date: '2024-05-10', 'Breeding Code': 'S7 Singing Bird Present 7+ Days (Probable)' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: an "N" non-breeder (Trumpeter Swan) in season with a breeding code goes to Breeding', async () => {
  const e = sighting({ 'Scientific Name': 'Cygnus buccinator', Date: '2024-06-15', 'Breeding Code': 'ON Occupied Nest (Confirmed)' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Breeding'])
})

// ---------------------------------------------------------------------------
// Expected dates (via appearsDuringExpectedDates)
// ---------------------------------------------------------------------------

test('rare: a summer species (Common Nighthawk) in January is OutsideExpectedDates', async () => {
  const e = sighting({ 'Scientific Name': 'Chordeiles minor', Date: '2024-01-15' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['OutsideExpectedDates'])
})

test('rare: the same summer species in July is not reported', async () => {
  const e = sighting({ 'Scientific Name': 'Chordeiles minor', Date: '2024-07-01' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: a two-window migrant (Snow Goose) is fine in April and flagged in July', async () => {
  const apr = sighting({ 'Scientific Name': 'Anser caerulescens', Date: '2024-04-15' })
  const jul = sighting({ 'Scientific Name': 'Anser caerulescens', Date: '2024-07-15' })
  const out = await rareManual(apr, jul)
  assert.deepEqual(bucketsOf(out, apr), [])
  assert.deepEqual(bucketsOf(out, jul), ['OutsideExpectedDates'])
})

test('rare: OutsideExpectedDates takes precedence over the Champlain check', async () => {
  const e = sighting({ 'Scientific Name': 'Histrionicus histrionicus', Date: '2024-07-15', Region: 'Northern Vermont Piedmont' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['OutsideExpectedDates'])
})

test('rare: OutsideExpectedDates takes precedence over Breeding', async () => {
  const e = sighting({ 'Scientific Name': 'Cygnus buccinator', Date: '2024-01-15', 'Breeding Code': 'NY Nest with Young (Confirmed)' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['OutsideExpectedDates'])
})

test('rare: a year-wrapping "C" species (Tufted Duck) in July is OutsideExpectedDates', async () => {
  const e = sighting({ 'Scientific Name': 'Aythya fuligula', Date: '2024-07-15', Region: 'Champlain Valley' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['OutsideExpectedDates'])
})

// ---------------------------------------------------------------------------
// Unknown species
// ---------------------------------------------------------------------------

test('rare: a species absent from vermont_records.json goes to Unknown', async () => {
  const e = sighting({ 'Scientific Name': 'Ornithomimus fictus' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Unknown'])
})

test('rare: an entry with no Scientific Name goes to Unknown', async () => {
  const e = sighting({})
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Unknown'])
})

test('rare: Scientific Name matching is exact (a trinomial is not the species)', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis spectabilis' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Unknown'])
})

// ---------------------------------------------------------------------------
// Reporting 'B': outside the Burlington area
// ---------------------------------------------------------------------------

test('rare: no bundled record uses Reporting "B", so the Burlington bucket is always empty today', async () => {
  assert.equal(VermontRecords.filter(r => r.Reporting === 'B').length, 0)
  const entries = VermontRecords.slice(0, 50).map(r => sighting({ 'Scientific Name': r['Scientific Name'], Town: 'Montpelier' }))
  const out = await rareManual(...entries)
  assert.equal(out.Burlington.length, 0)
})

test.todo('rare: the Reporting "B" town list (index.js:710) is mixed case ("Burlington"), but rows from a CSV get an upper-case Town ("BURLINGTON") from pointLookup, so every CSV sighting of a "B" species would be flagged, even ones inside Burlington')

// ---------------------------------------------------------------------------
// Subspecies
// ---------------------------------------------------------------------------

test('rare: a target subspecies (Red-tailed Hawk abieticola) goes to Subspecies', async () => {
  const e = sighting({ 'Scientific Name': 'Buteo jamaicensis', Subspecies: 'Buteo jamaicensis abieticola' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Subspecies'])
})

test('rare: flagged subspecies get "Subspecies Notes" set to the subspecies record', async () => {
  const e = sighting({ 'Scientific Name': 'Buteo jamaicensis', Subspecies: 'Buteo jamaicensis abieticola' })
  await rareManual(e)
  const record = VermontSubspecies.find(x => x['Scientific Name'] === 'Buteo jamaicensis')
  assert.equal(e['Subspecies Notes'], record)
})

test('rare: a known Vermont subspecies (Red-tailed Hawk borealis) is not flagged', async () => {
  const e = sighting({ 'Scientific Name': 'Buteo jamaicensis', Subspecies: 'Buteo jamaicensis borealis' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
  assert.equal(e['Subspecies Notes'], undefined)
})

test('rare: a non-Vermont subspecies with an empty target list (Oregon Junco) is flagged', async () => {
  const e = sighting({ 'Scientific Name': 'Junco hyemalis', Subspecies: 'Junco hyemalis oreganus' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Subspecies'])
})

test('rare: the Vermont Slate-colored Junco slash is not flagged', async () => {
  const e = sighting({ 'Scientific Name': 'Junco hyemalis', Subspecies: 'Junco hyemalis hyemalis/carolinensis' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), [])
})

test('rare: a subspecies on both the target and Vermont lists (Willet) is flagged once', async () => {
  const e = sighting({ 'Scientific Name': 'Tringa semipalmata', Date: '2024-07-30', Subspecies: 'Tringa semipalmata inornata' })
  const out = await rareManual(e)
  assert.equal(out.Subspecies.filter(x => x === e).length, 1)
})

test('rare: a subspecies of a species with no subspecies record is ignored by the Subspecies check', async () => {
  const e = sighting({ 'Scientific Name': 'Somateria spectabilis', Subspecies: 'Somateria spectabilis fictus' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Vermont'])
})

test('rare: a record whose Target Subspecies is a string (Cackling Goose) still flags the target', async () => {
  const e = sighting({ 'Scientific Name': 'Branta hutchinsii', Date: '2024-11-01', Subspecies: 'Branta hutchinsii taverneri' })
  const out = await rareManual(e)
  assert.ok(out.Subspecies.includes(e))
})

test('rare: one sighting can land in both OutsideExpectedDates and Subspecies', async () => {
  const e = sighting({ 'Scientific Name': 'Anser albifrons', Date: '2024-07-15', Subspecies: 'Anser albifrons elgasi' })
  const out = await rareManual(e)
  assert.deepEqual(bucketsOf(out, e), ['Subspecies', 'OutsideExpectedDates'])
})

// ===========================================================================
// rare: reading an eBird CSV (opts.input)
// ===========================================================================

test('rare: classifies every row of the Vermont fixture CSV', async () => {
  const out = await rare({ input: VT_CSV })
  assert.deepEqual(summarize(out), {
    Breeding: ['S900000009'],
    Vermont: ['S900000003', 'S900000002', 'S900000016'],
    Champlain: ['S900000004'],
    NEK: ['S900000008'],
    Unknown: ['S900000011'],
    Subspecies: ['S900000013', 'S900000012'],
    OutsideExpectedDates: ['S900000006', 'S900000019']
  })
})

test('rare: CSV rows from outside Vermont are dropped', async () => {
  const out = await rare({ input: VT_CSV })
  const all = Object.values(out).flat().map(x => x['Submission ID'])
  assert.ok(!all.includes('S900000015'))
})

test('rare: CSV rows with no Latitude are dropped', async () => {
  const out = await rare({ input: VT_CSV })
  const all = Object.values(out).flat().map(x => x['Submission ID'])
  assert.ok(!all.includes('S900000018'))
})

test('rare: spuh rows ("Anatidae sp.") are removed before classification', async () => {
  const out = await rare({ input: VT_CSV })
  const all = Object.values(out).flat().map(x => x['Submission ID'])
  assert.ok(!all.includes('S900000017'))
})

test('rare: CSV results are listed newest first', async () => {
  const out = await rare({ input: VT_CSV })
  assert.deepEqual(out.Vermont.map(x => x.Date), ['2024-02-20', '2024-01-10', '2023-12-01'])
})

test('rare: opts.year keeps only that year\'s sightings', async () => {
  const out = await rare({ input: VT_CSV, year: 2024 })
  assert.deepEqual(ids(out.Vermont), ['S900000003', 'S900000002'])
})

test('rare: opts.county limits results to that county', async () => {
  const out = await rare({ input: VT_CSV, county: 'Washington' })
  assert.deepEqual(summarize(out), {
    Vermont: ['S900000003'],
    Champlain: ['S900000004'],
    NEK: ['S900000008'],
    Subspecies: ['S900000012']
  })
})

test('rare: CSV rows gain Town, Region and State from the location lookup', async () => {
  const out = await rare({ input: VT_CSV })
  const e = out.Champlain[0]
  assert.equal(e.Town, 'MONTPELIER')
  assert.equal(e.Region, 'Northern Vermont Piedmont')
  assert.equal(e.State, 'Vermont')
  assert.equal(e.Country, 'US')
})

test('rare: a CSV trinomial is split into species "Scientific Name" and a full "Subspecies"', async () => {
  const out = await rare({ input: VT_CSV })
  const hawk = out.Subspecies.find(x => x['Submission ID'] === 'S900000013')
  assert.equal(hawk['Scientific Name'], 'Buteo jamaicensis')
  assert.equal(hawk.Subspecies, 'Buteo jamaicensis abieticola')
  assert.equal(hawk['Subspecies Notes'].Species, 'Red-tailed Hawk')
})

test('rare: a missing input file rejects with ENOENT', async () => {
  await assert.rejects(rare({ input: path.join(os.tmpdir(), 'ebird-ext-does-not-exist.csv') }), { code: 'ENOENT' })
})

// ===========================================================================
// isSpeciesSightingRare
// ===========================================================================

test('isSpeciesSightingRare: a King Eider in Burlington is reported in Vermont', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'King Eider', town: 'Burlington', date: '2024-01-15' })
  assert.deepEqual(Object.keys(out), BUCKETS)
  assert.equal(out.Vermont.length, 1)
})

test('isSpeciesSightingRare builds a full sighting record from the town', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'King Eider', town: 'Burlington', date: '2024-01-15' }
  await isSpeciesSightingRare(opts)
  assert.deepEqual(opts.data, [{
    County: 'Chittenden',
    Date: '2024-01-15',
    Region: 'Champlain Valley',
    'Scientific Name': 'Somateria spectabilis',
    Species: 'King Eider',
    Subspecies: undefined,
    Town: 'Burlington',
    'Common Name': 'King Eider',
    Location: 'Burlington'
  }])
})

test('isSpeciesSightingRare console.logs the built sighting data once', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'King Eider', town: 'Burlington', date: '2024-01-15' }
  await isSpeciesSightingRare(opts)
  assert.equal(console.log.mock.calls.length, 1)
  assert.equal(console.log.mock.calls[0].arguments[0], opts.data)
})

test('isSpeciesSightingRare sets manual, data and state on the caller\'s opts', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'King Eider', town: 'Burlington', date: '2024-01-15' }
  await isSpeciesSightingRare(opts)
  assert.equal(opts.manual, true)
  assert.equal(opts.state, 'Vermont')
  assert.equal(opts.data.length, 1)
})

test('isSpeciesSightingRare looks species up case-insensitively by common name', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'kInG eIdEr', town: 'Burlington', date: '2024-01-15' }
  const out = await isSpeciesSightingRare(opts)
  assert.equal(opts.data[0]['Scientific Name'], 'Somateria spectabilis')
  assert.equal(opts.data[0].Species, 'King Eider')
  assert.equal(out.Vermont.length, 1)
})

test('isSpeciesSightingRare accepts a scientific name, case-insensitively', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'somateria spectabilis', town: 'Burlington', date: '2024-01-15' }
  const out = await isSpeciesSightingRare(opts)
  assert.equal(opts.data[0].Species, 'King Eider')
  assert.equal(out.Vermont.length, 1)
})

test('isSpeciesSightingRare: an unknown species goes to Unknown with no Scientific Name', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'Imaginary Bird', town: 'Burlington', date: '2024-01-15' }
  const out = await isSpeciesSightingRare(opts)
  assert.equal(out.Unknown.length, 1)
  assert.equal(out.Unknown[0].Species, 'Imaginary Bird')
  assert.equal(out.Unknown[0]['Common Name'], 'Imaginary Bird')
  assert.equal(out.Unknown[0]['Scientific Name'], undefined)
})

test('isSpeciesSightingRare: a common species in season is not reported', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'Canada Goose', town: 'Montpelier', date: '2024-04-15' })
  for (const k of BUCKETS) assert.equal(out[k].length, 0, k)
})

test('isSpeciesSightingRare: Spruce Grouse in Brighton (Essex County) is not reported', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'Spruce Grouse', town: 'Brighton', date: '2024-02-01' }
  const out = await isSpeciesSightingRare(opts)
  assert.equal(opts.data[0].County, 'Essex')
  assert.equal(out.NEK.length, 0)
})

test('isSpeciesSightingRare: Spruce Grouse in Middlebury (Addison County) goes to NEK', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'Spruce Grouse', town: 'Middlebury', date: '2024-02-01' })
  assert.equal(out.NEK.length, 1)
  assert.equal(out.NEK[0].County, 'Addison')
})

test('isSpeciesSightingRare: Harlequin Duck in Montpelier (outside the Champlain Valley) goes to Champlain', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'Harlequin Duck', town: 'Montpelier', date: '2024-01-20' })
  assert.equal(out.Champlain.length, 1)
  assert.equal(out.Champlain[0].Region, 'Northern Vermont Piedmont')
})

test('isSpeciesSightingRare: Harlequin Duck in Middlebury (Champlain Valley) is not reported', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'Harlequin Duck', town: 'Middlebury', date: '2024-01-20' })
  assert.equal(out.Champlain.length, 0)
})

test('isSpeciesSightingRare: a sighting outside the expected dates goes to OutsideExpectedDates', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'Common Nighthawk', town: 'Burlington', date: '2024-01-15' })
  assert.equal(out.OutsideExpectedDates.length, 1)
})

test('isSpeciesSightingRare passes opts.subspecies through to the Subspecies check', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await isSpeciesSightingRare({ species: 'Dark-eyed Junco', town: 'Burlington', date: '2024-01-15', subspecies: 'Junco hyemalis oreganus' })
  assert.equal(out.Subspecies.length, 1)
  assert.equal(out.Subspecies[0].Subspecies, 'Junco hyemalis oreganus')
})

test('isSpeciesSightingRare resolves a lower-case town, capitalizing only the Location field', async (t) => {
  t.mock.method(console, 'log', () => {})
  const opts = { species: 'King Eider', town: 'rutland city', date: '2024-01-15' }
  await isSpeciesSightingRare(opts)
  assert.equal(opts.data[0].County, 'Rutland')
  assert.equal(opts.data[0].Region, 'Vermont Valley')
  assert.equal(opts.data[0].Town, 'rutland city')
  assert.equal(opts.data[0].Location, 'Rutland City')
})

test('isSpeciesSightingRare currently rejects with a TypeError for a town not in Vermont', async (t) => {
  t.mock.method(console, 'log', () => {})
  await assert.rejects(
    isSpeciesSightingRare({ species: 'King Eider', town: 'Atlantis', date: '2024-01-15' }),
    TypeError
  )
})

test.todo('isSpeciesSightingRare should handle an unknown town gracefully: index.js:523 reads f.getTownCentroids(opts.town).geometry, and getTownCentroids returns undefined for towns not in vt_towns.json, so the call throws "Cannot read properties of undefined (reading \'geometry\')"', async (t) => {
  t.mock.method(console, 'log', () => {})
  await assert.doesNotReject(isSpeciesSightingRare({ species: 'King Eider', town: 'Atlantis', date: '2024-01-15' }))
})

// ===========================================================================
// rareAZ
// ===========================================================================

test('rareAZ resolves to undefined and console.logs its output instead', async (t) => {
  const { ret, calls, output } = await runRareAZ(t, { manual: true, data: [] })
  assert.equal(ret, undefined)
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(output), AZ_BUCKETS)
})

test.todo('rareAZ should return its output object like rare() does; the "return output" at index.js:628 is commented out, so callers get undefined', async (t) => {
  t.mock.method(console, 'log', () => {})
  const out = await rareAZ({ manual: true, data: [] })
  assert.deepEqual(Object.keys(out), AZ_BUCKETS)
})

test('rareAZ with manual: true and no data puts the Pine Marten spoof in Unknown', async (t) => {
  const { output } = await runRareAZ(t, { manual: true })
  assert.equal(output.Unknown.length, 1)
  assert.equal(output.Unknown[0].Species, 'Pine Marten')
})

test('rareAZ sets opts.state to "Arizona"', async (t) => {
  const opts = { manual: true, data: [] }
  await runRareAZ(t, opts)
  assert.equal(opts.state, 'Arizona')
})

test('rareAZ: a "V" species (Fulvous Whistling-Duck) goes to the Arizona bucket', async (t) => {
  const e = { 'Scientific Name': 'Dendrocygna bicolor', Date: '2024-02-01' }
  const { output } = await runRareAZ(t, { manual: true, data: [e] })
  assert.deepEqual(bucketsOf(output, e), ['Arizona'])
})

test('rareAZ: a non-breeder with a confirmed breeding code goes to Breeding', async (t) => {
  const e = { 'Scientific Name': 'Anser caerulescens', Date: '2024-03-02', 'Breeding Code': 'NY Nest with Young (Confirmed)' }
  const { output } = await runRareAZ(t, { manual: true, data: [e] })
  assert.deepEqual(bucketsOf(output, e), ['Breeding'])
})

test('rareAZ: Breeding takes precedence over Arizona for a non-breeding "V" species', async (t) => {
  const e = { 'Scientific Name': 'Dendrocygna bicolor', Date: '2024-03-05', 'Breeding Code': 'NY Nest with Young (Confirmed)' }
  const { output } = await runRareAZ(t, { manual: true, data: [e] })
  assert.deepEqual(bucketsOf(output, e), ['Breeding'])
})

test('rareAZ: a known breeder (Breeding "n") with a breeding code is not flagged as Breeding', async (t) => {
  const bbwd = { 'Scientific Name': 'Dendrocygna autumnalis', Date: '2024-03-04', 'Breeding Code': 'NY Nest with Young (Confirmed)' }
  const quetzal = { 'Scientific Name': 'Euptilotis neoxenus', Date: '2024-03-01', 'Breeding Code': 'NY Nest with Young (Confirmed)' }
  const { output } = await runRareAZ(t, { manual: true, data: [bbwd, quetzal] })
  assert.deepEqual(bucketsOf(output, bbwd), [])
  assert.deepEqual(bucketsOf(output, quetzal), ['Arizona'])
})

test('rareAZ: an ignored breeding code (F Flyover) on a common species is not reported', async (t) => {
  const e = { 'Scientific Name': 'Anser caerulescens', Date: '2024-03-03', 'Breeding Code': 'F Flyover' }
  const { output } = await runRareAZ(t, { manual: true, data: [e] })
  assert.deepEqual(bucketsOf(output, e), [])
})

test('rareAZ: a species absent from arizona_records.json goes to Unknown', async (t) => {
  const e = { 'Scientific Name': 'Canachites canadensis', Date: '2024-03-06' }
  const { output } = await runRareAZ(t, { manual: true, data: [e] })
  assert.deepEqual(bucketsOf(output, e), ['Unknown'])
})

test('rareAZ never fills the Subspecies bucket (not implemented yet)', async (t) => {
  const e = { 'Scientific Name': 'Anser caerulescens', Date: '2024-03-03', Subspecies: 'Anser caerulescens atlanticus' }
  const { output } = await runRareAZ(t, { manual: true, data: [e] })
  assert.equal(output.Subspecies.length, 0)
})

test('rareAZ: classifies every row of the Arizona fixture CSV, newest first', async (t) => {
  const { output } = await runRareAZ(t, { input: AZ_CSV })
  assert.deepEqual(summarize(output), {
    Breeding: ['A900000006', 'A900000003'],
    Arizona: ['A900000002', 'A900000001', 'A900000009'],
    Unknown: ['A900000008', 'A900000007']
  })
})

test('rareAZ: spuh rows are removed from the CSV', async (t) => {
  const { output } = await runRareAZ(t, { input: AZ_CSV })
  const all = Object.values(output).flat().map(x => x['Submission ID'])
  assert.ok(!all.includes('A900000010'))
})

test('rareAZ: opts.year keeps only that year\'s sightings', async (t) => {
  const { output } = await runRareAZ(t, { input: AZ_CSV, year: 2024 })
  assert.deepEqual(ids(output.Arizona), ['A900000002', 'A900000001'])
})

test.todo('rareAZ should only consider Arizona sightings: unlike rare(), the CSV path at index.js:546 never applies f.locationFilter, so a Vermont King Eider in the input is reported as an Arizona Unknown', async (t) => {
  const { output } = await runRareAZ(t, { input: AZ_CSV })
  const all = Object.values(output).flat().map(x => x['Submission ID'])
  assert.ok(!all.includes('A900000008'))
})

test('rareAZ with opts.output writes <output>.json and logs where it wrote', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-rareaz-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'az-rare')
  const { calls } = await runRareAZ(t, { manual: true, data: [{ 'Scientific Name': 'Dendrocygna bicolor', Date: '2024-02-01' }], output: target })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].arguments[0], `Wrote ${target}.json.`)
  // The write is not awaited by rareAZ, so poll briefly for it.
  let text
  for (let i = 0; i < 50 && !text; i++) {
    text = await fs.readFile(`${target}.json`, 'utf8').catch(() => undefined)
    if (!text) await new Promise(resolve => setTimeout(resolve, 20))
  }
  const written = JSON.parse(text)
  assert.deepEqual(Object.keys(written), AZ_BUCKETS)
  assert.equal(written.Arizona[0]['Scientific Name'], 'Dendrocygna bicolor')
})

test('rareAZ with an opts.output that already ends in .json does not double the extension', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-rareaz-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'az-rare.json')
  const { calls } = await runRareAZ(t, { manual: true, data: [], output: target })
  assert.equal(calls[0].arguments[0], `Wrote ${target}.`)
})

test.todo('rareAZ should await its file write: index.js:622 calls fs.writeFile without await, so it logs "Wrote ..." and resolves before the file exists, and a failed write becomes an unhandled rejection')

// ===========================================================================
// subspecies: identification categories and life-list leaves
// ===========================================================================

async function runSubspecies (t, opts) {
  t.mock.method(console, 'log', () => {})
  return subspecies(opts)
}

test('subspecies returns every identification category', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.deepEqual(Object.keys(out), ['species', 'allIdentifications', 'spuhs', 'slashes', 'hybrids', 'feral', 'domestic', 'grouping', 'types', 'subspecies', 'leaves'])
  for (const v of Object.values(out)) assert.ok(Array.isArray(v))
})

test('subspecies console.logs the output object once (non-verbose)', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.equal(console.log.mock.calls.length, 1)
  assert.equal(console.log.mock.calls[0].arguments[0], out)
})

test('subspecies: species is the unique species-level list, trinomials collapsed', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.deepEqual([...out.species].sort(), [
    'Anas platyrhynchos',
    'Anser caerulescens',
    'Branta bernicla',
    'Branta canadensis',
    'Buteo jamaicensis',
    'Cardinalis cardinalis',
    'Columba livia',
    'Junco hyemalis',
    'Loxia curvirostra',
    'Setophaga coronata'
  ])
})

test('subspecies: species excludes spuhs, slashes, hybrids and domestics', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  for (const bad of ['Empidonax sp.', 'Aythya marila/affinis', 'Anas platyrhynchos/rubripes', 'Vermivora chrysoptera x cyanoptera', 'Anas platyrhynchos (Domestic type)']) {
    assert.ok(!out.species.includes(bad), bad)
  }
})

test('subspecies: allIdentifications lists each identification once, in date order', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.equal(out.allIdentifications.length, 17)
  assert.equal(new Set(out.allIdentifications).size, 17)
  assert.equal(out.allIdentifications[0], 'Branta bernicla') // the 2023 row
  assert.equal(out.allIdentifications.filter(x => x === 'Anser caerulescens').length, 1)
})

test('subspecies: spuhs, slashes and hybrids are categorised', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.deepEqual(out.spuhs, ['Empidonax sp.'])
  assert.deepEqual(out.slashes, ['Junco hyemalis hyemalis/carolinensis', 'Anas platyrhynchos/rubripes', 'Aythya marila/affinis'])
  assert.deepEqual(out.hybrids, ['Vermivora chrysoptera x cyanoptera'])
})

test('subspecies: feral, domestic, grouping and types are categorised', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.deepEqual(out.feral, ['Columba livia (Feral Pigeon)'])
  assert.deepEqual(out.domestic, ['Anas platyrhynchos (Domestic type)'])
  assert.deepEqual(out.grouping, ['Setophaga coronata [coronata Group]'])
  assert.deepEqual(out.types, ['Loxia curvirostra (type 10)'])
})

test('subspecies: the subspecies list holds only plain trinomials', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.deepEqual(out.subspecies, ['Buteo jamaicensis borealis'])
})

test('subspecies: leaves replace species with their finest identification, sorted', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.deepEqual(out.leaves, [
    'Anas platyrhynchos',
    'Anser caerulescens',
    'Aythya marila/affinis',
    'Branta bernicla',
    'Branta canadensis',
    'Buteo jamaicensis borealis',
    'Cardinalis cardinalis',
    'Columba livia',
    'Columba livia (Feral Pigeon)',
    'Junco hyemalis hyemalis/carolinensis',
    'Loxia curvirostra (type 10)',
    'Setophaga coronata [coronata Group]',
    'Vermivora chrysoptera x cyanoptera'
  ])
})

test('subspecies: leaves never include spuhs or domestic types', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.ok(!out.leaves.includes('Empidonax sp.'))
  assert.ok(!out.leaves.includes('Anas platyrhynchos (Domestic type)'))
})

test('subspecies: a slash whose members were both unseen at species level becomes a leaf', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.ok(out.leaves.includes('Aythya marila/affinis'))
})

test('subspecies: a slash is not a leaf when one of its species was seen', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV })
  assert.ok(!out.leaves.includes('Anas platyrhynchos/rubripes'))
})

test('subspecies: a full-binomial slash is a leaf only when neither binomial was seen', async (t) => {
  const { file } = await tmpCsv(t, [
    { sci: 'Tringa flavipes/Tringa melanoleuca' },
    { sci: 'Calidris minutilla/Calidris pusilla' },
    { sci: 'Calidris pusilla' }
  ])
  const out = await runSubspecies(t, { input: file })
  assert.ok(out.leaves.includes('Tringa flavipes/Tringa melanoleuca'))
  assert.ok(!out.leaves.includes('Calidris minutilla/Calidris pusilla'))
})

test('subspecies: opts.state filters out rows from other states', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV, state: 'Vermont' })
  assert.ok(!out.species.includes('Cardinalis cardinalis'))
  assert.ok(!out.allIdentifications.includes('Cardinalis cardinalis'))
  assert.ok(out.species.includes('Anser caerulescens'))
})

test('subspecies: opts.year keeps only that year (CSV without a trailing newline)', async (t) => {
  const { file } = await tmpCsv(t, [
    { sci: 'Branta bernicla', date: '2023-05-01' },
    { sci: 'Anser caerulescens', date: '2024-01-01' }
  ])
  const out = await runSubspecies(t, { input: file, year: 2024 })
  assert.deepEqual(out.species, ['Anser caerulescens'])
})

test('subspecies: a trailing blank line is ignored when no date filter is given', async (t) => {
  const { file } = await tmpCsv(t, [{ sci: 'Anser caerulescens' }], { trailingNewline: true })
  const out = await runSubspecies(t, { input: file })
  assert.deepEqual(out.allIdentifications, ['Anser caerulescens'])
})

test.todo('subspecies should accept opts.year on a normal CSV that ends in a newline: index.js:755 parses without skipEmptyLines, so the blank last row reaches f.dateFilter (index.js:759, before locationFilter drops it) and helpers.momentFormat(undefined) throws "Cannot read properties of undefined (reading \'includes\')"', async (t) => {
  const out = await runSubspecies(t, { input: LIFE_CSV, year: 2024 })
  assert.ok(!out.species.includes('Branta bernicla'))
})

test('subspecies: "Anatinae sp." with no dabbling duck seen logs an "Unsure" warning', async (t) => {
  const { file } = await tmpCsv(t, [{ sci: 'Anatinae sp.' }, { sci: 'Aythya collaris' }])
  await runSubspecies(t, { input: file })
  const messages = console.log.mock.calls.map(c => c.arguments[0])
  assert.ok(messages.includes('Unsure what to do with Anatinae sp. spuh identifation.'))
})

test('subspecies: "Anatinae sp." with a dabbling duck seen logs no warning', async (t) => {
  const { file } = await tmpCsv(t, [{ sci: 'Anatinae sp.' }, { sci: 'Anas platyrhynchos' }])
  await runSubspecies(t, { input: file })
  const messages = console.log.mock.calls.map(c => c.arguments[0])
  assert.ok(!messages.some(m => typeof m === 'string' && m.startsWith('Unsure')))
})

test('subspecies: verbose mode logs node removals, leaf additions and kept species', async (t) => {
  await runSubspecies(t, { input: LIFE_CSV, verbose: true })
  const messages = console.log.mock.calls.map(c => c.arguments[0]).filter(m => typeof m === 'string')
  assert.ok(messages.includes('Removing node: Buteo jamaicensis'))
  assert.ok(messages.includes('Adding leaf: Buteo jamaicensis borealis'))
  assert.ok(messages.includes('Keeping species leaf: Anser caerulescens'))
})

test('subspecies: a missing input file rejects with ENOENT', async () => {
  await assert.rejects(subspecies({ input: path.join(os.tmpdir(), 'ebird-ext-does-not-exist.csv') }), { code: 'ENOENT' })
})
