import test from 'node:test'
import assert from 'node:assert/strict'
import { dateFilter, completeChecklistFilter, locationFilter } from '../filters.js'
import fixture from './fixtures/checklists.js'

// locationFilter mutates checklists in place (adds .State, .Country, .Region, .Town),
// so each test gets a deep-cloned copy.
const clone = () => structuredClone(fixture)

test('dateFilter { year: 2023 } keeps only 2023 checklists', () => {
  const result = dateFilter(clone(), { year: 2023 })
  assert.equal(result.length, 2)
  assert.ok(result.every(x => x.Date.startsWith('2023')))
})

test('dateFilter with no year/after returns the input unchanged', () => {
  const list = clone()
  const result = dateFilter(list, {})
  assert.equal(result.length, list.length)
})

test('dateFilter { after: "2024-01-01" } keeps only later checklists', () => {
  const result = dateFilter(clone(), { after: '2024-01-01' })
  assert.equal(result.length, 2)
  assert.ok(result.every(x => x.Date >= '2024-01-01'))
})

test('completeChecklistFilter { complete: true } drops incomplete checklists', () => {
  const result = completeChecklistFilter(clone(), { complete: true })
  assert.equal(result.length, 3)
  assert.ok(result.every(x => parseInt(x['All Obs Reported']) === 1))
})

test('locationFilter { state: "Vermont" } keeps only VT checklists', () => {
  const result = locationFilter(clone(), { state: 'Vermont' })
  assert.equal(result.length, 3)
  assert.ok(result.every(x => x.State === 'Vermont'))
  // Point-in-polygon lookup should have populated Town for Vermont records.
  assert.ok(result.every(x => typeof x.Town === 'string' && x.Town.length > 0))
})
