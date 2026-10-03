import { test } from 'node:test'
import assert from 'node:assert/strict'
import taxonomicSort from '../taxonomicSort.js'
import taxonomy from '../taxonomies/eBird_Taxonomy_VT.json' with { type: 'json' }
import { commonInOrder, scientificInOrder, unknowns } from './fixtures/taxonomicSort.js'

// taxonomicSort(list, name = 'common') sorts an array of species names in
// place with Array.prototype.sort, using each name's index in
// taxonomies/eBird_Taxonomy_VT.json as the sort key. `name` selects
// common names ('common', the default; anything other than 'scientific'
// behaves the same) or scientific names ('scientific').
//
// Names not found in the taxonomy sort to the end, keeping their input order.

const fn = taxonomicSort

// ---------------------------------------------------------------------------
// Taxonomy data the sort depends on
// ---------------------------------------------------------------------------

test('taxonomy file is a non-empty array', () => {
  assert.ok(Array.isArray(taxonomy))
  // Species and hybrids eBird lists for Vermont (scripts/updateTaxonomy.js)
  assert.ok(taxonomy.length > 400)
})

test('every taxonomy entry has PRIMARY_COM_NAME and SCI_NAME strings', () => {
  for (const entry of taxonomy) {
    assert.equal(typeof entry.PRIMARY_COM_NAME, 'string')
    assert.equal(typeof entry.SCI_NAME, 'string')
  }
})

test('taxonomy common names are unique, so indexOf gives an unambiguous rank', () => {
  const names = taxonomy.map(x => x.PRIMARY_COM_NAME)
  assert.equal(new Set(names).size, names.length)
})

test('taxonomy scientific names are unique', () => {
  const names = taxonomy.map(x => x.SCI_NAME)
  assert.equal(new Set(names).size, names.length)
})

test('taxonomy names have no leading or trailing whitespace', () => {
  for (const entry of taxonomy) {
    assert.equal(entry.PRIMARY_COM_NAME, entry.PRIMARY_COM_NAME.trim())
    assert.equal(entry.SCI_NAME, entry.SCI_NAME.trim())
  }
})

test('common-name fixture is in taxonomy order', () => {
  const idx = commonInOrder.map(n => taxonomy.findIndex(x => x.PRIMARY_COM_NAME === n))
  assert.ok(idx.every(i => i >= 0), 'every fixture name exists in the taxonomy')
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
})

test('scientific-name fixture is in taxonomy order', () => {
  const idx = scientificInOrder.map(n => taxonomy.findIndex(x => x.SCI_NAME === n))
  assert.ok(idx.every(i => i >= 0), 'every fixture name exists in the taxonomy')
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
})

test('unknown fixture names are absent from the taxonomy under both schemes', () => {
  for (const n of unknowns) {
    assert.equal(taxonomy.some(x => x.PRIMARY_COM_NAME === n || x.SCI_NAME === n), false)
  }
})

// ---------------------------------------------------------------------------
// Return value and mutation
// ---------------------------------------------------------------------------

test('returns the same array reference it was given', () => {
  const list = [...commonInOrder]
  assert.equal(fn(list), list)
})

test('sorts in place: the input array is the result', () => {
  const list = ['Mallard', 'Snow Goose']
  const result = fn(list)
  assert.equal(result, list)
  assert.deepEqual(list, result)
})

test('preserves length', () => {
  const list = [...commonInOrder, ...unknowns]
  assert.equal(fn(list).length, commonInOrder.length + unknowns.length)
})

test('preserves the multiset of elements (nothing added or dropped)', () => {
  const list = ['House Sparrow', 'cheese', 'Mallard', 'Snow Goose', 'cheese']
  const before = [...list].sort()
  assert.deepEqual([...fn(list)].sort(), before)
})

test('keeps duplicate entries', () => {
  const result = fn(['Mallard', 'Mallard', 'Mallard'])
  assert.deepEqual(result, ['Mallard', 'Mallard', 'Mallard'])
})

test('does not modify the taxonomy data', () => {
  const firstBefore = { ...taxonomy[0] }
  const lengthBefore = taxonomy.length
  fn([...commonInOrder].reverse())
  fn([...scientificInOrder].reverse(), 'scientific')
  assert.equal(taxonomy.length, lengthBefore)
  assert.deepEqual(taxonomy[0], firstBefore)
})

