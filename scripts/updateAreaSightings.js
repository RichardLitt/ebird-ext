#!/usr/bin/env node
// Regenerate data/townsightings.json, data/regionssightings.json and
// data/countyBarcharts.json, the all-time species lists for every Vermont
// town, biophysical region and county that the website's /towns, /regions and
// /counties maps show, from a statewide eBird Basic Dataset (EBD) download:
// https://ebird.org/data/download
//
// Usage:
//   node scripts/updateAreaSightings.js <ebd_US-VT_*.txt> [options]
//
//   --dry-run            Read the EBD and print the change report, but don't write.
//   --include-escapees   Keep records marked as escapees (exotic code X). eBird
//                        doesn't count them, so by default neither do we.
//   --release="Aug 2026" The EBD release, if the file name doesn't say (see below).
//
// Also writes data/area_sightings_meta.json, { release, updated }, so the site
// can say which EBD release the maps come from. The release is read from the
// EBD file name (ebd_US-VT_smp_relAug-2026.txt -> 'Aug 2026').
//
// Each list holds a species if it was reported there at least once, in the
// order the species were first reported there (oldest first). Only
// countable taxa are kept: species, and subspecies or forms counted as their
// species. Spuhs, slashes, hybrids and domestic types are dropped, except Feral
// Pigeon, which counts as Rock Pigeon.
//
// Species are stored as four-letter banding codes from
// data/ibpAlphaCodes2021.json, which follows the 2021 taxonomy, while the EBD
// uses the current eBird taxonomy. EBIRD_NAME_TO_CODE in bandingCodes.js maps
// the names that have changed since then to their old code (and
// codeToCommonName back to the current name). The script lists any name it
// still can't map; add those to that map.
//
// countyBarcharts.json began as eBird's county bar charts, and keeps their
// shape, { County: { taxa, species: { 'Common Name': { 'Scientific Name' } } } },
// without the weekly frequencies, which nothing used. It holds the EBD's
// (current eBird) names, not codes.
//
// eBird leaves sensitive species out of the EBD entirely. SENSITIVE_CODES are
// kept wherever the file being replaced already had them, so an update doesn't
// erase them; new sightings of them can't be added from the EBD.
//
// The EBD is gigabytes, so it is read a line at a time. It is tab-separated
// and does not quote fields, so lines are split on tabs and nothing else.

import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import * as banding from '../bandingCodes.js'
import { releaseFromFileName } from '../ebd.js'
import * as f from '../filters.js'
import * as helpers from '../helpers.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUTS = {
  towns: path.join(root, 'data/townsightings.json'),
  regions: path.join(root, 'data/regionssightings.json'),
  counties: path.join(root, 'data/countyBarcharts.json')
}
const KINDS = Object.keys(OUTPUTS)
const META = path.join(root, 'data/area_sightings_meta.json')

const { SENSITIVE_CODES } = banding

const COUNTABLE = new Set(['species', 'issf', 'form', 'intergrade'])

function isCountable (category, commonName) {
  return COUNTABLE.has(category) || (category === 'domestic' && commonName === 'Rock Pigeon')
}

function toCode (commonName) {
  return banding.commonNameToCode(commonName)
}

// Every town, region and county, so the map finds a list for each shape even
// if empty, and the county each town is in
async function emptyAreas () {
  const read = async file => JSON.parse(await fs.readFile(path.join(root, 'geojson', file), 'utf8')).features
  const towns = await read('vt_towns.json')
  const counties = await read('VT_Data_-_County_Boundaries.json')
  const countyNames = new Map(counties.map(x => [x.properties.CNTY, helpers.capitalizeFirstLetters(x.properties.CNTYNAME)]))
  return {
    areas: {
      towns: new Map(towns.map(x => [x.properties.town, new Map()])),
      regions: new Map((await read('Polygon_VT_Biophysical_Regions.json')).map(x => [x.properties.name, new Map()])),
      counties: new Map([...countyNames.values()].map(name => [name, new Map()]))
    },
    townCounties: new Map(towns.map(x => [x.properties.town, countyNames.get(x.properties.county)]))
  }
}

