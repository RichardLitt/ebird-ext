#!/usr/bin/env node
// Write data/vt_town_info.json: each town's county and biophysical region,
// for checking a single sighting (isSpeciesSightingRare in rarity.js) without
// loading the town and region boundaries. The region is the one holding the
// town's interior point (getTownCentroids in filters.js), as the check always
// used.
//
// Usage:
//   node scripts/updateTownInfo.js
//
// Run it after any change to geojson/vt_towns.json or the region boundaries.
// test/townInfo.test.js fails when it is out of date.

import { promises as fs, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import GeoJsonGeometriesLookup from 'geojson-geometries-lookup'
import regionBoundaries from '../geojson/Polygon_VT_Biophysical_Regions.json' with { type: 'json' }
import { getTownCentroids, pointLookup } from '../filters.js'
import { eBirdCountyIds } from '../helpers.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(root, 'data/vt_town_info.json')

// { TOWN: { county, region } }, by town name
function townInfo () {
  const regions = new GeoJsonGeometriesLookup(regionBoundaries)
  const info = {}
  for (const centroid of getTownCentroids()) {
    const { town, county } = centroid.properties
    info[town] = { county: eBirdCountyIds[county], region: pointLookup(regions, regions, centroid.geometry) }
  }
  return Object.fromEntries(Object.entries(info).sort(([a], [b]) => a.localeCompare(b)))
}

// One town per line, so an update diffs one line per town
function format (info) {
  return `{\n${Object.entries(info).map(([town, x]) => `${JSON.stringify(town)}: ${JSON.stringify(x)}`).join(',\n')}\n}\n`
}

async function updateTownInfo () {
  const info = townInfo()
  await fs.writeFile(OUTPUT, format(info), 'utf8')
  return Object.keys(info).length
}

export { townInfo, format, updateTownInfo }

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateTownInfo().then(count => {
    console.error(`Wrote ${path.relative(root, OUTPUT)}: ${count} towns`)
  }).catch(error => {
    console.error(error)
    process.exit(1)
  })
}
