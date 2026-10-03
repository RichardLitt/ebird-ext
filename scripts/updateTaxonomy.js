#!/usr/bin/env node
// Rebuild taxonomies/eBird_Taxonomy_VT.json: every species and hybrid eBird
// lists as reported in Vermont, in eBird's taxonomic order, with the names of
// the current eBird taxonomy. The website's maps use it for each area's "not
// seen" list, and taxonomicSort.js for ordering.
//
// Usage: EBIRD_API_TOKEN=... node scripts/updateTaxonomy.js [--dry-run]
//
// eBird updates its taxonomy each autumn. After an update, run this, then
// check the species it reports without a banding code: add renamed or split
// birds to EBIRD_NAME_TO_CODE in bandingCodes.js, so the area lists (stored as
// codes) and this list use the same names.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as banding from '../bandingCodes.js'

const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../taxonomies/eBird_Taxonomy_VT.json')

async function api (url) {
  const token = process.env.EBIRD_API_TOKEN
  if (!token) throw new Error('Set EBIRD_API_TOKEN to your eBird API key (https://ebird.org/api/keygen).')
  const response = await fetch(`https://api.ebird.org/v2/${url}`, { headers: { 'X-eBirdApiToken': token } })
  if (!response.ok) throw new Error(`eBird API ${response.status} for ${url}`)
  return response.json()
}

const version = (await api('ref/taxonomy/versions')).find(v => v.latest).authorityVer
const taxonomy = new Map((await api('ref/taxonomy/ebird?fmt=json')).map(t => [t.speciesCode, t]))
const reported = await api('product/spplist/US-VT')

const vermont = reported.map(code => taxonomy.get(code)).filter(Boolean).sort((a, b) => a.taxonOrder - b.taxonOrder)
const list = vermont.map(t => ({ PRIMARY_COM_NAME: t.comName, SCI_NAME: t.sciName }))

let old = []
try {
  old = JSON.parse(await fs.readFile(OUTPUT, 'utf8'))
} catch {}
const before = new Set(old.map(t => t.PRIMARY_COM_NAME))
const after = new Set(list.map(t => t.PRIMARY_COM_NAME))
console.log(`eBird taxonomy ${version}: ${list.length} taxa reported in Vermont (was ${old.length})`)
console.log('Added:', [...after].filter(n => !before.has(n)).join(', ') || 'none')
console.log('Removed:', [...before].filter(n => !after.has(n)).join(', ') || 'none')

const uncoded = vermont.filter(t => t.category === 'species')
  .filter(t => banding.codeToCommonName(banding.commonNameToCode(t.comName)) !== t.comName)
if (uncoded.length) {
  console.log(`\n${uncoded.length} Vermont species without a banding code that gives back their name:`)
  for (const t of uncoded) console.log(`  ${t.comName} (${t.sciName}) -> ${banding.commonNameToCode(t.comName)}`)
}

if (!process.argv.includes('--dry-run')) {
  // One taxon per line, so a taxonomy update diffs one line per change
  await fs.writeFile(OUTPUT, `[\n${list.map(t => JSON.stringify(t)).join(',\n')}\n]\n`)
  console.log(`\nWrote ${path.relative(process.cwd(), OUTPUT)}`)
}
