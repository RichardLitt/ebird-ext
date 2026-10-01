import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Papa from 'papaparse'
import { isEBDHeader, isEBDRows, fromEBDRow, fromEBD, collapseSharedChecklists, parseEBD, EBD_PARSE_OPTIONS } from '../ebd.js'
import { getData, rare, rareReport } from '../index.js'

// eBird Basic Dataset files are named ebd_*.txt, which .gitignore keeps out of
// the repo (they hold other people's records). So the fake file is built here
// and written to a temp directory at test time, never committed.

const COLUMNS = [
  'GLOBAL UNIQUE IDENTIFIER', 'LAST EDITED DATE', 'TAXONOMIC ORDER', 'CATEGORY',
  'TAXON CONCEPT ID', 'COMMON NAME', 'SCIENTIFIC NAME', 'SUBSPECIES COMMON NAME',
  'SUBSPECIES SCIENTIFIC NAME', 'EXOTIC CODE', 'OBSERVATION COUNT', 'BREEDING CODE',
  'BREEDING CATEGORY', 'BEHAVIOR CODE', 'AGE/SEX', 'COUNTRY', 'COUNTRY CODE', 'STATE',
  'STATE CODE', 'COUNTY', 'COUNTY CODE', 'IBA CODE', 'BCR CODE', 'USFWS CODE',
  'ATLAS BLOCK', 'LOCALITY', 'LOCALITY ID', 'LOCALITY TYPE', 'LATITUDE', 'LONGITUDE',
  'OBSERVATION DATE', 'TIME OBSERVATIONS STARTED', 'OBSERVER ID',
  'SAMPLING EVENT IDENTIFIER', 'PROTOCOL TYPE', 'PROTOCOL CODE', 'PROJECT CODE',
  'DURATION MINUTES', 'EFFORT DISTANCE KM', 'EFFORT AREA HA', 'NUMBER OBSERVERS',
  'ALL SPECIES REPORTED', 'GROUP IDENTIFIER', 'HAS MEDIA', 'APPROVED', 'REVIEWED',
  'REASON', 'TRIP COMMENTS', 'SPECIES COMMENTS'
]

const MIDDLEBURY = { COUNTY: 'Addison', 'COUNTY CODE': 'US-VT-001', LATITUDE: '44.0153', LONGITUDE: '-73.1673', LOCALITY: 'Test Marsh' }
const BURLINGTON = { COUNTY: 'Chittenden', 'COUNTY CODE': 'US-VT-007', LATITUDE: '44.4759', LONGITUDE: '-73.2121', LOCALITY: 'Test Waterfront' }

function ebdRow (fields) {
  return {
    'GLOBAL UNIQUE IDENTIFIER': `URN:CornellLabOfOrnithology:EBIRD:OBS${Math.floor(Math.random() * 1e9)}`,
    CATEGORY: 'species',
    'OBSERVATION COUNT': '1',
    COUNTRY: 'United States',
    'COUNTRY CODE': 'US',
    STATE: 'Vermont',
    'STATE CODE': 'US-VT',
    'LOCALITY ID': 'L1',
    'LOCALITY TYPE': 'P',
    'OBSERVATION DATE': '2026-03-10',
    'TIME OBSERVATIONS STARTED': '08:00:00',
    'OBSERVER ID': 'obsr1',
    'PROTOCOL TYPE': 'Traveling',
    'DURATION MINUTES': '60',
    'NUMBER OBSERVERS': '1',
    'ALL SPECIES REPORTED': '1',
    APPROVED: '1',
    REVIEWED: '0',
    ...MIDDLEBURY,
    ...fields
  }
}

