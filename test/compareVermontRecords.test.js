import test from 'node:test'
import assert from 'node:assert/strict'
import { rare } from '../index.js'
import { compareLists, renames } from '../scripts/compareVermontRecords.js'

// Made-up lists and sightings: two versions of a tiny VBRC list.
const record = (species, sci, reporting, occurrence) => ({ Breeding: '', Occurrence: occurrence, Reporting: reporting, 'Scientific Name': sci, Species: species, Status: '' })
const OLD = [
  record('Snow Goose', 'Anser caerulescens', '', '3A-5C, 9A-1D'),
  record('Pink-footed Goose', 'Anser brachyrhynchus', 'V', ''),
  record('Willet', 'Tringa semipalmata', '', '5D, 7B-10D'),
  record('Winter Wren', 'Troglodytes hiemalis', '', '4A-11D+')
]
const NEW = [
  record('Snow Goose', 'Anser caerulescens', '', '3A-5A, 9C-1B'),
  record('Pink-footed Goose', 'Anser brachyrhynchus', '', '10C-3C'),
  record('Saltmarsh Willet', 'Tringa semipalmata', 'V', ''),
  record('Winter Wren', 'Nannus hiemalis', '', '3A-11D+')
]

const sighting = (id, name, sci, date) => ({
  'Submission ID': id,
  'Common Name': name,
  'Scientific Name': sci,
  'State/Province': 'US-VT',
  County: 'Washington',
  Latitude: '44.2601',
  Longitude: '-72.5754',
  Date: date,
  Count: '1'
})

const ROWS = () => [
  sighting('S1', 'Willet', 'Tringa semipalmata', '2024-08-01'), // fine before, V now
  sighting('S2', 'Snow Goose', 'Anser caerulescens', '2024-05-25'), // inside the old dates, within a month of the new ones
  sighting('S3', 'Snow Goose', 'Anser caerulescens', '2024-07-01'), // outside both
  sighting('S4', 'Pink-footed Goose', 'Anser brachyrhynchus', '2023-11-01'), // V before, in dates now
  sighting('S5', 'Winter Wren', 'Troglodytes hiemalis', '2024-06-01'), // old eBird name
  sighting('S6', 'Winter Wren', 'Nannus hiemalis', '2024-06-01'), // new eBird name
  sighting('S7', 'Willet', 'Tringa semipalmata', '2019-08-01') // before --since
]

const ids = list => list.map(c => c.e['Submission ID']).sort()

test('rare: opts.records replaces the bundled VBRC list', async () => {
  const out = await rare({ input: ROWS(), records: NEW })
  assert.deepEqual(out.Vermont.map(e => e['Submission ID']).sort(), ['S1', 'S7'])
  const before = await rare({ input: ROWS(), records: OLD })
  assert.deepEqual(before.Vermont.map(e => e['Submission ID']), ['S4'])
})

test('renames pairs scientific names that changed for the same species, both ways', () => {
  const { toNew, toOld } = renames(OLD, NEW)
  assert.deepEqual([...toNew], [['Troglodytes hiemalis', 'Nannus hiemalis']])
  assert.deepEqual([...toOld], [['Nannus hiemalis', 'Troglodytes hiemalis']])
})

test('compareLists finds sightings flagged only under the new list, and only under the old', async () => {
  const changes = await compareLists(ROWS(), OLD, NEW, { since: '2022-01-01' })
  assert.deepEqual(ids(changes.nowFlagged), ['S1'])
  assert.deepEqual(changes.nowFlagged[0].buckets, ['Vermont'])
  assert.deepEqual(ids(changes.noLongerFlagged), ['S4'])
})

test('compareLists matches a renamed species under either name', async () => {
  const changes = await compareLists(ROWS(), OLD, NEW)
  const wrens = [...changes.nowFlagged, ...changes.noLongerFlagged].filter(c => c.e['Common Name'] === 'Winter Wren')
  assert.deepEqual(wrens, [])
})

test('compareLists without --since includes older sightings', async () => {
  const changes = await compareLists(ROWS(), OLD, NEW)
  assert.deepEqual(ids(changes.nowFlagged), ['S1', 'S7'])
})
