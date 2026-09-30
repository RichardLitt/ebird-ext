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
// The parser is positional: it skips exactly four header lines and drops the
// final line (the empty string left after the file's trailing newline).
//
// Only washingtonCounty2020 is exported. getData is module-private, so it is
// exercised through washingtonCounty2020, which reads the path
// 'data/ebird_US-VT-023__2020_2020_1_12_barchart.txt' relative to the current
// working directory. For fixture tests we chdir into a temp directory holding
// a data/ file with that exact name, then restore the cwd and clean up.

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readHistogram-'))
  const cwd = process.cwd()
  try {
    fs.mkdirSync(path.join(dir, 'data'))
    fs.writeFileSync(path.join(dir, 'data', BUNDLED), content)
    process.chdir(dir)
    const result = await washingtonCounty2020()
    return { result, logs: logMock.mock.calls.map(c => c.arguments[0]) }
  } finally {
    process.chdir(cwd)
    fs.rmSync(dir, { recursive: true, force: true })
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
  const cwd = process.cwd()
  try {
    process.chdir(repoRoot)
    const result = await washingtonCounty2020()
    return { result, logs: logMock.mock.calls.map(c => c.arguments[0]) }
  } finally {
    process.chdir(cwd)
    logMock.mock.restore()
  }
}

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

test('bundled file: logs every kept species name, then the count', async (t) => {
  const { result, logs } = await parseBundled(t)
  assert.equal(logs.length, 149)
  assert.deepEqual(logs.slice(0, -1), names(result))
  assert.equal(logs.at(-1), 148)
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
    frequency: ['0.0204082', '0.0', '0.0', '0.0', '0.0', '0.0', '0.0', '0.0', '']
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

test('frequency keeps the empty trailing-tab cell (unlike sampleSize)', async (t) => {
  // Current behaviour: rows end in a tab, so split('\t') leaves a final ''.
  // sampleSize filters it out, frequency does not. See the todo below.
  const { result } = await parse(t, fixture('basic.txt'))
  const f = entry(result, 'Canada Goose').frequency
  assert.equal(f.length, 9)
  assert.equal(f.at(-1), '')
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

test('logs each kept species name once, in order, then the species count', async (t) => {
  const { logs } = await parse(t, fixture('basic.txt'))
  assert.deepEqual(logs, [
    'Snow Goose',
    'Canada Goose',
    'Mallard (Domestic type)',
    'Mallard x American Black Duck (hybrid)',
    'Black-capped Chickadee',
    'American Robin',
    6
  ])
})

test('does not log spuh or slash taxa', async (t) => {
  const { logs } = await parse(t, fixture('all-spuh.txt'))
  assert.deepEqual(logs, [0])
})

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

test('rejects with ENOENT when the data file is missing', async (t) => {
  t.mock.method(console, 'log', () => {})
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'readHistogram-'))
  const cwd = process.cwd()
  try {
    process.chdir(dir)
    await assert.rejects(washingtonCounty2020(), { code: 'ENOENT' })
  } finally {
    process.chdir(cwd)
    fs.rmSync(dir, { recursive: true, force: true })
  }
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

test('an extra header line shifts the positional slice and crashes on it', async (t) => {
  // Current behaviour: the parser assumes exactly four header lines. A fifth
  // non-blank line before the species is treated as a species row.
  const content = fixture('basic.txt').replace('Sample Size:', 'Extra line\nSample Size:')
  await assert.rejects(parse(t, content), TypeError)
})

test('a missing "Frequency of observations" line silently drops the first species', async (t) => {
  // Current behaviour: with only three header lines, slice(4) skips the first
  // species row. Pinned so a change to the positional logic is noticed.
  const content = fixture('basic.txt').replace(/^Frequency of observations.*\n/m, '')
  const { result } = await parse(t, content)
  assert.equal(names(result)[0], 'Canada Goose')
})

// ---------------------------------------------------------------------------
// Known bugs
// ---------------------------------------------------------------------------

test('a file without a trailing newline currently loses its last species', async (t) => {
  // Pins the bug described in the todo below: slice(4, -1) always drops the
  // last line, which is a real species row when there is no final newline.
  const { result } = await parse(t, fixture('no-trailing-newline.txt'))
  assert.deepEqual(names(result), ['Snow Goose'])
})

test('CRLF line endings currently collapse the file into one line and lose every species', async (t) => {
  // remove-blank-lines uses /^[ \t]*\n/gm. In multiline mode JS treats "\r" as
  // a line terminator, so "^" matches between the "\r" and "\n" of every CRLF
  // and every "\n" is deleted. The whole file becomes a single line.
  const content = fixture('basic.txt').replace(/\n/g, '\r\n')
  const { result } = await parse(t, content)
  assert.deepEqual(result.species, [])
  assert.equal(result.taxa, '10\r\r')
})

test.todo('keeps the last species row when the file has no trailing newline (readHistogram.js:16: slice(4, -1) unconditionally drops the final line, so a file ending in a species row instead of "\\n" silently loses that species)')

test.todo('frequency arrays drop the empty cell from the trailing tab, matching sampleSize (readHistogram.js:21: frequency is split without the filter(x => x !== "") applied to sampleSize on line 15, so every row gets an extra "" and frequency.length is sampleSize.length + 1)')

test.todo('parses files with CRLF line endings (readHistogram.js:13: remove-blank-lines matches /^[ \\t]*\\n/gm and JS multiline "^" matches after "\\r", so every "\\n" in a CRLF file is removed; the file collapses to one line, taxa becomes "10\\r\\r" and species is silently empty)')

test.todo('locates species rows by content rather than a fixed offset (readHistogram.js:16: slice(4) assumes exactly four header lines; one missing header line silently drops the first species, one extra header line throws)')

test.todo('washingtonCounty2020 finds its bundled file regardless of the working directory (readHistogram.js:44: the relative path "data/ebird_US-VT-023__2020_2020_1_12_barchart.txt" is resolved against process.cwd(), not the module, so calling it from any other directory rejects with ENOENT)')
