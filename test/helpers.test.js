import test from 'node:test'
import assert from 'node:assert/strict'
import { capitalizeFirstLetters, parseDateFormat, parseDate, monthAndDay, leapYearDaysInMonth, skipInvalidDates } from '../helpers.js'

test('capitalizeFirstLetters title-cases lowercase words', () => {
  assert.equal(capitalizeFirstLetters('hello world'), 'Hello World')
})

test('capitalizeFirstLetters lowercases before capitalizing', () => {
  assert.equal(capitalizeFirstLetters('HELLO WORLD'), 'Hello World')
})

test('capitalizeFirstLetters on empty string returns empty string', () => {
  assert.equal(capitalizeFirstLetters(''), '')
})

// eBird common names include hyphens and apostrophes; the function splits only
// on whitespace so these inner punctuation marks must be preserved verbatim.
test('capitalizeFirstLetters preserves hyphens (Red-tailed Hawk)', () => {
  assert.equal(capitalizeFirstLetters('RED-TAILED HAWK'), 'Red-tailed Hawk')
})

test("capitalizeFirstLetters preserves apostrophes (Bell's Vireo)", () => {
  assert.equal(capitalizeFirstLetters("BELL'S VIREO"), "Bell's Vireo")
})

test('capitalizeFirstLetters on a single word capitalizes it', () => {
  assert.equal(capitalizeFirstLetters('vermont'), 'Vermont')
})

test('parseDateFormat maps year to YYYY', () => {
  assert.equal(parseDateFormat('year'), 'yyyy')
})

test('parseDateFormat maps month to YYYY-MM', () => {
  assert.equal(parseDateFormat('month'), 'yyyy-MM')
})

test('parseDateFormat maps day to YYYY-MM-DD', () => {
  assert.equal(parseDateFormat('day'), 'yyyy-MM-dd')
})

test('parseDateFormat returns undefined for undefined input', () => {
  assert.equal(parseDateFormat(undefined), undefined)
})

test('parseDateFormat throws on unrecognized timespan', () => {
  assert.throws(() => parseDateFormat('invalid'), /Unable to parse timespan/)
})

// Any falsy timespan (empty string, null, 0) short-circuits to undefined
// rather than throwing -- callers rely on this to mean "no formatting".
test('parseDateFormat returns undefined for empty string', () => {
  assert.equal(parseDateFormat(''), undefined)
})

test('parseDateFormat returns undefined for null', () => {
  assert.equal(parseDateFormat(null), undefined)
})

// Case matters: 'year' is recognized, 'YEAR' is not.
test('parseDateFormat throws on uppercase YEAR', () => {
  assert.throws(() => parseDateFormat('YEAR'), /Unable to parse timespan/)
})

test('parseDate reads a YYYY-MM-DD date as local midnight', () => {
  assert.deepEqual(parseDate('2024-01-15'), new Date(2024, 0, 15))
})

test('parseDate reads an MM/DD/YYYY date', () => {
  assert.deepEqual(parseDate('01/15/2024'), new Date(2024, 0, 15))
})

test('parseDate ignores a time after the date', () => {
  assert.deepEqual(parseDate('2026-09-06 11:47'), new Date(2026, 8, 6))
})

test('parseDate gives an Invalid Date for an impossible or malformed date', () => {
  assert.ok(Number.isNaN(parseDate('2023-02-29').getTime()))
  assert.ok(Number.isNaN(parseDate('2023-ab-01').getTime()))
})

test('parseDate throws on undelimited input', () => {
  assert.throws(() => parseDate('nodelim'), /Invalid Date String/)
})

test('monthAndDay reads a YYYY-MM-DD date', () => {
  assert.deepEqual(monthAndDay('2023-10-01'), ['10', '01'])
})

test('monthAndDay reads an MM/DD/YYYY date', () => {
  assert.deepEqual(monthAndDay('12/31/2022'), ['12', '31'])
})

test('monthAndDay accepts Feb 29 in a leap year', () => {
  assert.deepEqual(monthAndDay('2024-02-29'), ['02', '29'])
  assert.deepEqual(monthAndDay('02/29/2024'), ['02', '29'])
})

test('monthAndDay returns undefined for an impossible date', () => {
  assert.equal(monthAndDay('2023-02-29'), undefined)
  assert.equal(monthAndDay('2023-04-31'), undefined)
  assert.equal(monthAndDay('13/01/2023'), undefined)
})

test('monthAndDay throws on undelimited input (via parseDate)', () => {
  assert.throws(() => monthAndDay('20231001'), /Invalid Date String/)
})

test('leapYearDaysInMonth gives February 29 days', () => {
  assert.equal(leapYearDaysInMonth(2), 29)
  assert.equal(leapYearDaysInMonth('02'), 29)
})

test('leapYearDaysInMonth covers 366 days in total', () => {
  let total = 0
  for (let m = 1; m <= 12; m++) total += leapYearDaysInMonth(m)
  assert.equal(total, 366)
  assert.equal(leapYearDaysInMonth(1), 31)
  assert.equal(leapYearDaysInMonth(4), 30)
  assert.equal(leapYearDaysInMonth('12'), 31)
})

test('skipInvalidDates keeps real dates in either format, in order', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const rows = [
    { 'Submission ID': 'S1', Date: '2024-02-29' },
    { 'Submission ID': 'S2', Date: '12/31/2022' }
  ]
  assert.deepEqual(skipInvalidDates(rows), rows)
  assert.equal(warn.mock.calls.length, 0)
})

test('skipInvalidDates drops impossible dates and warns once with count and unique IDs', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const rows = [
    { 'Submission ID': 'S1', Date: '2023-02-29' },
    { 'Submission ID': 'S1', Date: '2023-02-29' },
    { 'Submission ID': 'S2', Date: '2023-03-01' },
    { 'Submission ID': 'S3', Date: '02/30/2023' }
  ]
  assert.deepEqual(skipInvalidDates(rows), [rows[2]])
  assert.equal(warn.mock.calls.length, 1)
  assert.equal(warn.mock.calls[0].arguments[0], 'Skipping 3 row(s) with an impossible date: S1, S3')
})

test('skipInvalidDates returns [] for [] without warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  assert.deepEqual(skipInvalidDates([]), [])
  assert.equal(warn.mock.calls.length, 0)
})

test('skipInvalidDates still throws on an undelimited date (via parseDate)', (t) => {
  t.mock.method(console, 'warn', () => {})
  assert.throws(() => skipInvalidDates([{ Date: '20240601' }]), /Invalid Date String/)
})
