import test from 'node:test'
import assert from 'node:assert/strict'
import VermontRecords from '../data/vermont_records.json' with { type: 'json' }
import appearsDuringExpectedDates from '../appearsDuringExpectedDates.js'
import { rare } from '../index.js'
import {
  parseStateList,
  applyEbirdNames,
  formatRecords,
  diffRecords,
  EBIRD_SCIENTIFIC_NAMES
} from '../scripts/updateVermontRecords.js'

// data/vermont_records.json is generated from the VBRC state list PDF by
// scripts/updateVermontRecords.js. These tests check the generated data is
// well-formed for rare(), and that the converter parses the PDF's text layout.

const KEYS = ['Breeding', 'Occurrence', 'Reporting', 'Scientific Name', 'Species', 'Status']
const REPORTING = ['', 'V', 'N', 'B', 'C', 'K']
const BREEDING = ['', '*']
const STATUS = ['', 'I', 'X', 'H', 'E']
const MONTHS = Array.from({ length: 12 }, (_, m) => `2024-${String(m + 1).padStart(2, '0')}-15`)

test('vermont_records: every record has exactly the expected keys, in order', () => {
  for (const r of VermontRecords) {
    assert.deepEqual(Object.keys(r), KEYS, r.Species)
  }
})

test('vermont_records: Reporting, Breeding and Status only use codes rare() knows', () => {
  for (const r of VermontRecords) {
    assert.ok(REPORTING.includes(r.Reporting), `${r.Species} Reporting ${JSON.stringify(r.Reporting)}`)
    assert.ok(BREEDING.includes(r.Breeding), `${r.Species} Breeding ${JSON.stringify(r.Breeding)}`)
    assert.ok(STATUS.includes(r.Status), `${r.Species} Status ${JSON.stringify(r.Status)}`)
  }
})

test('vermont_records: every Occurrence parses with appearsDuringExpectedDates', () => {
  for (const r of VermontRecords) {
    // A malformed value is false on every date; a well-formed one matches somewhere
    assert.doesNotThrow(() => MONTHS.forEach(d => appearsDuringExpectedDates(d, r.Occurrence)), r.Species)
    assert.ok(MONTHS.some(d => appearsDuringExpectedDates(d, r.Occurrence)), `${r.Species} ${r.Occurrence}`)
  }
})

test('vermont_records: species without an Occurrence are all Reporting "V"', () => {
  // Otherwise they would never be flagged by date or by reporting code
  assert.deepEqual(VermontRecords.filter(r => !r.Occurrence && r.Reporting !== 'V').map(r => r.Species), [])
})