const ROWS = [
  // A shared checklist: two observers, one sighting
  ebdRow({ 'COMMON NAME': 'Barnacle Goose', 'SCIENTIFIC NAME': 'Branta leucopsis', 'SAMPLING EVENT IDENTIFIER': 'S1', 'GROUP IDENTIFIER': 'G1', 'OBSERVER ID': 'obsr1', REVIEWED: '1', 'SPECIES COMMENTS': 'Photos taken' }),
  ebdRow({ 'COMMON NAME': 'Barnacle Goose', 'SCIENTIFIC NAME': 'Branta leucopsis', 'SAMPLING EVENT IDENTIFIER': 'S2', 'GROUP IDENTIFIER': 'G1', 'OBSERVER ID': 'obsr2', REVIEWED: '1' }),
  // A comment with a stray double quote must not swallow the rows after it
  ebdRow({ 'COMMON NAME': 'American Robin', 'SCIENTIFIC NAME': 'Turdus migratorius', 'SAMPLING EVENT IDENTIFIER': 'S1', 'GROUP IDENTIFIER': 'G1', 'SPECIES COMMENTS': '"Singing by the barn' }),
  // A target subspecies, recorded the EBD way (species plus subspecies columns)
  ebdRow({ 'COMMON NAME': 'Red-tailed Hawk', 'SCIENTIFIC NAME': 'Buteo jamaicensis', 'SUBSPECIES COMMON NAME': 'Red-tailed Hawk (abieticola)', 'SUBSPECIES SCIENTIFIC NAME': 'Buteo jamaicensis abieticola', CATEGORY: 'issf', 'SAMPLING EVENT IDENTIFIER': 'S3', 'OBSERVER ID': 'obsr3' }),
  // Same rarity, wrong year
  ebdRow({ 'COMMON NAME': 'Barnacle Goose', 'SCIENTIFIC NAME': 'Branta leucopsis', 'SAMPLING EVENT IDENTIFIER': 'S4', 'OBSERVATION DATE': '2025-11-02' }),
  // Same rarity, wrong county
  ebdRow({ 'COMMON NAME': 'Barnacle Goose', 'SCIENTIFIC NAME': 'Branta leucopsis', 'SAMPLING EVENT IDENTIFIER': 'S5', ...BURLINGTON })
]

// Real EBD files are tab-separated, unquoted, with a trailing tab on every line
const toEBDText = rows => [COLUMNS, ...rows.map(r => COLUMNS.map(c => r[c] ?? ''))]
  .map(cells => cells.join('\t') + '\t').join('\n') + '\n'

