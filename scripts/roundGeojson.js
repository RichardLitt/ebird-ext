#!/usr/bin/env node
// Round every decimal in the geojson/ boundary files to 6 places (about 11 cm).
// The sources carried 13-15 places, which more than doubled the files' size in
// the site's bundle without changing a single town or region a checklist falls
// in (checked against every Vermont locality in the Aug 2026 EBD).
//
// Usage: node scripts/roundGeojson.js [file ...]   (default: every geojson/*.json)

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../geojson')
const PLACES = 6

const round = (key, value) => (typeof value === 'number' && !Number.isInteger(value))
  ? Math.round(value * 10 ** PLACES) / 10 ** PLACES
  : value

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (await fs.readdir(dir)).filter(f => f.endsWith('.json')).map(f => path.join(dir, f))

for (const file of files) {
  const before = await fs.readFile(file, 'utf8')
  const after = JSON.stringify(JSON.parse(before), round)
  await fs.writeFile(file, after)
  console.log(`${path.basename(file)}: ${before.length} -> ${after.length} bytes`)
}
