import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readHistogram, { washingtonCounty2020 } from '../readHistogram.js'

// readHistogram.js parses eBird "bar chart" (histogram) .txt exports. The
// format, after blank and whitespace-only lines are stripped, is:
//
//   Frequency of observations in the selected location(s).:
//   Number of taxa: \t167
//   \tJan\t\t\t\tFeb\t\t\t\t...            (month header, 4 weeks per month)
//   Sample Size:\t49.0\t42.0\t...\t         (one checklist count per week)
//   Snow Goose (<em class="sci">Anser caerulescens</em>)\t0.0\t...\t
//   ...
//
// CRLF line endings are normalised to LF first. Species rows are every
// non-blank line after the "Sample Size" line, so the number of header lines
// and the presence of a trailing newline do not matter.
//
// Only washingtonCounty2020 is exported. getData is module-private, so it is
// exercised through washingtonCounty2020, which reads
// data/ebird_US-VT-023__2020_2020_1_12_barchart.txt relative to the module.
// For fixture tests we mock fs.promises.readFile (the same object the module
// imports as `promises`) to return the fixture content.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const fixtureDir = path.join(here, 'fixtures', 'readHistogram')
const BUNDLED = 'ebird_US-VT-023__2020_2020_1_12_barchart.txt'

const fixture = (name) => fs.readFileSync(path.join(fixtureDir, name), 'utf8')

// Run washingtonCounty2020 against `content`, with console.log silenced.
// Returns { result, logs } where logs is the list of first arguments passed
// to console.log.
async function parse (t, content) {
  const logMock = t.mock.method(console, 'log', () => {})
  const readMock = t.mock.method(fs.promises, 'readFile', async () => content)
  try {
    const result = await washingtonCounty2020()
    return { result, logs: logMock.mock.calls.map(c => c.arguments[0]) }
  } finally {
    readMock.mock.restore()
    logMock.mock.restore()
  }
}

const names = (result) => result.species.map(s => Object.keys(s)[0])
const entry = (result, name) => {
  const found = result.species.find(s => Object.keys(s)[0] === name)
  return found && found[name]
}

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

test('named export washingtonCounty2020 is an async function', () => {
  assert.equal(typeof washingtonCounty2020, 'function')
  assert.equal(washingtonCounty2020.constructor.name, 'AsyncFunction')
})

test('default export exposes the same washingtonCounty2020', () => {
  assert.equal(readHistogram.washingtonCounty2020, washingtonCounty2020)
})

test('getData is not exported (only reachable through washingtonCounty2020)', async () => {
  const mod = await import('../readHistogram.js')
  assert.equal(mod.getData, undefined)
  assert.equal(readHistogram.getData, undefined)
})

// ---------------------------------------------------------------------------
// Bundled Washington County 2020 file (data/ is committed)
// ---------------------------------------------------------------------------

async function parseBundled (t) {
  const logMock = t.mock.method(console, 'log', () => {})
  try {
    const result = await washingtonCounty2020()
    return { result, logs: logMock.mock.calls.map(c => c.arguments[0]) }
  } finally {
    logMock.mock.restore()
  }
}

test('bundled file: resolved relative to the module, not the working directory', async (t) => {
  t.mock.method(console, 'log', () => {})
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readHistogram-'))
  const cwd = process.cwd()
  try {
    process.chdir(dir)
    const result = await washingtonCounty2020()
    assert.equal(result.taxa, '167')
  } finally {
    process.chdir(cwd)
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('bundled file: reads the absolute path of data/ next to the module', async (t) => {
  t.mock.method(console, 'log', () => {})
  const spy = t.mock.method(fs.promises, 'readFile')
  await washingtonCounty2020()
  assert.equal(spy.mock.calls[0].arguments[0], path.join(repoRoot, 'data', BUNDLED))
})

test('bundled file: reports 167 taxa as a string', async (t) => {
  const { result } = await parseBundled(t)
  assert.equal(result.taxa, '167')
})

test('bundled file: sample size has 48 weekly entries', async (t) => {
  const { result } = await parseBundled(t)
  assert.equal(result.sampleSize.length, 48)
  assert.deepEqual(result.sampleSize.slice(0, 3), ['49.0', '42.0', '71.0'])
})

test('bundled file: 148 species once 19 spuh/slash taxa are removed', async (t) => {
  const { result } = await parseBundled(t)
  assert.equal(result.species.length, 148)
})

test('bundled file: first species is Snow Goose with its scientific name', async (t) => {
  const { result } = await parseBundled(t)
  assert.deepEqual(Object.keys(result.species[0]), ['Snow Goose'])
  assert.equal(result.species[0]['Snow Goose']['Scientific Name'], 'Anser caerulescens')
})

test('bundled file: last kept species is Rose-breasted Grosbeak (trailing spuhs dropped)', async (t) => {
  const { result } = await parseBundled(t)
  assert.deepEqual(names(result).at(-1), 'Rose-breasted Grosbeak')
})

test('bundled file: no kept species name contains "sp." or "/"', async (t) => {
  const { result } = await parseBundled(t)
  for (const n of names(result)) {
    assert.ok(!n.includes('sp.') && !n.includes('/'), n)
  }
})

test('bundled file: logs nothing', async (t) => {
  const { logs } = await parseBundled(t)
  assert.deepEqual(logs, [])
})

// ---------------------------------------------------------------------------
// Header parsing (hand-made fixtures)
// ---------------------------------------------------------------------------

test('taxa is read from the "Number of taxa" line as a string', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.equal(result.taxa, '10')
})

test('sampleSize drops the empty cell left by the trailing tab', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(result.sampleSize, ['49.0', '42.0', '71.0', '105.0', '81.0', '86.0', '0.0', '0.0'])
})

test('sampleSize keeps "0.0" weeks (only empty strings are removed)', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(result.sampleSize.slice(-2), ['0.0', '0.0'])
})

