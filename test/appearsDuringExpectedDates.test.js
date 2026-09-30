import test from 'node:test'
import assert from 'node:assert/strict'
import appearsDuringExpectedDates from '../appearsDuringExpectedDates.js'

// The "Occurrence" string in vermont_records.json encodes when a species is
// expected to appear:
//
//   "3A-5C"        single range: March week 1 to May week 3
//   "3A-5C, 9A-1D" multi-range: comma-separated alternatives
//   "10B-5B"       winter wrap: Oct week 2 through May week 2 (next year)
//   "3A-12C+"      open-ended: trailing "+" anywhere returns true
//   "1A-12D"       full-year shortcut
//   "" / null      no restriction
//
// Letter codes (week-of-month): A=1, B=2, C=3, D=4, E=6 (intentional gap at 5).
//
// Each range is padded by ~1 month on each side ("Leave one month on either
// side", per a comment in the source). Tests use dates that are clearly
// inside or clearly outside (accounting for padding) to stay deterministic
// across the moment-weekofmonth week-boundary math.

const fn = appearsDuringExpectedDates

// ---------------------------------------------------------------------------
// No-restriction values (any occurrence that should always match)
// ---------------------------------------------------------------------------

test('empty string occurrence accepts any date', () => {
  assert.equal(fn('2024-02-15', ''), true)
  assert.equal(fn('2024-06-15', ''), true)
  assert.equal(fn('2024-10-15', ''), true)
})

test('undefined occurrence accepts any date', () => {
  assert.equal(fn('2024-02-15', undefined), true)
})

test('null occurrence accepts any date', () => {
  assert.equal(fn('2024-02-15', null), true)
})

test('1A-12D (full-year shortcut) accepts January', () => {
  assert.equal(fn('2024-01-15', '1A-12D'), true)
})

test('1A-12D accepts mid-summer', () => {
  assert.equal(fn('2024-07-15', '1A-12D'), true)
})

test('1A-12D accepts December', () => {
  assert.equal(fn('2024-12-15', '1A-12D'), true)
})

test('1A-12D accepts a leap-year Feb 29', () => {
  assert.equal(fn('2024-02-29', '1A-12D'), true)
})

test('"+" suffix on a partial-year range accepts any date', () => {
  // The "+" anywhere in the occurrence string short-circuits the timespan
  // check entirely -- the upper bound is treated as open-ended.
  assert.equal(fn('2024-07-15', '3A-5C+'), true)
})

test('"+" suffix on a long range accepts any date', () => {
  assert.equal(fn('2024-01-15', '3A-12C+'), true)
})

// ---------------------------------------------------------------------------
// Single range -- date inside
// ---------------------------------------------------------------------------

test('3A-5C (Mar-May) accepts mid-April', () => {
  assert.equal(fn('2024-04-15', '3A-5C'), true)
})

test('3A-5C accepts late-March', () => {
  assert.equal(fn('2024-03-25', '3A-5C'), true)
})

test('3A-5C accepts mid-May', () => {
  assert.equal(fn('2024-05-15', '3A-5C'), true)
})

test('6A-8D (Jun-Aug) accepts mid-July', () => {
  assert.equal(fn('2024-07-15', '6A-8D'), true)
})

test('9A-11D (Sep-Nov) accepts mid-October', () => {
  assert.equal(fn('2024-10-15', '9A-11D'), true)
})

test('3A-3D accepts mid-March (single month)', () => {
  assert.equal(fn('2024-03-15', '3A-3D'), true)
})

test('6A-6D accepts mid-June (single month, no boundary)', () => {
  assert.equal(fn('2024-06-15', '6A-6D'), true)
})

test('3A-3A accepts a date in early March (single week)', () => {
  assert.equal(fn('2024-03-05', '3A-3A'), true)
})

// ---------------------------------------------------------------------------
// Single range -- date outside (accounting for ~1-month padding)
// ---------------------------------------------------------------------------

test('3A-5C rejects mid-August (well after, past padding)', () => {
  assert.equal(fn('2024-08-15', '3A-5C'), false)
})

test('3A-5C rejects mid-September', () => {
  assert.equal(fn('2024-09-15', '3A-5C'), false)
})

test('3A-5C rejects mid-October', () => {
  assert.equal(fn('2024-10-15', '3A-5C'), false)
})

test('3A-5C rejects mid-November', () => {
  assert.equal(fn('2024-11-15', '3A-5C'), false)
})

test('6A-8D rejects mid-January (well before)', () => {
  assert.equal(fn('2024-01-15', '6A-8D'), false)
})

test('6A-8D rejects mid-December', () => {
  assert.equal(fn('2024-12-15', '6A-8D'), false)
})

test('9A-11D (Sep-Nov) rejects mid-April', () => {
  assert.equal(fn('2024-04-15', '9A-11D'), false)
})

test('9A-11D rejects mid-June', () => {
  assert.equal(fn('2024-06-15', '9A-11D'), false)
})

// ---------------------------------------------------------------------------
// Padding behavior -- "1 month on each side" inflates accepted range
// ---------------------------------------------------------------------------

test('3A-5C accepts late-February (1-month padding before)', () => {
  // Feb is the month before March; documented padding zone.
  assert.equal(fn('2024-02-28', '3A-5C'), true)
})

test('3A-5C accepts mid-June (1-month padding after)', () => {
  // June is the month after May; documented padding zone.
  assert.equal(fn('2024-06-15', '3A-5C'), true)
})

