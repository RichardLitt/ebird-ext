#!/usr/bin/env node
// Regenerate data/townsightings.json and data/regionssightings.json, the
// all-time species lists for every Vermont town and biophysical region that
// the website's /towns and /regions maps show, from a statewide eBird Basic
// Dataset (EBD) download: https://ebird.org/data/download
//
// Usage:
//   node scripts/updateAreaSightings.js <ebd_US-VT_*.txt> [options]
//
//   --dry-run            Read the EBD and print the change report, but don't write.
//   --include-escapees   Keep records marked as escapees (exotic code X). eBird
//                        doesn't count them, so by default neither do we.
//
// Each list holds a species if it was reported there at least once. Only
// countable taxa are kept: species, and subspecies or forms counted as their
// species. Spuhs, slashes, hybrids and domestic types are dropped, except Feral
// Pigeon, which counts as Rock Pigeon.
//
// Species are stored as four-letter banding codes from
// data/ibpAlphaCodes2021.json, which follows the 2021 taxonomy, while the EBD
// uses the current eBird taxonomy. EBIRD_NAME_TO_CODE maps the names that have
// changed since then back to their old code. The website compares these lists
// with an older Vermont taxonomy, so the old codes are what it expects. The
// script lists any name it still can't map; add those to the map.
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
import * as f from '../filters.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUTS = {
  towns: path.join(root, 'data/townsightings.json'),
  regions: path.join(root, 'data/regionssightings.json')
}

// Current eBird common name -> the 2021 banding code for the same bird
export const EBIRD_NAME_TO_CODE = {
  // Splits, where Vermont's bird keeps the old code
  'Northern Yellow Warbler': 'YEWA',
  'Hudsonian Whimbrel': 'WHIM',
  'American Herring Gull': 'HERG',
  'American Goshawk': 'NOGO',
  'American Barn Owl': 'BANO',
  'Northern House Wren': 'HOWR',
  'Eastern Warbling Vireo': 'WAVI',
  'Western Cattle-Egret': 'CAEG',
  // Renames
  'Black-crowned Night Heron': 'BCNH',
  'Yellow-crowned Night Heron': 'YCNH',
  // Common and Hoary Redpoll, lumped
  Redpoll: 'CORE'
}

// Vermont species on eBird's sensitive list: https://support.ebird.org/en/support/solutions/articles/48000803210
export const SENSITIVE_CODES = ['SPGR', 'LEOW']

const COUNTABLE = new Set(['species', 'issf', 'form', 'intergrade'])

function isCountable (category, commonName) {
  return COUNTABLE.has(category) || (category === 'domestic' && commonName === 'Rock Pigeon')
}

function toCode (commonName) {
  return EBIRD_NAME_TO_CODE[commonName] || banding.commonNameToCode(commonName)
}

// Every town and region, so the map finds a list for each shape even if empty
async function emptyAreas () {
  const towns = JSON.parse(await fs.readFile(path.join(root, 'geojson/vt_towns.json'), 'utf8'))
  const regions = JSON.parse(await fs.readFile(path.join(root, 'geojson/Polygon_VT_Biophysical_Regions.json'), 'utf8'))
  return {
    towns: new Map(towns.features.map(x => [x.properties.town, new Map()])),
    regions: new Map(regions.features.map(x => [x.properties.name, new Map()]))
  }
}

async function readEBD (file, opts) {
  const areas = await emptyAreas()
  // A locality has one set of coordinates, so look each one up once
  const places = new Map()
  const unplaced = new Set()
  // The regions map has gaps (the East Bay marshes in West Haven, for one).
  // Records there go to whichever region the rest of their town is in.
  const regionVotes = new Map()
  const regionless = new Map()
  const stats = { rows: 0, kept: 0, escapees: 0 }
  let col

  const lines = readline.createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!col) {
      const header = line.replace(/^﻿/, '').split('\t')
      col = Object.fromEntries(header.map((name, i) => [name.trim(), i]))
      for (const name of ['CATEGORY', 'COMMON NAME', 'TAXONOMIC ORDER', 'EXOTIC CODE', 'COUNTY CODE', 'LOCALITY ID', 'LATITUDE', 'LONGITUDE', 'APPROVED']) {
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
    for (const kind of ['towns', 'regions']) {
      let species = areas[kind].get(place[kind])
      if (!species && kind === 'regions' && areas.towns.has(place.towns)) {
        if (!regionless.has(place.towns)) regionless.set(place.towns, new Map())
        species = regionless.get(place.towns)
      }
      if (!species) {
        unplaced.add(`${kind}: ${locality} (${row[col.LATITUDE]}, ${row[col.LONGITUDE]})`)
        continue
      }
      if (!species.has(commonName)) species.set(commonName, order)
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
    for (const [name, order] of species) {
      if (!region.has(name)) region.set(name, order)
    }
    console.error(`${species.size} species from outside the regions map in ${town} counted in ${votes[0][0]}`)
  }
  return { areas, stats, unplaced, localities: places.size }
}

// Species names in taxonomic order -> unique banding codes
function toCodes (species) {
  const codes = [...species].sort((a, b) => a[1] - b[1]).map(([name]) => toCode(name))
  return [...new Set(codes)]
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

function keepSensitive (lists, old) {
  for (const area of Object.keys(lists)) {
    for (const code of SENSITIVE_CODES) {
      if ((old[area] || []).includes(code) && !lists[area].includes(code)) lists[area].push(code)
    }
  }
}

function report (kind, lists, old) {
  console.error(`\n${kind}: ${Object.keys(lists).length} areas`)
  for (const area of Object.keys(lists).sort()) {
    const before = new Set(old[area] || [])
    const after = new Set(lists[area])
    const added = [...after].filter(x => !before.has(x))
    const removed = [...before].filter(x => !after.has(x))
    console.error(`  ${area}: ${before.size} -> ${after.size} (+${added.length}, -${removed.length})${removed.length ? ' removed: ' + removed.join(' ') : ''}`)
  }
  for (const area of Object.keys(old).filter(a => !(a in lists))) {
    console.error(`  ${area}: in the old file but no longer a ${kind.slice(0, -1)}`)
  }
}

async function main () {
  const args = process.argv.slice(2)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) {
    console.error('Usage: node scripts/updateAreaSightings.js <ebd_US-VT_*.txt> [--dry-run] [--include-escapees]')
    process.exit(1)
  }
  const opts = { dryRun: args.includes('--dry-run'), includeEscapees: args.includes('--include-escapees') }

  const { areas, stats, unplaced, localities } = await readEBD(file, opts)
  console.error(`${stats.rows} rows, ${stats.kept} countable records kept, ${stats.escapees} escapee records skipped, ${localities} localities`)

  const unmapped = new Set()
  for (const kind of ['towns', 'regions']) {
    const lists = {}
    for (const [area, species] of areas[kind]) {
      lists[area] = toCodes(species)
      for (const name of species.keys()) {
        if (!EBIRD_NAME_TO_CODE[name] && !banding.isBandingCode(toCode(name))) unmapped.add(name)
      }
    }
    const old = await readOld(kind)
    keepSensitive(lists, old)
    report(kind, lists, old)
    if (!opts.dryRun) {
      await fs.writeFile(OUTPUTS[kind], format(lists), 'utf8')
      console.error(`Wrote ${path.relative(root, OUTPUTS[kind])}`)
    }
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
