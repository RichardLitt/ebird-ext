import test from 'node:test'
import assert from 'node:assert/strict'
import { capitalizeFirstLetters, parseDateFormat, momentFormat } from '../helpers.js'

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
  assert.equal(parseDateFormat('year'), 'YYYY')
})

test('parseDateFormat maps month to YYYY-MM', () => {
  assert.equal(parseDateFormat('month'), 'YYYY-MM')
})

test('parseDateFormat maps day to YYYY-MM-DD', () => {
  assert.equal(parseDateFormat('day'), 'YYYY-MM-DD')
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

test('momentFormat detects dash-delimited ISO dates', () => {
  assert.equal(momentFormat('2024-01-15'), 'YYYY-MM-DD')
})

test('momentFormat detects slash-delimited US dates', () => {
  assert.equal(momentFormat('01/15/2024'), 'MM/DD/YYYY')
})

test('momentFormat throws on undelimited input', () => {
  assert.throws(() => momentFormat('nodelim'), /Invalid Date String/)
})