let dir
let ebdFile
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-ebd-'))
  ebdFile = path.join(dir, 'ebd_US-VT-001_202601_202612_relSep-2026.txt')
  await fs.writeFile(ebdFile, toEBDText(ROWS), 'utf8')
})
after(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

// ===========================================================================
// Detection
// ===========================================================================

test('isEBDHeader spots an EBD file by its first line', () => {
  assert.equal(isEBDHeader(toEBDText(ROWS)), true)
  assert.equal(isEBDHeader('Submission ID,Common Name,Scientific Name\nS1,Robin,Turdus'), false)
  assert.equal(isEBDHeader('Submission ID,Common Name\nS1,SAMPLING EVENT IDENTIFIER'), false)
})

test('isEBDRows spots rows that were parsed elsewhere (the site uploader)', () => {
  assert.equal(isEBDRows(ROWS), true)
  assert.equal(isEBDRows([{ 'Submission ID': 'S1' }]), false)
  assert.equal(isEBDRows([]), false)
  assert.equal(isEBDRows('a string'), false)
})

// ===========================================================================
// Column mapping
// ===========================================================================

test('fromEBDRow maps EBD columns onto MyEBirdData names', () => {
  const row = fromEBDRow(ROWS[0])
  assert.equal(row['Submission ID'], 'S1')
  assert.equal(row['Common Name'], 'Barnacle Goose')
  assert.equal(row['Scientific Name'], 'Branta leucopsis')
  assert.equal(row['State/Province'], 'US-VT')
  assert.equal(row.County, 'Addison')
  assert.equal(row.Location, 'Test Marsh')
  assert.equal(row.Latitude, '44.0153')
  assert.equal(row.Date, '2026-03-10')
  assert.equal(row.Protocol, 'Traveling')
  assert.equal(row['Observation Details'], 'Photos taken')
  assert.equal(row['Observer ID'], 'obsr1')
  assert.equal(row.Reviewed, '1')
  assert.equal(row.Approved, '1')
})

test('fromEBDRow puts the subspecies on the name fields, as MyEBirdData does', () => {
  const row = fromEBDRow(ROWS[3])
  assert.equal(row['Common Name'], 'Red-tailed Hawk (abieticola)')
  assert.equal(row['Scientific Name'], 'Buteo jamaicensis abieticola')
})

test('fromEBDRow trims padded values such as breeding codes', () => {
  assert.equal(fromEBDRow(ebdRow({ 'BREEDING CODE': 'NY ' }))['Breeding Code'], 'NY')
})

test('fromEBDRow reads PROTOCOL NAME from newer EBD releases', () => {
  const row = ebdRow({ 'PROTOCOL NAME': 'Stationary' })
  delete row['PROTOCOL TYPE']
  assert.equal(fromEBDRow(row).Protocol, 'Stationary')
})

test('collapseSharedChecklists keeps one copy of each taxon per group', () => {
  const rows = ROWS.map(fromEBDRow)
  const collapsed = collapseSharedChecklists(rows)
  assert.equal(collapsed.length, rows.length - 1)
  assert.equal(collapsed.filter(r => r['Group Identifier'] === 'G1' && r['Common Name'] === 'Barnacle Goose').length, 1)
  // Rows without a group are never merged, even if they look the same
  const lone = [rows[4], { ...rows[4] }]
  assert.equal(collapseSharedChecklists(lone).length, 2)
})

test('fromEBD skips blank rows', () => {
  assert.equal(fromEBD([...ROWS, {}]).length, ROWS.length - 1)
})

// ===========================================================================
// getData
// ===========================================================================

test('getData reads a raw EBD .txt file', async () => {
  const data = await getData(ebdFile)
  assert.equal(data.length, ROWS.length - 1) // one shared-checklist duplicate collapsed
  assert.ok(data.every(r => r['Submission ID'] && r.Date))
})

test('getData keeps parsing past a comment with a stray double quote', async () => {
  const data = await getData(ebdFile)
  assert.equal(data.find(r => r['Common Name'] === 'American Robin')['Observation Details'], '"Singing by the barn')
  assert.ok(data.some(r => r['Submission ID'] === 'S5'))
})

test('getData converts EBD rows that were already parsed', async () => {
  const parsed = Papa.parse(toEBDText(ROWS), EBD_PARSE_OPTIONS).data
  assert.deepEqual(
    (await getData(parsed)).map(r => r['Submission ID']),
    (await getData(ebdFile)).map(r => r['Submission ID'])
  )
})

test('parseEBD turns raw EBD text into the same rows as reading the file', async () => {
  const text = '\uFEFF' + toEBDText(ROWS)
  assert.deepEqual(await getData(parseEBD(text)), await getData(ebdFile))
})

test('rare accepts parseEBD rows, as the site passes them', async () => {
  const out = await rare({ input: parseEBD(toEBDText(ROWS)), county: 'Addison', year: '2026' })
  assert.deepEqual(out.Subspecies.map(r => r['Submission ID']), ['S3'])
})

// ===========================================================================
// rare on EBD data
// ===========================================================================

test('rare on an EBD file finds the county rarity for the year, once', async () => {
  const out = await rare({ input: ebdFile, county: 'Addison', year: '2026' })
  const flagged = Object.values(out).flat()
  const geese = flagged.filter(r => r['Common Name'] === 'Barnacle Goose')
  assert.deepEqual(geese.map(r => r['Submission ID']), ['S1'])
})

test('rare on an EBD file flags a target subspecies', async () => {
  const out = await rare({ input: ebdFile, county: 'Addison', year: '2026' })
  assert.deepEqual(out.Subspecies.map(r => r.Subspecies), ['Buteo jamaicensis abieticola'])
})

test('rare on an EBD file honours the county and year filters', async () => {
  const flagged = Object.values(await rare({ input: ebdFile })).flat().map(r => r['Submission ID'])
  assert.ok(flagged.includes('S4'))
  assert.ok(flagged.includes('S5'))
})

// ===========================================================================
// rareReport
// ===========================================================================

test('rareReport prints a heading per non-empty bucket and one line per record', async () => {
  const lines = rareReport(await rare({ input: ebdFile, county: 'Addison', year: '2026' }))
  const goose = lines.find(l => l.includes('Barnacle Goose'))
  assert.match(goose, /^ {2}2026-03-10 \| Barnacle Goose \| Test Marsh, Middlebury, Addison \| obsr1 \| https:\/\/ebird\.org\/checklist\/S1$/)
  assert.ok(lines.includes('Subspecies (1)'))
  assert.ok(lines.some(l => l.includes('[Buteo jamaicensis abieticola]')))
  assert.ok(!lines.some(l => /\(0\)$/.test(l)))
})

test('rareReport shows the breeding code in the nesting bucket', () => {
  const lines = rareReport({ Breeding: [{ Date: '2026-06-01', 'Common Name': 'Test Bird', County: 'Addison', 'Breeding Code': 'NY', 'Submission ID': 'S9' }] })
  assert.deepEqual(lines, [
    'Nesting Records (breeding code used) (1)',
    '  2026-06-01 | Test Bird | Addison | breeding: NY | https://ebird.org/checklist/S9'
  ])
})

test('rareReport says so when there is nothing to report', () => {
  assert.deepEqual(rareReport({ Vermont: [], Unknown: [] }), ['No records to report to the VBRC.'])
})
