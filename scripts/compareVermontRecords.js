#!/usr/bin/env node
// Find the sightings in an EBD file that one VBRC list flags and another
// doesn't: when VCE publishes a new state list, which past records would the
// checker now ask about that it didn't before (and which has it stopped asking about)?
//
// Usage:
//   node scripts/compareVermontRecords.js <EBD file[,EBD file...]> --old <list> [options]
//
//   <EBD file>     A Vermont EBD download (.txt), or several, comma-separated.
//                  Statewide files are fine: the file is read once, a line at a time.
//   --old <list>   The list to compare against: a vermont_records.json file, or a
//                  git ref in this repo whose data/vermont_records.json to use
//                  (e.g. the commit before the list update).
//   --new <list>   The same, for the new list (default: data/vermont_records.json).
//   --since <date> Only sightings on or after this date (YYYY-MM-DD).
//   --county <c>   Only sightings in this county.
//   --details      Print every sighting, not just the totals per species.
//   --csv <file>   Write every sighting that changed to a CSV file.
//
// Example, for sightings since 2022 under the October 2026 list:
//   node scripts/compareVermontRecords.js ebd_US-VT_relOct-2026.txt --old 772d504 --since 2022-01-01 --csv /tmp/vbrc-changes.csv
//
// Both lists go through rare(), the same check the VBRC checker and `cli.js
// rare` use, so a sighting counts as flagged if it lands in any of rare()'s
// buckets. Both runs use the current data/vermont_records_subspecies.json.
// A species whose scientific name changed between the lists (as Winter Wren's
// did in 2026) is matched under either name, so an EBD from before or after
// eBird's taxonomy update gives the same answer.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import Papa from 'papaparse'
import { rare, couldBeRare, getData, RARITY_CATEGORIES } from '../index.js'
import { formatDate, parseDate } from '../helpers.js'
import { diffRecords } from './updateVermontRecords.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUCKETS = Object.keys(RARITY_CATEGORIES)

