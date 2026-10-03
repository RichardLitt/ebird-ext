#!/usr/bin/env node
// Rebuild geojson/vt_towns.json from the Vermont Center for Geographic
// Information's town boundaries (VT Data - Town Boundaries, the BNDHASH
// dataset): https://geodata.vermont.gov/datasets/VCGI::vt-data-town-boundaries
//
// Usage: node scripts/updateTownBoundaries.js [--dry-run]
//
// Each feature gets the properties the rest of the code uses: { town, county },
// with town upper case and county eBird's county number (US-VT-007 is 7).
// Names keep this repo's style where VCGI's differs (ST. ALBANS, not SAINT
// ALBANS), so towns don't change name between updates. Coordinates are rounded
// to 6 decimal places, as scripts/roundGeojson.js does.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../geojson/vt_towns.json')
const SOURCE = 'https://services1.arcgis.com/BkFxaEFNwHqX3tAw/arcgis/rest/services/FS_VCGI_OPENDATA_Boundary_BNDHASH_poly_towns_SP_v1/FeatureServer/0/query?where=1%3D1&outFields=TOWNNAME,CNTY&outSR=4326&f=geojson'
const PLACES = 6

// VCGI's name -> this repo's
const NAMES = {
  "AVERY'S GORE": 'AVERYS GORE',
  'RUTLAND TOWN': 'RUTLAND'
}
const townName = name => NAMES[name] || name.replace(/^SAINT /, 'ST. ')

const round = (key, value) => (typeof value === 'number' && !Number.isInteger(value))
  ? Math.round(value * 10 ** PLACES) / 10 ** PLACES
  : value

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`VCGI returned ${response.status}`)
const source = await response.json()
if (source.exceededTransferLimit) throw new Error('VCGI returned only part of the layer')

const towns = {
  type: 'FeatureCollection',
  features: source.features
    .map(f => ({ type: 'Feature', properties: { town: townName(f.properties.TOWNNAME), county: f.properties.CNTY }, geometry: f.geometry }))
    .sort((a, b) => a.properties.town.localeCompare(b.properties.town))
}

let old = { features: [] }
try {
  old = JSON.parse(await fs.readFile(OUTPUT, 'utf8'))
} catch {}
const before = new Set(old.features.map(f => f.properties.town))
const after = new Set(towns.features.map(f => f.properties.town))
console.log(`${after.size} towns (was ${before.size})`)
console.log('Added:', [...after].filter(t => !before.has(t)).join(', ') || 'none')
console.log('Removed:', [...before].filter(t => !after.has(t)).join(', ') || 'none')

if (!process.argv.includes('--dry-run')) {
  await fs.writeFile(OUTPUT, JSON.stringify(towns, round))
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}`)
}
