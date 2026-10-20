#!/usr/bin/env node
// Write data/siteBandingCodes.json: the entries of data/ibpAlphaCodes2021.json
// the website needs, with only the fields bandingCodes.js reads. The full
// list, every North American bird, is 330 kB; the site only shows Vermont's.
// The site's build swaps this file in for the full one (craco.config.js
// there); everything here, and the site's tests, keep the full list.
//
// Usage:
//   node scripts/updateSiteCodes.js
//
// It keeps every code in the town, region, county, Project 251 and grid
// lists, and every Vermont species in taxonomies/eBird_Taxonomy_VT.json, which
// is also what an uploaded MyEBirdData.csv can hold. A name with no entry
// still works on the site: commonNameToCode and codeToCommonName return it
// unchanged. updateAreaSightings.js runs this itself; run it after the other
// data updates (Project 251, updateTaxonomy.js). test/siteBandingCodes.test.js
// fails when it is out of date.

import { promises as fs, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as banding from '../bandingCodes.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = path.join(root, 'data/siteBandingCodes.json')
const LISTS = ['townsightings.json', 'regionssightings.json', 'countysightings.json', 'vt_town_counts.json']

async function readJSON (file) {
  return JSON.parse(await fs.readFile(path.join(root, file), 'utf8'))
}

// The table entries for the codes in lists (area -> codes), grid species and
// the Vermont taxonomy, in the full table's order
function siteCodes ({ lists, grid, taxonomy, table }) {
  const codes = new Set([...lists.flatMap(list => Object.values(list).flat()), ...grid.species])
  for (const taxon of taxonomy) codes.add(banding.commonNameToCode(taxon.PRIMARY_COM_NAME))
  return table
    .filter(x => codes.has(x.alpha))
    .map(({ alpha, common_name: commonName, scientific_name: scientificName }) => ({ alpha, common_name: commonName, scientific_name: scientificName }))
}

// One entry per line, so an update diffs one line per code
function format (entries) {
  return `[\n${entries.map(x => JSON.stringify(x)).join(',\n')}\n]\n`
}

async function currentData () {
  return {
    lists: await Promise.all(LISTS.map(file => readJSON(`data/${file}`))),
    grid: await readJSON('data/grid_sightings.json'),
    taxonomy: await readJSON('taxonomies/eBird_Taxonomy_VT.json'),
    table: await readJSON('data/ibpAlphaCodes2021.json')
  }
}

async function updateSiteCodes () {
  const entries = siteCodes(await currentData())
  await fs.writeFile(OUTPUT, format(entries), 'utf8')
  return entries.length
}

export { siteCodes, format, currentData, updateSiteCodes }

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  updateSiteCodes().then(count => {
    console.error(`Wrote ${path.relative(root, OUTPUT)}: ${count} codes`)
  }).catch(error => {
    console.error(error)
    process.exit(1)
  })
}
