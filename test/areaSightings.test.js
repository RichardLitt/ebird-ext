import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeCodes,
  mergeLists,
  encodeGrid,
  decodeGrid,
  mergeGrid
} from '../scripts/updateAreaSightings.js'
import { isBandingCode } from '../bandingCodes.js'

// --merge in scripts/updateAreaSightings.js: the current lists keep their
// species and order, and gain new species after them.

test('mergeCodes: keeps the old order and appends only new codes', () => {
  assert.deepEqual(mergeCodes(['BCCH', 'AMRO', 'BLJA'], ['AMRO', 'SNBU', 'BCCH', 'KIEI']), ['BCCH', 'AMRO', 'BLJA', 'SNBU', 'KIEI'])
})

test('mergeCodes: an area missing from the old file takes the new list', () => {
  assert.deepEqual(mergeCodes(undefined, ['AMRO']), ['AMRO'])
})

test('mergeLists: merges every area on the map', () => {
  const merged = mergeLists({ MONTPELIER: ['AMRO'] }, { MONTPELIER: ['BLJA'], CALAIS: ['SNBU'] })
  assert.deepEqual(merged, { MONTPELIER: ['AMRO', 'BLJA'], CALAIS: ['SNBU'] })
})

test('encodeGrid and decodeGrid round-trip', () => {
  const grid = new Map([['2470,-2900', new Set(['AMRO', 'BLJA'])], ['2471,-2900', new Set(['SNBU'])]])
  assert.deepEqual(decodeGrid(JSON.parse(encodeGrid(grid).json)), grid)
})

test('decodeGrid refuses a grid of another size', () => {
  assert.throws(() => decodeGrid({ lat: 0.01, lng: 0.025, species: [], squares: {} }), /rebuild/)
})

test('mergeGrid: unions squares without changing the old grid', () => {
  const old = new Map([['1,1', new Set(['AMRO'])]])
  const merged = mergeGrid(old, new Map([['1,1', new Set(['BLJA'])], ['1,2', new Set(['SNBU'])]]))
  assert.deepEqual(merged, new Map([['1,1', new Set(['AMRO', 'BLJA'])], ['1,2', new Set(['SNBU'])]]))
  assert.deepEqual(old, new Map([['1,1', new Set(['AMRO'])]]))
})

// The committed lists: every entry a banding code (so no spuhs, slashes or
// hybrids, which have none) and none twice

for (const [file, areas] of [['townsightings', 256], ['regionssightings', 9], ['countysightings', 14]]) {
  test(`${file}.json: ${areas} areas, each a list of distinct banding codes`, async () => {
    const lists = (await import(`../data/${file}.json`, { with: { type: 'json' } })).default
    assert.equal(Object.keys(lists).length, areas)
    for (const [area, codes] of Object.entries(lists)) {
      assert.ok(codes.length > 0, `${area} is empty`)
      assert.equal(new Set(codes).size, codes.length, `${area} has a code twice`)
      assert.deepEqual(codes.filter(code => !isBandingCode(code)), [], area)
    }
  })
}