test('repeated calls give the same result', () => {
  const a = fn([...commonInOrder, ...unknowns])
  const b = fn([...commonInOrder, ...unknowns])
  assert.deepEqual(a, b)
})

test('sorting an already-sorted result is idempotent', () => {
  const once = fn([...commonInOrder, ...unknowns])
  const twice = fn([...once])
  assert.deepEqual(twice, once)
})

// ---------------------------------------------------------------------------
// Empty and trivial inputs
// ---------------------------------------------------------------------------

test('empty array returns an empty array', () => {
  assert.deepEqual(fn([]), [])
})

test('empty array with scientific mode returns an empty array', () => {
  assert.deepEqual(fn([], 'scientific'), [])
})

test('single known species is returned unchanged', () => {
  assert.deepEqual(fn(['Blue Jay']), ['Blue Jay'])
})

test('single unknown species is returned unchanged', () => {
  assert.deepEqual(fn(['cheese']), ['cheese'])
})

// ---------------------------------------------------------------------------
// Already-ordered input
// ---------------------------------------------------------------------------

test('common names already in taxonomic order stay in order', () => {
  assert.deepEqual(fn([...commonInOrder]), commonInOrder)
})

test('common names in order stay in order with explicit "common" mode', () => {
  assert.deepEqual(fn([...commonInOrder], 'common'), commonInOrder)
})

test('scientific names already in taxonomic order stay in order', () => {
  assert.deepEqual(fn([...scientificInOrder], 'scientific'), scientificInOrder)
})

test('an unrecognised mode string behaves like common mode', () => {
  // Anything other than exactly 'scientific' selects common names.
  assert.deepEqual(fn([...commonInOrder], 'latin'), fn([...commonInOrder], 'common'))
})

test('mode is case-sensitive: "Scientific" is treated as common mode', () => {
  assert.deepEqual(
    fn([...scientificInOrder], 'Scientific'),
    fn([...scientificInOrder], 'common')
  )
})

// ---------------------------------------------------------------------------
// Unknown names, casing and whitespace (ties)
// ---------------------------------------------------------------------------

test('a list of only unknown names keeps its input order (all ties)', () => {
  assert.deepEqual(fn([...unknowns]), unknowns)
  const reversed = [...unknowns].reverse()
  assert.deepEqual(fn([...reversed]), reversed)
})

test('unknown names keep input order in scientific mode too', () => {
  const reversed = [...unknowns].reverse()
  assert.deepEqual(fn([...reversed], 'scientific'), reversed)
})

test('lowercased species names are not matched and keep their relative order', () => {
  // Matching is exact: 'house sparrow' is not 'House Sparrow'.
  const list = ['house sparrow', 'snow goose', 'mallard']
  assert.deepEqual(fn([...list]), list)
})

test('uppercased species names are not matched and keep their relative order', () => {
  const list = ['HOUSE SPARROW', 'SNOW GOOSE', 'MALLARD']
  assert.deepEqual(fn([...list]), list)
})

test('names with surrounding whitespace are not matched and keep their relative order', () => {
  const list = [' House Sparrow', 'Snow Goose ', '\tMallard\n']
  assert.deepEqual(fn([...list]), list)
})

test('common names in scientific mode are all unknown and keep input order', () => {
  const reversed = [...commonInOrder].reverse()
  assert.deepEqual(fn([...reversed], 'scientific'), reversed)
})

test('scientific names in common mode are all unknown and keep input order', () => {
  const reversed = [...scientificInOrder].reverse()
  assert.deepEqual(fn([...reversed]), reversed)
})

test('empty strings are treated as unknown and keep their relative order', () => {
  const list = ['', 'cheese', '', 'Dodo']
  assert.deepEqual(fn([...list]), list)
})

// ---------------------------------------------------------------------------
// Stability
// ---------------------------------------------------------------------------

test('is stable for a large list of tied (unknown) names', () => {
  // V8 uses TimSort (stable) for Array.prototype.sort. With > 22 elements a
  // non-stable algorithm would be likely to shuffle ties.
  const list = Array.from({ length: 200 }, (_, i) => `unknown-${i}`)
  assert.deepEqual(fn([...list]), list)
})

test('is stable for tied distinct objects that compare equal', () => {
  // Non-string elements are never found by indexOf, so they all tie.
  const a = { id: 'a' }
  const b = { id: 'b' }
  const c = { id: 'c' }
  const result = fn([c, a, b])
  assert.equal(result[0], c)
  assert.equal(result[1], a)
  assert.equal(result[2], b)
})

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

