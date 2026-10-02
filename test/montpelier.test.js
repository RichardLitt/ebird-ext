import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildHotspotDates, unbirdedDays, dataForThisWeekInHistory, main } from '../montpelier.js'

// The columns of an EBD sampling file that buildHotspotDates reads, in an
// order of their own, to check it finds them by name
const HEADER = ['LOCALITY', 'LOCALITY ID', 'LOCALITY TYPE', 'COUNTY CODE', 'OBSERVATION DATE', 'PROTOCOL NAME', 'ALL SPECIES REPORTED', 'CHECKLIST COMMENTS']

function row (overrides = {}) {
  const r = {
    LOCALITY: 'Berlin Pond',
    'LOCALITY ID': 'L1',
    'LOCALITY TYPE': 'H',
    'COUNTY CODE': 'US-VT-023',
    'OBSERVATION DATE': '2024-05-03',
    'PROTOCOL NAME': 'Traveling',
    'ALL SPECIES REPORTED': '1',
    'CHECKLIST COMMENTS': '',
    ...overrides
  }
  return HEADER.map(h => r[h]).join('\t')
}

async function samplingFile (t, rows, header = HEADER.join('\t')) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-montpelier-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'ebd_sampling.txt')
  await fs.writeFile(file, [header, ...rows].join('\n') + '\n', 'utf8')
  return file
}

// ===========================================================================
// buildHotspotDates
// ===========================================================================

test('buildHotspotDates records the day of each complete checklist under its month', async (t) => {
  const file = await samplingFile(t, [row(), row({ 'OBSERVATION DATE': '2020-12-25' })])
  const hotspots = await buildHotspotDates(file)
  assert.equal(hotspots.L1.Location, 'Berlin Pond')
  assert.deepEqual(hotspots.L1['Dates Birded']['05'], [3])
  assert.deepEqual(hotspots.L1['Dates Birded']['12'], [25])
})

test('buildHotspotDates gives every hotspot all twelve months, empty or not', async (t) => {
  const hotspots = await buildHotspotDates(await samplingFile(t, [row()]))
  assert.deepEqual(Object.keys(hotspots.L1['Dates Birded']).sort(), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
  assert.deepEqual(hotspots.L1['Dates Birded']['01'], [])
})

test('buildHotspotDates merges years: the same day in two years is one day', async (t) => {
  const file = await samplingFile(t, [row({ 'OBSERVATION DATE': '2019-05-03' }), row(), row({ 'OBSERVATION DATE': '2024-05-01' })])
  const hotspots = await buildHotspotDates(file)
  assert.deepEqual(hotspots.L1['Dates Birded']['05'], [1, 3], 'deduplicated and sorted')
})

test('buildHotspotDates skips incomplete, incidental and historical checklists', async (t) => {
  const file = await samplingFile(t, [
    row({ 'ALL SPECIES REPORTED': '0', 'OBSERVATION DATE': '2024-01-01' }),
    row({ 'PROTOCOL NAME': 'Incidental', 'OBSERVATION DATE': '2024-01-02' }),
    row({ 'PROTOCOL NAME': 'Historical', 'OBSERVATION DATE': '2024-01-03' }),
    row({ 'PROTOCOL NAME': 'Stationary', 'OBSERVATION DATE': '2024-01-04' })
  ])
  const hotspots = await buildHotspotDates(file)
  assert.deepEqual(hotspots.L1['Dates Birded']['01'], [4])
})

test('buildHotspotDates skips personal locations and other counties', async (t) => {
  const file = await samplingFile(t, [
    row({ 'LOCALITY ID': 'L2', 'LOCALITY TYPE': 'P' }),
    row({ 'LOCALITY ID': 'L3', 'COUNTY CODE': 'US-VT-001' }),
    row()
  ])
  assert.deepEqual(Object.keys(await buildHotspotDates(file)), ['L1'])
})

test('buildHotspotDates takes another county', async (t) => {
  const file = await samplingFile(t, [row({ 'LOCALITY ID': 'L3', 'COUNTY CODE': 'US-VT-001' }), row()])
  assert.deepEqual(Object.keys(await buildHotspotDates(file, 'US-VT-001')), ['L3'])
})

test('buildHotspotDates fails clearly on a file that is not a sampling file', async (t) => {
  const file = await samplingFile(t, ['a\tb'], 'COMMON NAME\tOBSERVATION COUNT')
  await assert.rejects(buildHotspotDates(file), /no LOCALITY column/)
})

test('buildHotspotDates returns {} for a header-only file', async (t) => {
  assert.deepEqual(await buildHotspotDates(await samplingFile(t, [])), {})
})

// ===========================================================================
// unbirdedDays
// ===========================================================================

const DATA = {
  L1: { Location: 'Berlin Pond', 'Dates Birded': { '01': [1, 2, 3], '02': [], 12: [15] } }
}

test('unbirdedDays lists the days of each month with no checklist', () => {
  const days = unbirdedDays('L1', DATA)
  assert.equal(days['01'][0], 4)
  assert.ok(!days['01'].includes(2))
  assert.equal(days['02'][0], 1)
  assert.ok(!days['12'].includes(15))
  assert.equal(days['12'].length, 30)
})

test('unbirdedDays covers every day of a hotspot with no record', () => {
  const days = unbirdedDays('L404', DATA)
  assert.deepEqual(Object.keys(days).sort(), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
  assert.equal(days['01'].length, 31)
})

// ===========================================================================
// dataForThisWeekInHistory
// ===========================================================================

test('dataForThisWeekInHistory: no record means 0% coverage and no data this week', () => {
  assert.deepEqual(dataForThisWeekInHistory({ id: 'L404' }, DATA), { nextUnbirdedWeek: 'No data', coveragePercentage: 0 })
})

test('dataForThisWeekInHistory counts the latest checklist\'s week as birded', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 4, 13, 12) })
  const result = dataForThisWeekInHistory({ id: 'L404', latestObsDt: '2026-05-13 07:00' }, DATA)
  assert.equal(result.nextUnbirdedWeek, '')
  assert.equal(result.coveragePercentage, 100 / 52)
})

