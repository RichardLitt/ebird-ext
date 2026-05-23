import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isBandingCode,
  codeToCommonName,
  codeToScientificName,
  commonNameToCode,
  speciesNameToCode
} from '../bandingCodes.js'

test('isBandingCode matches a real 4-letter alpha code', () => {
  assert.ok(isBandingCode('BCCH'))
})

test('isBandingCode returns falsy for an unknown code', () => {
  assert.ok(!isBandingCode('ZZZZ'))
})

test('codeToCommonName resolves BCCH to Black-capped Chickadee', () => {
  assert.equal(codeToCommonName('BCCH'), 'Black-capped Chickadee')
})

test('codeToCommonName falls back to the input code when unknown', () => {
  assert.equal(codeToCommonName('ZZZZ'), 'ZZZZ')
})

test('codeToScientificName resolves BCCH to the Poecile genus', () => {
  assert.match(codeToScientificName('BCCH'), /Poecile/)
})

test("commonNameToCode normalizes apostrophes (Bell's Vireo -> BEVI)", () => {
  assert.equal(commonNameToCode("Bell's Vireo"), 'BEVI')
})

test('speciesNameToCode resolves Bucephala clangula to COGO', () => {
  assert.equal(speciesNameToCode('Bucephala clangula'), 'COGO')
})

test('module-level push additions are discoverable (Mandarin Duck)', () => {
  assert.ok(isBandingCode('Mandarin Duck'))
})