test('accepts the output of Object.keys (how shimeBirdData callers use it)', () => {
  const byTaxon = { 'Branta canadensis': {}, 'Ardea ibis': {}, 'Passer domesticus': {} }
  assert.deepEqual(fn(Object.keys(byTaxon), 'scientific'), Object.keys(byTaxon))
})

test('non-string elements (numbers, null, objects) do not throw', () => {
  const obj = {}
  const list = [1, null, obj, 'cheese']
  assert.doesNotThrow(() => fn(list))
  assert.deepEqual(list, [1, null, obj, 'cheese'])
})

test('undefined elements are moved to the end by Array.prototype.sort', () => {
  // The spec sorts undefined after every other value without calling the
  // comparator, regardless of what the comparator would say.
  const result = fn([undefined, 'cheese', undefined, 'Dodo'])
  assert.deepEqual(result, ['cheese', 'Dodo', undefined, undefined])
})

test('holes in a sparse array are moved to the end', () => {
  // eslint-disable-next-line no-sparse-arrays
  const list = ['cheese', , 'Dodo']
  fn(list)
  assert.equal(list[0], 'cheese')
  assert.equal(list[1], 'Dodo')
  assert.equal(2 in list, false)
})

test('a frozen empty or one-element array is accepted', () => {
  assert.deepEqual(fn(Object.freeze([])), [])
  assert.deepEqual(fn(Object.freeze(['Mallard'])), ['Mallard'])
})

test('a frozen multi-element array throws (sort writes in place)', () => {
  assert.throws(() => fn(Object.freeze(['Mallard', 'Snow Goose'])), TypeError)
})

test('a string instead of an array throws TypeError', () => {
  assert.throws(() => fn('House Sparrow'), TypeError)
})

test('null or undefined list throws TypeError', () => {
  assert.throws(() => fn(null), TypeError)
  assert.throws(() => fn(undefined), TypeError)
})

test('a Set is not accepted (no .sort method)', () => {
  assert.throws(() => fn(new Set(commonInOrder)), TypeError)
})

// ---------------------------------------------------------------------------
// Taxonomic reordering
// ---------------------------------------------------------------------------

test('reorders shuffled common names into taxonomic order', () => {
  const shuffled = [...commonInOrder].reverse()
  assert.deepEqual(fn(shuffled), commonInOrder)
})

test('reorders an interleaved common-name list', () => {
  const list = ['House Sparrow', 'Snow Goose', 'Red-tailed Hawk', 'Canada Goose', 'Blue Jay', 'Mallard', 'Western Cattle-Egret']
  assert.deepEqual(fn(list), commonInOrder)
})

test('reorders shuffled scientific names with name="scientific"', () => {
  const shuffled = [...scientificInOrder].reverse()
  assert.deepEqual(fn(shuffled, 'scientific'), scientificInOrder)
})

test('sorting the same list twice gives the same result', () => {
  const once = fn([...commonInOrder].reverse())
  assert.deepEqual(fn([...once]), once)
})

// ---------------------------------------------------------------------------
// Unknown species
// ---------------------------------------------------------------------------

test('species missing from the taxonomy go at the end', () => {
  const list = ['cheese', 'House Sparrow', 'Dodo', 'Snow Goose']
  assert.deepEqual(fn(list), ['Snow Goose', 'House Sparrow', 'cheese', 'Dodo'])
})

test('unknowns keep their relative input order at the end', () => {
  const list = [unknowns[3], 'Mallard', unknowns[0], unknowns[2], 'Snow Goose', unknowns[1]]
  assert.deepEqual(fn(list), ['Snow Goose', 'Mallard', unknowns[3], unknowns[0], unknowns[2], unknowns[1]])
})

test('unknowns go at the end in scientific mode too', () => {
  const list = ['cheese', 'Passer domesticus', 'Branta canadensis']
  assert.deepEqual(fn(list, 'scientific'), ['Branta canadensis', 'Passer domesticus', 'cheese'])
})

test('wrongly-cased names are treated as unknown and go last', () => {
  const list = ['house sparrow', 'Snow Goose']
  assert.deepEqual(fn(list), ['Snow Goose', 'house sparrow'])
})