async function readEBD (file, opts) {
  const { areas, townCounties } = await emptyAreas()
  // A locality has one set of coordinates, so look each one up once
  const places = new Map()
  const unplaced = new Set()
  const scientificNames = new Map()
  // The regions map has gaps (the East Bay marshes in West Haven, for one).
  // Records there go to whichever region the rest of their town is in.
  const regionVotes = new Map()
  const regionless = new Map()
  const stats = { rows: 0, kept: 0, escapees: 0 }
  let col

  const lines = readline.createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!col) {
      const header = line.replace(/^\uFEFF/, '').split('\t')
      col = Object.fromEntries(header.map((name, i) => [name.trim(), i]))
      for (const name of ['CATEGORY', 'COMMON NAME', 'SCIENTIFIC NAME', 'TAXONOMIC ORDER', 'OBSERVATION DATE', 'COUNTY', 'EXOTIC CODE', 'COUNTY CODE', 'LOCALITY ID', 'LATITUDE', 'LONGITUDE', 'APPROVED']) {
        if (!(name in col)) throw new Error(`${file} has no ${name} column; is it an EBD file?`)
      }
      continue
    }
    if (!line) continue
    stats.rows++
    if (stats.rows % 1000000 === 0) process.stderr.write(`${stats.rows / 1000000}M rows\r`)

    const row = line.split('\t')
    const commonName = row[col['COMMON NAME']]
    if (!isCountable(row[col.CATEGORY], commonName)) continue
    if (row[col.APPROVED] !== '1') continue
    if (row[col['EXOTIC CODE']] === 'X' && !opts.includeEscapees) {
      stats.escapees++
      continue
    }

    const locality = row[col['LOCALITY ID']]
    let place = places.get(locality)
    if (!place) {
      const coordinates = { LATITUDE: row[col.LATITUDE], LONGITUDE: row[col.LONGITUDE] }
      // getPoint falls back to the nearest town in the county, as a number
      const county = Number(row[col['COUNTY CODE']].split('-')[2])
      place = { towns: f.getPoint('towns', coordinates, county), regions: f.getPoint('regions', coordinates, county) }
      places.set(locality, place)
      if (areas.towns.has(place.towns) && areas.regions.has(place.regions)) {
        const votes = regionVotes.get(place.towns) || new Map()
        votes.set(place.regions, (votes.get(place.regions) || 0) + 1)
        regionVotes.set(place.towns, votes)
      }
    }

    const order = Number(row[col['TAXONOMIC ORDER']])
    const date = row[col['OBSERVATION DATE']]
    if (!scientificNames.has(commonName)) scientificNames.set(commonName, row[col['SCIENTIFIC NAME']])
    // A few localities on the Connecticut River have no county, or one in New
    // Hampshire; use the county of the town they were placed in
    const county = row[col.COUNTY]
    place = { ...place, counties: areas.counties.has(county) ? county : townCounties.get(place.towns) }
    for (const kind of KINDS) {
      let species = areas[kind].get(place[kind])
      if (!species && kind === 'regions' && areas.towns.has(place.towns)) {
        if (!regionless.has(place.towns)) regionless.set(place.towns, new Map())
        species = regionless.get(place.towns)
      }
      if (!species) {
        unplaced.add(`${kind}: ${locality} (${row[col.LATITUDE]}, ${row[col.LONGITUDE]})`)
        continue
      }
      note(species, commonName, { order, first: date })
    }
    stats.kept++
  }
  process.stderr.write('\n')

  for (const [town, species] of regionless) {
    const votes = [...(regionVotes.get(town) || [])].sort((a, b) => b[1] - a[1])
    if (!votes.length) {
      unplaced.add(`regions: every locality in ${town}`)
      continue
    }
    const region = areas.regions.get(votes[0][0])
    for (const [name, seen] of species) note(region, name, seen)
    console.error(`${species.size} species from outside the regions map in ${town} counted in ${votes[0][0]}`)
  }
  return { areas, stats, unplaced, scientificNames, localities: places.size }
}

// Record a species in an area: { order, first }, its taxonomic order and the
// earliest date it was seen there
function note (species, name, seen) {
  const known = species.get(name)
  if (!known) species.set(name, { ...seen })
  else if (seen.first < known.first) known.first = seen.first
}

// The species in the order they were first seen in the area, oldest first, so
// the site can number them; species first seen on the same day in taxonomic
// order
function inSeenOrder (species) {
  return [...species]
    .sort(([, a], [, b]) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.order - b.order))
    .map(([name]) => name)
}

// Species names -> unique banding codes, in the order first seen
function toCodes (species) {
  return [...new Set(inSeenOrder(species).map(toCode))]
}

// Species names -> a county bar chart entry
function toCounty (species, scientificNames) {
  const entries = {}
  for (const name of inSeenOrder(species)) {
    if (!entries[name]) entries[name] = { 'Scientific Name': scientificNames.get(name) }
  }
  return { taxa: String(Object.keys(entries).length), species: entries }
}