test('dataForThisWeekInHistory gives the share of the 52 weeks birded in any year', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 4, 13, 12) })
  // Jan 1-3 2026 fall in one week, Dec 15 in another
  const result = dataForThisWeekInHistory({ id: 'L1' }, DATA)
  assert.equal(result.coveragePercentage, 2 / 52 * 100)
  assert.equal(result.nextUnbirdedWeek, 'No data')
})

// ===========================================================================
// main
// ===========================================================================

test('main rejects an unknown command', async () => {
  await assert.rejects(main(['nonsense']), /Unknown command: nonsense/)
})

test('main needs an argument for the commands that take one', async () => {
  await assert.rejects(main(['daysYouveBirdedAtHotspot']), /hotspot ID/)
  await assert.rejects(main(['hotspotDates']), /EBD sampling file/)
  await assert.rejects(main(['region']), /region code/)
})

test('main asks for EBIRD_API_TOKEN before calling the eBird API', async (t) => {
  const saved = process.env.EBIRD_API_TOKEN
  delete process.env.EBIRD_API_TOKEN
  t.after(() => { if (saved !== undefined) process.env.EBIRD_API_TOKEN = saved })
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('should not be called') })
  await assert.rejects(main(['ids']), /EBIRD_API_TOKEN/)
  assert.equal(fetch.mock.calls.length, 0)
})

test('main sends the API key with eBird requests', async (t) => {
  const saved = process.env.EBIRD_API_TOKEN
  process.env.EBIRD_API_TOKEN = 'test-key'
  t.after(() => { if (saved === undefined) delete process.env.EBIRD_API_TOKEN; else process.env.EBIRD_API_TOKEN = saved })
  t.mock.method(console, 'log', () => {})
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [{ locId: 'L1' }] }))
  await main(['region', 'US-VT-023'])
  const [url, init] = fetch.mock.calls[0].arguments
  assert.equal(url, 'https://api.ebird.org/v2/ref/hotspot/US-VT-023?fmt=json')
  assert.equal(init.headers['X-eBirdApiToken'], 'test-key')
})

test('main reports an eBird API error with its status', async (t) => {
  const saved = process.env.EBIRD_API_TOKEN
  process.env.EBIRD_API_TOKEN = 'test-key'
  t.after(() => { if (saved === undefined) delete process.env.EBIRD_API_TOKEN; else process.env.EBIRD_API_TOKEN = saved })
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 403 }))
  await assert.rejects(main(['region', 'US-VT-023']), /eBird API 403/)
})