function loadList (spec) {
  if (fs.existsSync(spec)) return JSON.parse(fs.readFileSync(spec, 'utf8'))
  try {
    return JSON.parse(execFileSync('git', ['show', `${spec}:data/vermont_records.json`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch {
    throw new Error(`${spec} is neither a file nor a git ref with data/vermont_records.json`)
  }
}

const isoDate = date => /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : formatDate(parseDate(date), 'yyyy-MM-dd')

// Which buckets rare() put each sighting in. rare() returns the entry objects it was given.
function bucketsBySighting (output) {
  const buckets = new Map()
  for (const bucket of BUCKETS) {
    for (const e of output[bucket] || []) buckets.set(e, [...(buckets.get(e) || []), bucket])
  }
  return buckets
}

// Scientific names that differ between the lists for the same species (Winter
// Wren, Troglodytes -> Nannus), both ways. An EBD from before eBird's taxonomy
// update uses the old name, which the new list doesn't have: without this, every
// Winter Wren would be a Vermont first.
export function renames (oldList, newList) {
  const pairs = diffRecords(oldList, newList).renamed
    .map(({ from, to }) => [from['Scientific Name'], to['Scientific Name']])
    .filter(([a, b]) => a !== b)
  return { toOld: new Map(pairs.map(([a, b]) => [b, a])), toNew: new Map(pairs) }
}

export async function compareLists (input, oldList, newList, opts = {}) {
  const { toOld, toNew } = renames(oldList, newList)
  const inWindow = e => !opts.since || isoDate(e.Date) >= opts.since
  const rows = await getData(input, { keep: e => inWindow(e) && (couldBeRare(e, oldList) || couldBeRare(e, newList)) })
  // rare() matches on Scientific Name, so it gets a renamed copy; results map back to the row
  const run = async (records, rename) => {
    const original = new Map()
    const input = rows.map(e => {
      const name = rename.get(e['Scientific Name'])
      if (!name) return e
      const copy = { ...e, 'Scientific Name': name }
      original.set(copy, e)
      return copy
    })
    const buckets = bucketsBySighting(await rare({ input, records, ...(opts.county && { county: opts.county }) }))
    return new Map([...buckets].map(([e, b]) => [original.get(e) || e, b]))
  }
  const before = await run(oldList, toOld)
  const after = await run(newList, toNew)
  const nowFlagged = [...after].filter(([e]) => !before.has(e)).map(([e, buckets]) => ({ e, buckets }))
  const noLongerFlagged = [...before].filter(([e]) => !after.has(e)).map(([e, buckets]) => ({ e, buckets }))
  return { nowFlagged, noLongerFlagged, renamed: toNew }
}

const name = e => e.Subspecies ? `${e['Common Name']} [${e.Subspecies}]` : e['Common Name']
const link = e => e['Submission ID'] ? `https://ebird.org/checklist/${e['Submission ID']}` : ''
const reasons = buckets => buckets.map(b => RARITY_CATEGORIES[b]).join('; ')

function report (title, changes, details) {
  const lines = [`${title} (${changes.length})`]
  const bySpecies = new Map()
  for (const c of changes) {
    const key = `${name(c.e)}\u0000${reasons(c.buckets)}`
    bySpecies.set(key, [...(bySpecies.get(key) || []), c])
  }
  const groups = [...bySpecies.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  for (const [key, list] of groups) {
    const [species, why] = key.split('\u0000')
    const dates = list.map(c => isoDate(c.e.Date)).sort()
    lines.push(`  ${String(list.length).padStart(5)}  ${species}: ${why} (${dates[0]}${dates.length > 1 ? ` to ${dates.at(-1)}` : ''})`)
    if (details) {
      list.sort((a, b) => isoDate(a.e.Date).localeCompare(isoDate(b.e.Date)))
        .forEach(({ e }) => lines.push(`           ${isoDate(e.Date)} | ${[e.Location, e.County].filter(Boolean).join(', ')} | ${link(e)}`))
    }
  }
  return lines.join('\n')
}

function toCsv (changes) {
  const rows = [...changes.nowFlagged.map(c => ({ ...c, change: 'now flagged' })), ...changes.noLongerFlagged.map(c => ({ ...c, change: 'no longer flagged' }))]
    .map(({ e, buckets, change }) => ({
      Change: change,
      Reason: reasons(buckets),
      'Common Name': e['Common Name'],
      'Scientific Name': e['Scientific Name'],
      Subspecies: e.Subspecies || '',
      Date: isoDate(e.Date),
      Count: e.Count,
      'Breeding Code': e['Breeding Code'] || '',
      Location: e.Location,
      Town: e.Town || '',
      County: e.County,
      Checklist: link(e)
    }))
  return Papa.unparse(rows)
}

async function main () {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      old: { type: 'string' },
      new: { type: 'string', default: path.join(repoRoot, 'data', 'vermont_records.json') },
      since: { type: 'string' },
      county: { type: 'string' },
      details: { type: 'boolean', default: false },
      csv: { type: 'string' }
    }
  })
  if (positionals.length !== 1 || !values.old) {
    console.error('Usage: node scripts/compareVermontRecords.js <EBD file[,EBD file...]> --old <file|git ref> [--new <file|git ref>] [--since YYYY-MM-DD] [--county name] [--details] [--csv file]')
    process.exit(1)
  }
  if (values.since && !/^\d{4}-\d{2}-\d{2}$/.test(values.since)) throw new Error(`--since must be YYYY-MM-DD, not ${values.since}`)

  const changes = await compareLists(positionals[0], loadList(values.old), loadList(values.new), values)
  changes.renamed.forEach((to, from) => console.error(`Treating ${from} and ${to} as the same species`))
  console.log(report('Now flagged, and not flagged before', changes.nowFlagged, values.details))
  console.log('')
  console.log(report('Flagged before, and no longer flagged', changes.noLongerFlagged, values.details))
  if (values.csv) {
    fs.writeFileSync(values.csv, toCsv(changes) + '\n')
    console.error(`Wrote ${values.csv}`)
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(err.message)
    process.exit(1)
  })
}