// What report() compares: the codes, or the county's names less the spuhs,
// hybrids and domestic types the old bar charts had and the site filters out
function speciesOf (kind, list) {
  if (!list) return []
  if (kind !== 'counties') return list
  return Object.entries(list.species)
    .filter(([, s]) => f.removeSpuh([{ 'Scientific Name': s['Scientific Name'] }]).length)
    .map(([name]) => name)
}

// One area per line, so a later update diffs one line per changed area
function format (lists) {
  const lines = Object.keys(lists).sort().map(area => `${JSON.stringify(area)}:${JSON.stringify(lists[area])}`)
  return `{\n${lines.join(',\n')}\n}\n`
}

async function readOld (kind) {
  try {
    return JSON.parse(await fs.readFile(OUTPUTS[kind], 'utf8'))
  } catch {
    return {}
  }
}

function keepSensitive (kind, lists, old) {
  for (const area of Object.keys(lists)) {
    for (const code of SENSITIVE_CODES) {
      if (kind !== 'counties') {
        if ((old[area] || []).includes(code) && !lists[area].includes(code)) lists[area].push(code)
        continue
      }
      const name = banding.codeToCommonName(code)
      const before = old[area]?.species?.[name]
      if (before && !lists[area].species[name]) {
        lists[area].species[name] = { 'Scientific Name': before['Scientific Name'] }
        lists[area].taxa = String(Object.keys(lists[area].species).length)
      }
    }
  }
}

function report (kind, lists, old) {
  console.error(`\n${kind}: ${Object.keys(lists).length} areas`)
  for (const area of Object.keys(lists).sort()) {
    const before = new Set(speciesOf(kind, old[area]))
    const after = new Set(speciesOf(kind, lists[area]))
    const added = [...after].filter(x => !before.has(x))
    const removed = [...before].filter(x => !after.has(x))
    console.error(`  ${area}: ${before.size} -> ${after.size} (+${added.length}, -${removed.length})${removed.length ? ' removed: ' + removed.join(' ') : ''}`)
  }
  for (const area of Object.keys(old).filter(a => !(a in lists))) {
    console.error(`  ${area}: in the old file but not on the map`)
  }
}

async function main () {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) {
    console.error('Usage: node scripts/updateAreaSightings.js <ebd_US-VT_*.txt> [--dry-run] [--include-escapees] [--release="Aug 2026"]')
    process.exit(1)
  }
  const opts = { dryRun: args.includes('--dry-run'), includeEscapees: args.includes('--include-escapees') }
  const releaseArg = args.find(a => a.startsWith('--release='))
  const release = releaseArg ? releaseArg.slice('--release='.length) : releaseFromFileName(path.basename(file))
  if (!release) {
    console.error('The EBD release is not in the file name; pass --release="Aug 2026".')
    process.exit(1)
  }

  const { areas, stats, unplaced, scientificNames, localities } = await readEBD(file, opts)
  console.error(`${stats.rows} rows, ${stats.kept} countable records kept, ${stats.escapees} escapee records skipped, ${localities} localities`)

  const unmapped = new Set()
  for (const kind of KINDS) {
    const lists = {}
    for (const [area, species] of areas[kind]) {
      if (kind === 'counties') {
        lists[area] = toCounty(species, scientificNames)
        continue
      }
      lists[area] = toCodes(species)
      for (const name of species.keys()) {
        if (!banding.isBandingCode(toCode(name))) unmapped.add(name)
      }
    }
    const old = await readOld(kind)
    keepSensitive(kind, lists, old)
    report(kind, lists, old)
    if (!opts.dryRun) {
      await fs.writeFile(OUTPUTS[kind], format(lists), 'utf8')
      console.error(`Wrote ${path.relative(root, OUTPUTS[kind])}`)
    }
  }

  if (!opts.dryRun) {
    // Local date, as YYYY-MM-DD
    const meta = { release, updated: new Date().toLocaleDateString('en-CA') }
    await fs.writeFile(META, JSON.stringify(meta, null, 2) + '\n', 'utf8')
    console.error(`Wrote ${path.relative(root, META)}: ${release}`)
  }

  if (unplaced.size) {
    console.error(`\n${unplaced.size} localities fell outside every area:`)
    for (const x of unplaced) console.error(`  ${x}`)
  }
  if (unmapped.size) {
    console.error(`\nNo banding code for ${unmapped.size} names; stored as the name itself:`)
    for (const x of [...unmapped].sort()) console.error(`  ${x}`)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
