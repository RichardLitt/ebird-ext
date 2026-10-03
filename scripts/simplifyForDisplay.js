#!/usr/bin/env node
// Write simplified copies of the boundary files to geojson/display/, for the
// website to draw. The files in geojson/ stay precise: getPoint uses them to
// work out which town and region a checklist is in, where a simplified border
// could put a checklist in the wrong town.
//
// Usage: node scripts/simplifyForDisplay.js
//
// Uses mapshaper (run with npx, so it isn't a dependency), which simplifies
// each shared border once, so neighbouring towns still meet. 10% of the
// vertices look the same as the originals at the site's map size; output is
// GeoJSON 2008 winding (clockwise outer rings), which d3 needs.

import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../geojson')
const FILES = ['vt_towns.json', 'VT_Data_-_County_Boundaries.json', 'Polygon_VT_Biophysical_Regions.json', 'lake.json']
const KEEP = '10%'

await fs.mkdir(path.join(dir, 'display'), { recursive: true })
for (const file of FILES) {
  const input = path.join(dir, file)
  const output = path.join(dir, 'display', file)
  execFileSync('npx', ['-y', 'mapshaper@0.6', input, '-simplify', KEEP, 'keep-shapes', '-o', 'precision=0.00001', 'format=geojson', 'gj2008', output], { stdio: 'ignore' })
  const gz = async f => zlib.gzipSync(await fs.readFile(f)).length
  console.log(`${file}: ${Math.round(await gz(input) / 1000)} kB -> ${Math.round(await gz(output) / 1000)} kB gzipped`)
}
