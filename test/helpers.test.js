const test = require('node:test')
const assert = require('node:assert/strict')
const { capitalizeFirstLetters, parseDateFormat, momentFormat } = require('../helpers')

test('capitalizeFirstLetters title-cases lowercase words', () => {
  assert.equal(capitalizeFirstLetters('hello world'), 'Hello World')
})

test('capitalizeFirstLetters lowercases before capitalizing', () => {
  assert.equal(capitalizeFirstLetters('HELLO WORLD'), 'Hello World')
})

test('capitalizeFirstLetters on empty string returns empty string', () => {
  assert.equal(capitalizeFirstLetters(''), '')
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

test('momentFormat detects dash-delimited ISO dates', () => {
  assert.equal(momentFormat('2024-01-15'), 'YYYY-MM-DD')
})

test('momentFormat detects slash-delimited US dates', () => {
  assert.equal(momentFormat('01/15/2024'), 'MM/DD/YYYY')
})

test('momentFormat throws on undelimited input', () => {
  assert.throws(() => momentFormat('nodelim'), /Invalid Date String/)
})