test('6A-8D accepts mid-May (1-month padding before)', () => {
  assert.equal(fn('2024-05-15', '6A-8D'), true)
})

test('6A-8D accepts mid-September (1-month padding after)', () => {
  assert.equal(fn('2024-09-15', '6A-8D'), true)
})

// ---------------------------------------------------------------------------
// Multi-range with comma
// ---------------------------------------------------------------------------

test('3A-3B, 9A-9B: matches first sub-range', () => {
  assert.equal(fn('2024-03-08', '3A-3B, 9A-9B'), true)
})

test('3A-3B, 9A-9B: matches second sub-range', () => {
  assert.equal(fn('2024-09-08', '3A-3B, 9A-9B'), true)
})

test('3A-3B, 9A-9B: rejects mid-June (genuine gap)', () => {
  // March + 1mo padding ends around April; September - 1mo padding starts
  // around August. Mid-June is solidly in the gap.
  assert.equal(fn('2024-06-15', '3A-3B, 9A-9B'), false)
})

test('3A-3B, 9A-9B: rejects mid-July (gap)', () => {
  assert.equal(fn('2024-07-15', '3A-3B, 9A-9B'), false)
})

test('three sub-ranges: matches first', () => {
  assert.equal(fn('2024-02-08', '2A-2B, 6A-6B, 10A-10B'), true)
})

test('three sub-ranges: matches middle', () => {
  assert.equal(fn('2024-06-08', '2A-2B, 6A-6B, 10A-10B'), true)
})

test('three sub-ranges: matches last', () => {
  assert.equal(fn('2024-10-08', '2A-2B, 6A-6B, 10A-10B'), true)
})

test('three sub-ranges: rejects a date in a real gap', () => {
  // April is between (Feb+padding ending ~March) and (Jun-padding starting
  // ~May). Mid-April is the genuine gap.
  assert.equal(fn('2024-04-15', '2A-2B, 6A-6B, 10A-10B'), false)
})

// ---------------------------------------------------------------------------
// Winter wrap (range whose end-month < start-month)
// ---------------------------------------------------------------------------

test('10B-5B (Oct-May winter wrap) accepts mid-November', () => {
  assert.equal(fn('2024-11-15', '10B-5B'), true)
})

test('10B-5B accepts mid-December', () => {
  assert.equal(fn('2024-12-15', '10B-5B'), true)
})

test('10B-5B accepts mid-January', () => {
  assert.equal(fn('2024-01-15', '10B-5B'), true)
})

test('10B-5B accepts mid-February', () => {
  assert.equal(fn('2024-02-15', '10B-5B'), true)
})

test('10B-5B accepts mid-April', () => {
  assert.equal(fn('2024-04-15', '10B-5B'), true)
})

test('10B-5B rejects mid-July (summer gap, opposite of wrap)', () => {
  assert.equal(fn('2024-07-15', '10B-5B'), false)
})

test('10B-5B rejects mid-August', () => {
  assert.equal(fn('2024-08-15', '10B-5B'), false)
})

test('11A-2D (narrower winter wrap) accepts mid-December', () => {
  assert.equal(fn('2024-12-15', '11A-2D'), true)
})

test('11A-2D rejects mid-June (clear gap)', () => {
  assert.equal(fn('2024-06-15', '11A-2D'), false)
})

// ---------------------------------------------------------------------------
// Year-agnostic: the year of the input date should not affect the result
// ---------------------------------------------------------------------------

test('year of input date is irrelevant: 1995 mid-April matches 3A-5C', () => {
  assert.equal(fn('1995-04-15', '3A-5C'), true)
})

test('year of input date is irrelevant: 2030 mid-April matches 3A-5C', () => {
  assert.equal(fn('2030-04-15', '3A-5C'), true)
})

test('year of input date is irrelevant: 1995 mid-August rejects 3A-5C', () => {
  assert.equal(fn('1995-08-15', '3A-5C'), false)
})

test('year of input date is irrelevant: leap year Feb 29 evaluates', () => {
  assert.equal(fn('2024-02-29', '1A-3D'), true)
})

// ---------------------------------------------------------------------------
// Return-type guarantees -- always a boolean, never a coerced value
// ---------------------------------------------------------------------------

test('return value is always a strict boolean (true case)', () => {
  assert.strictEqual(fn('2024-04-15', '3A-5C'), true)
})

test('return value is always a strict boolean (false case)', () => {
  assert.strictEqual(fn('2024-08-15', '3A-5C'), false)
})

test('return value is always a strict boolean (no-restriction case)', () => {
  assert.strictEqual(fn('2024-04-15', ''), true)
})

test('return value is always a strict boolean (plus-suffix case)', () => {
  assert.strictEqual(fn('2024-07-15', '3A-5C+'), true)
})

// ---------------------------------------------------------------------------
// Known issues (documented as todos so the bugs are visible in test output)
// ---------------------------------------------------------------------------

test.todo('whitespace-only occurrence currently crashes (TypeError on null match)', () => {
  // fn('2024-02-15', '   ') throws: Cannot read properties of null (reading '0')
  // The function should probably treat whitespace as no-restriction.
})

test.todo('a malformed occurrence with an unknown letter should be rejected gracefully', () => {
  // fn('2024-04-15', '3Z-5Z') currently treats Z as A (default fallthrough
  // in getWeek), silently accepting bad input.
})
