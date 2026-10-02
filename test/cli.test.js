import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = promisify(execFile)

// A small eBird export, made up here rather than kept as a fixture: two
// complete checklists in Burlington and one in Montpelier, in 2025
const HEADER = 'Submission ID,Common Name,Scientific Name,Count,State/Province,County,Location ID,Location,Latitude,Longitude,Date,Time,Protocol,Duration (Min),All Obs Reported,Breeding Code'
const ROWS = [
  'S1,Snow Bunting,Plectrophenax nivalis,40,US-VT,Chittenden,L1,Burlington Waterfront,44.4759,-73.2121,2025-01-15,09:00 AM,eBird - Traveling Count,30,1,',
  'S1,King Eider,Somateria spectabilis,1,US-VT,Chittenden,L1,Burlington Waterfront,44.4759,-73.2121,2025-01-15,09:00 AM,eBird - Traveling Count,30,1,',
  'S2,Blue Jay,Cyanocitta cristata,2,US-VT,Chittenden,L1,Burlington Waterfront,44.4759,-73.2121,2025-03-01,10:00 AM,eBird - Stationary Count,15,1,',
  'S3,Blue Jay,Cyanocitta cristata,1,US-VT,Washington,L2,Hubbard Park,44.2650,-72.5730,2025-03-02,08:00 AM,eBird - Traveling Count,45,1,',
  'S3,Barred Owl,Strix varia,1,US-VT,Washington,L2,Hubbard Park,44.2650,-72.5730,2025-03-02,08:00 AM,eBird - Traveling Count,45,1,'
]

let dir, input

before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebird-ext-cli-'))
  input = path.join(dir, 'export.csv')
  await fs.writeFile(input, [HEADER, ...ROWS].join('\n') + '\n', 'utf8')
})

after(() => fs.rm(dir, { recursive: true, force: true }))

async function cli (...args) {
  const { stdout } = await run(process.execPath, ['cli.js', ...args], { cwd: root })
  return stdout
}

test('every command the CLI handles is in its --help', async () => {
  const source = await fs.readFile(path.join(root, 'cli.js'), 'utf8')
  const commands = [...source.matchAll(/cli\.input\[0\] === '([^']+)'/g)].map(m => m[1])
  const help = await cli('--help')
  for (const command of commands) {
    assert.match(help, new RegExp(`\\n\\s+${command}\\s`), `${command} is missing from --help`)
  }
})

test('towns prints each town with species, most first', async () => {
  assert.equal(await cli('towns', `--input=${input}`), 'BURLINGTON: 3\nMONTPELIER: 2\n')
})

test('regions prints each region with species', async () => {
  assert.equal(await cli('regions', `--input=${input}`), 'Champlain Valley: 3\nNorthern Vermont Piedmont: 2\n')
})

test('counties prints each county with species', async () => {
  assert.equal(await cli('counties', `--input=${input}`), 'Chittenden: 3\nWashington: 2\n')
})

test('withinDistance defaults to 10 miles from Montpelier', async () => {
  const out = await cli('withinDistance', `--input=${input}`)
  assert.match(out, /^2 species within 10 miles of 44\.2581012, -72\.5766799: /)
  assert.match(out, /Barred Owl/)
})

test('withinDistance takes --coordinates and --distance', async () => {
  const out = await cli('withinDistance', `--input=${input}`, '--coordinates=44.4759,-73.2121', '--distance=1')
  assert.match(out, /^3 species within 1 miles of 44\.4759, -73\.2121: /)
  assert.doesNotMatch(out, /Barred Owl/)
})

test('checklists prints one line per checklist, with its link', async () => {
  const out = await cli('checklists', `--input=${input}`)
  assert.match(out, /2025-01-15 09:00 AM \| Burlington Waterfront \| https:\/\/ebird\.org\/checklist\/S1\n/)
  assert.match(out, /3 checklists\.\n$/)
})

test('issr prints the report for a reportable sighting', async () => {
  const out = await cli('issr', '--species=King Eider', '--town=Burlington', '--date=2025-01-15')
  assert.match(out, /Vermont Records/)
  assert.match(out, /King Eider/)
})

test('issr says so when a sighting is not reportable', async () => {
  const out = await cli('issr', '--species=Blue Jay', '--town=Burlington', '--date=2025-01-15')
  assert.match(out, /No records to report to the VBRC\.\n$/)
})

test('daylistTargets runs without --today', async () => {
  // Which species print depends on today's date; it just has to run
  await cli('daylistTargets', `--input=${input}`)
})