test('sampleSize entries stay strings, not numbers', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.ok(result.sampleSize.every(x => typeof x === 'string'))
})

test('sampleSize without a trailing tab is parsed the same way', async (t) => {
  const { result } = await parse(t, fixture('no-trailing-tabs.txt'))
  assert.equal(result.sampleSize.length, 8)
  assert.equal(result.sampleSize.at(-1), '0.0')
})

test('leading blank lines before the header are ignored', async (t) => {
  // basic.txt starts with ten empty lines, like real exports.
  const { result } = await parse(t, fixture('basic.txt'))
  assert.equal(names(result)[0], 'Snow Goose')
})

test('whitespace-only lines (spaces and tabs) are stripped like empty ones', async (t) => {
  const content = fixture('basic.txt').replace('\n\n\tJan', '\n \t \t\n\tJan')
  const { result } = await parse(t, content)
  assert.equal(result.taxa, '10')
  assert.equal(names(result)[0], 'Snow Goose')
})

// ---------------------------------------------------------------------------
// Species rows
// ---------------------------------------------------------------------------

test('result.species is an array of single-key objects keyed by common name', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.ok(Array.isArray(result.species))
  for (const s of result.species) {
    const keys = Object.keys(s)
    assert.equal(keys.length, 1)
    assert.equal(s[keys[0]].species, keys[0])
  }
})

test('keeps real species in file order and drops spuh and slash taxa', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(names(result), [
    'Snow Goose',
    'Canada Goose',
    'Mallard (Domestic type)',
    'Mallard x American Black Duck (hybrid)',
    'Black-capped Chickadee',
    'American Robin'
  ])
})

test('slash taxa (Cackling/Canada Goose, Downy/Hairy Woodpecker) are removed', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.equal(entry(result, 'Cackling/Canada Goose'), undefined)
  assert.equal(entry(result, 'Downy/Hairy Woodpecker'), undefined)
})

test('spuh taxa (duck sp., bird sp.) are removed', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.equal(entry(result, 'duck sp.'), undefined)
  assert.equal(entry(result, 'bird sp.'), undefined)
})

test('hybrids are kept (only "sp." and "/" are filtered)', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(entry(result, 'Mallard x American Black Duck (hybrid)'), {
    species: 'Mallard x American Black Duck (hybrid)',
    'Scientific Name': 'Anas platyrhynchos x rubripes',
    frequency: ['0.0204082', '0.0', '0.0', '0.0', '0.0', '0.0', '0.0', '0.0']
  })
})

test('extracts the scientific name from the <em class="sci"> markup', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.equal(entry(result, 'Black-capped Chickadee')['Scientific Name'], 'Poecile atricapillus')
})

test('parenthesised common and scientific names survive intact', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  const mallard = entry(result, 'Mallard (Domestic type)')
  assert.equal(mallard.species, 'Mallard (Domestic type)')
  assert.equal(mallard['Scientific Name'], 'Anas platyrhynchos (Domestic type)')
})

test('frequency values are the raw weekly strings in column order', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(entry(result, 'American Robin').frequency.slice(0, 8),
    ['0.0', '0.0', '0.1126761', '0.4380952', '0.5061728', '0.5465116', '0.0', '0.0'])
})

test('a species seen in zero weeks is still kept with all-zero frequencies', async (t) => {
  const { result } = await parse(t, fixture('basic.txt'))
  const goose = entry(result, 'Snow Goose')
  assert.ok(goose)
  assert.ok(goose.frequency.slice(0, 8).every(f => f === '0.0'))
})

test('frequency drops the empty trailing-tab cell, matching sampleSize', async (t) => {
  // Rows end in a tab, so split('\t') leaves a final '' that is filtered out.
  const { result } = await parse(t, fixture('basic.txt'))
  for (const s of result.species) {
    const f = Object.values(s)[0].frequency
    assert.equal(f.length, result.sampleSize.length)
    assert.ok(!f.includes(''))
  }
  assert.equal(entry(result, 'Canada Goose').frequency.at(-1), '0.0')
})

