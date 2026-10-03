import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isBandingCode,
  codeToCommonName,
  codeToScientificName,
  commonNameToCode,
  speciesNameToCode,
  unfurlObjToSpecies
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

test('codeToCommonName gives the current eBird name for birds renamed since 2021', () => {
  assert.equal(codeToCommonName('YEWA'), 'Northern Yellow Warbler')
  assert.equal(codeToCommonName('BCNH'), 'Black-crowned Night Heron')
  assert.equal(codeToCommonName('CORE'), 'Redpoll')
})

test('commonNameToCode and codeToCommonName round-trip current eBird names', () => {
  for (const name of ['Northern Yellow Warbler', 'American Herring Gull', 'Redpoll', 'Black-capped Chickadee']) {
    assert.equal(codeToCommonName(commonNameToCode(name)), name)
  }
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

test('isBandingCode is case-sensitive (lowercase bcch does not match)', () => {
  assert.ok(!isBandingCode('bcch'))
})

test('isBandingCode returns falsy for the empty string', () => {
  assert.ok(!isBandingCode(''))
})

test('codeToScientificName resolves BCCH to Poecile atricapillus exactly', () => {
  assert.equal(codeToScientificName('BCCH'), 'Poecile atricapillus')
})

test('codeToScientificName falls back to the input code when unknown', () => {
  assert.equal(codeToScientificName('ZZZZ'), 'ZZZZ')
})

test('commonNameToCode maps names eBird changed in 2025 to the 2021 code', () => {
  assert.equal(commonNameToCode('Northern Yellow Warbler'), 'YEWA')
  assert.equal(commonNameToCode('American Herring Gull'), 'HERG')
  assert.equal(commonNameToCode('Redpoll'), 'CORE')
  // and still knows the old names
  assert.equal(commonNameToCode('Yellow Warbler'), 'YEWA')
})

test('commonNameToCode falls back to the input when unknown', () => {
  assert.equal(commonNameToCode('Imaginary Bird'), 'Imaginary Bird')
})

test('speciesNameToCode falls back to the input when unknown', () => {
  assert.equal(speciesNameToCode('Imaginarius birdus'), 'Imaginarius birdus')
})

// The module-level push entries (Mandarin Duck, Budgerigar, Emu, etc.) use
// the full common name as their "alpha" field, making lookup idempotent.
test('commonNameToCode round-trips Mandarin Duck (alpha === common_name)', () => {
  assert.equal(commonNameToCode('Mandarin Duck'), 'Mandarin Duck')
})

test('speciesNameToCode resolves Aix galericulata to Mandarin Duck', () => {
  assert.equal(speciesNameToCode('Aix galericulata'), 'Mandarin Duck')
})

test('unfurlObjToSpecies maps codes to common names per region', () => {
  const result = unfurlObjToSpecies({
    vermont: ['BCCH', 'AMRO'],
    maine: ['AMRO']
  })
  assert.deepEqual(result, {
    vermont: ['Black-capped Chickadee', 'American Robin'],
    maine: ['American Robin']
  })
})

test('unfurlObjToSpecies preserves unknown codes as-is', () => {
  const result = unfurlObjToSpecies({ vermont: ['BCCH', 'ZZZZ'] })
  assert.deepEqual(result, {
    vermont: ['Black-capped Chickadee', 'ZZZZ']
  })
})

test('unfurlObjToSpecies handles an empty object', () => {
  assert.deepEqual(unfurlObjToSpecies({}), {})
})

test('unfurlObjToSpecies handles empty arrays', () => {
  assert.deepEqual(unfurlObjToSpecies({ vermont: [] }), { vermont: [] })
})