test('vermont_records: common and scientific names are unique and look like names', () => {
  const sci = VermontRecords.map(r => r['Scientific Name'])
  const common = VermontRecords.map(r => r.Species)
  assert.equal(new Set(sci).size, sci.length)
  assert.equal(new Set(common).size, common.length)
  for (const r of VermontRecords) {
    assert.match(r['Scientific Name'], /^[A-Z][a-z]+ [a-z]+$/, r.Species)
    assert.match(r.Species, /^[A-Z][A-Za-z' -]+$/, r.Species)
  }
})

test('vermont_records: renamed taxa use current eBird scientific names', () => {
  const sci = new Set(VermontRecords.map(r => r['Scientific Name']))
  for (const name of ['Astur atricapillus', 'Astur cooperii', 'Botaurus exilis', 'Ardea ibis', 'Tyto furcata', 'Larus smithsonianus']) {
    assert.ok(sci.has(name), name)
  }
  for (const name of ['Accipiter atricapillus', 'Accipiter gentilis', 'Accipiter cooperii', 'Bubulcus ibis', 'Tyto alba', 'Larus argentatus', 'Acanthis hornemanni']) {
    assert.ok(!sci.has(name), name)
  }
  for (const ebird of Object.values(EBIRD_SCIENTIFIC_NAMES)) {
    assert.ok(sci.has(ebird), ebird)
  }
  for (const aos of Object.keys(EBIRD_SCIENTIFIC_NAMES)) {
    assert.ok(!sci.has(aos), aos)
  }
})

test('rare: common Vermont birds under their current eBird names are not flagged', async () => {
  const names = ['Astur atricapillus', 'Astur cooperii', 'Setophaga aestiva', 'Leuconotopicus villosus', 'Hesperiphona vespertina']
  const data = names.map(n => ({ 'Scientific Name': n, Date: '2024-06-15', County: 'Washington', Region: 'Northern Vermont Piedmont', Town: 'Montpelier' }))
  const out = await rare({ manual: true, data })
  for (const [bucket, entries] of Object.entries(out)) {
    assert.deepEqual(entries.map(e => e['Scientific Name']), [], bucket)
  }
})

// ---------------------------------------------------------------------------
// The converter
// ---------------------------------------------------------------------------

const SAMPLE = `
            This checklist includes all species for which acceptable specimen, photographic, or written documentation
             exists for Vermont. The list has been approved by the Vermont Bird Records Committee and includes
            8 species representing 22 orders and 63 families of birds.

               Species                             Scientific name              Status Breeding Reporting Occurrence
         Order — ANSERIFORMES
           Family Anatidae — Ducks, Geese, and Swans
     1         Black-bellied Whistling-Duck        Dendrocygna autumnalis                           V
     2         Snow Goose                          Anser caerulescens                                      3A-5C, 9A-1D
 3        Mute Swan                        Cygnus olor                     I *          N         1A-12D
 4        Wood Duck                        Aix sponsa                          *                  3A-12C+
 5        Western Grebe                      Aechmophorus occidentalis    H       V
 6        Passenger Pigeon                   Ectopistes migratorius       X*      V
  7     Willet                            Tringa semipalmata                     5D, 7B-10D
  8        Hammond’s Flycatcher             Empidonax hammondii                   V
`

test('parseStateList: parses status, breeding, reporting and occurrence tokens', () => {
  const records = parseStateList(SAMPLE)
  assert.equal(records.length, 8)
  assert.deepEqual(records.map(r => [r.Species, r['Scientific Name'], r.Status, r.Breeding, r.Reporting, r.Occurrence]), [
    ['Black-bellied Whistling-Duck', 'Dendrocygna autumnalis', '', '', 'V', ''],
    ['Snow Goose', 'Anser caerulescens', '', '', '', '3A-5C, 9A-1D'],
    ['Mute Swan', 'Cygnus olor', 'I', '*', 'N', '1A-12D'],
    ['Wood Duck', 'Aix sponsa', '', '*', '', '3A-12C+'],
    ['Western Grebe', 'Aechmophorus occidentalis', 'H', '', 'V', ''],
    ['Passenger Pigeon', 'Ectopistes migratorius', 'X', '*', 'V', ''],
    ['Willet', 'Tringa semipalmata', '', '', '', '5D, 7B-10D'],
    ["Hammond's Flycatcher", 'Empidonax hammondii', '', '', 'V', '']
  ])
  for (const r of records) assert.deepEqual(Object.keys(r), KEYS)
})

test('parseStateList: fails on a gap in the numbering (a row it could not read)', () => {
  const broken = SAMPLE.replace(/^ 3 .*$/m, ' 3        Mute Swan  ???')
  assert.throws(() => parseStateList(broken), /Expected row 3/)
})

test('parseStateList: fails on an unknown code', () => {
  const broken = SAMPLE.replace('I *          N', 'I *          Q')
  assert.throws(() => parseStateList(broken), /Unrecognised codes in row 3/)
})

test('parseStateList: fails if the count disagrees with the header', () => {
  assert.throws(() => parseStateList(SAMPLE.replace('includes\n            8 species', 'includes\n            9 species')), /Header says 9/)
})

test('applyEbirdNames swaps only the mapped scientific names', () => {
  const records = applyEbirdNames(parseStateList(SAMPLE), { 'Tringa semipalmata': 'Tringa fictus' })
  assert.equal(records[6]['Scientific Name'], 'Tringa fictus')
  assert.equal(records[6].Species, 'Willet')
  assert.equal(records[2]['Scientific Name'], 'Cygnus olor')
})

test('formatRecords writes one record per line and round-trips', () => {
  const records = parseStateList(SAMPLE)
  const text = formatRecords(records)
  assert.equal(text.trim().split('\n').length, records.length)
  assert.deepEqual(JSON.parse(text), records)
})

test('diffRecords reports added, removed, renamed and changed species', () => {
  const before = parseStateList(SAMPLE)
  const after = structuredClone(before)
  after[0]['Scientific Name'] = 'Dendrocygna fictus' // same common name -> rename
  after[1].Occurrence = '1A-12D'
  after.pop()
  after.push({ ...before[0], Species: 'New Bird', 'Scientific Name': 'Nova avis' })
  const report = diffRecords(before, after)
  assert.deepEqual(report.added.map(r => r.Species), ['New Bird'])
  assert.deepEqual(report.removed.map(r => r.Species), ["Hammond's Flycatcher"])
  assert.deepEqual(report.renamed.map(r => r.to['Scientific Name']), ['Dendrocygna fictus'])
  assert.deepEqual(report.changed.map(c => [c.record.Species, c.changes]), [
    ['Snow Goose', [{ field: 'Occurrence', from: '3A-5C, 9A-1D', to: '1A-12D' }]]
  ])
})