test('bundled file: every frequency array has one entry per sampled week', async (t) => {
  const { result } = await parseBundled(t)
  for (const s of result.species) {
    assert.equal(Object.values(s)[0].frequency.length, 48)
  }
})

test('rows without a trailing tab have exactly one frequency per week', async (t) => {
  const { result } = await parse(t, fixture('no-trailing-tabs.txt'))
  const f = entry(result, 'Black-capped Chickadee').frequency
  assert.equal(f.length, result.sampleSize.length)
  assert.equal(f.at(-1), '0.0')
})

test('a file whose rows are all spuh/slash taxa yields an empty species list', async (t) => {
  const { result } = await parse(t, fixture('all-spuh.txt'))
  assert.deepEqual(result.species, [])
  assert.equal(result.taxa, '3')
})

test('a header-only file yields an empty species list', async (t) => {
  const { result } = await parse(t, fixture('header-only.txt'))
  assert.deepEqual(result.species, [])
  assert.equal(result.taxa, '0')
  assert.equal(result.sampleSize.length, 8)
})

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

test('keeps each species once, in order, and logs nothing', async (t) => {
  const { result, logs } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(logs, [])
  assert.deepEqual(names(result), [
    'Snow Goose',
    'Canada Goose',
    'Mallard (Domestic type)',
    'Mallard x American Black Duck (hybrid)',
    'Black-capped Chickadee',
    'American Robin'
  ])
})

test('logs nothing for a file of only spuh and slash taxa', async (t) => {
  const { logs } = await parse(t, fixture('all-spuh.txt'))
  assert.deepEqual(logs, [])
})

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

test('rejects with ENOENT when the data file is missing', async (t) => {
  t.mock.method(console, 'log', () => {})
  t.mock.method(fs.promises, 'readFile', async (p) => {
    throw Object.assign(new Error(`ENOENT: no such file or directory, open '${p}'`), { code: 'ENOENT' })
  })
  await assert.rejects(washingtonCounty2020(), { code: 'ENOENT' })
})

test('rejects with a TypeError on an empty file', async (t) => {
  await assert.rejects(parse(t, ''), TypeError)
})

test('rejects with a TypeError when the "Number of taxa" line is missing', async (t) => {
  await assert.rejects(parse(t, fixture('missing-taxa.txt')), TypeError)
})

test('rejects with a TypeError when the "Sample Size" line is missing', async (t) => {
  await assert.rejects(parse(t, fixture('missing-sample-size.txt')), TypeError)
})

test('rejects with a TypeError on a species row without <em> markup', async (t) => {
  await assert.rejects(parse(t, fixture('malformed-species.txt')), TypeError)
})

// ---------------------------------------------------------------------------
// Header layout, line endings and trailing newline
// ---------------------------------------------------------------------------

const BASIC_NAMES = [
  'Snow Goose',
  'Canada Goose',
  'Mallard (Domestic type)',
  'Mallard x American Black Duck (hybrid)',
  'Black-capped Chickadee',
  'American Robin'
]

test('an extra header line before "Sample Size" does not shift the species rows', async (t) => {
  const content = fixture('basic.txt').replace('Sample Size:', 'Extra line\nSample Size:')
  const { result } = await parse(t, content)
  assert.deepEqual(names(result), BASIC_NAMES)
})

test('a missing "Frequency of observations" line keeps the first species', async (t) => {
  const content = fixture('basic.txt').replace(/^Frequency of observations.*\n/m, '')
  const { result } = await parse(t, content)
  assert.deepEqual(names(result), BASIC_NAMES)
})

test('a missing month header line keeps the first species', async (t) => {
  const content = fixture('basic.txt').replace(/^\tJan.*\n/m, '')
  const { result } = await parse(t, content)
  assert.deepEqual(names(result), BASIC_NAMES)
})

test('keeps the last species row when the file has no trailing newline', async (t) => {
  const { result } = await parse(t, fixture('no-trailing-newline.txt'))
  assert.deepEqual(names(result), ['Snow Goose', 'Black-capped Chickadee'])
  assert.equal(entry(result, 'Black-capped Chickadee').frequency.length, 8)
})

test('a trailing whitespace-only line without a newline is ignored', async (t) => {
  const { result } = await parse(t, fixture('basic.txt') + ' \t ')
  assert.deepEqual(names(result), BASIC_NAMES)
})

test('parses files with CRLF line endings the same as LF', async (t) => {
  const lf = await parse(t, fixture('basic.txt'))
  const crlf = await parse(t, fixture('basic.txt').replace(/\n/g, '\r\n'))
  assert.equal(crlf.result.taxa, '10')
  assert.deepEqual(crlf.result, lf.result)
})
