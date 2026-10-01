#!/usr/bin/env node
// Regenerate data/vermont_records.json from the Vermont Bird Records
// Committee (VBRC) state checklist PDF published by the Vermont Center for
// Ecostudies: https://vtecostudies.org/vbrc/
//
// Usage:
//   node scripts/updateVermontRecords.js <VTStateList.pdf|list.txt> [options]
//
//   <input>        The checklist PDF (converted with `pdftotext -layout`,
//                  from poppler, which must be on PATH), or a text file you
//                  already made with `pdftotext -layout list.pdf list.txt`.
//   --out <file>   Where to write the JSON (default: data/vermont_records.json).
//   --dry-run      Parse and print the change report, but don't write.
//   --aos-names    Keep the PDF's AOS scientific names verbatim instead of
//                  applying EBIRD_SCIENTIFIC_NAMES (see below).
//   --taxonomy <f> Warn about any scientific name missing from an eBird
//                  taxonomy CSV, e.g. the current one from
//                  https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=csv&cat=species
//
// Example:
//   curl -L -o /tmp/VTStateList.pdf <url of the current list PDF>
//   node scripts/updateVermontRecords.js /tmp/VTStateList.pdf
//
// The script prints a report to stderr of species added, removed and changed
// (by scientific name, and by common name for renamed taxa) compared with the
// file it is about to overwrite. Review that report against the PDF.
//
// Each row of the checklist looks like
//   11   Mute Swan   Cygnus olor   I *   N   1A-12D
// i.e. number, common name, scientific name, then optional Status (E, H, I,
// X), Breeding ('*', sometimes glued to the status as in 'X*'), Reporting
// (C, K, N, V) and Occurrence (e.g. '3A-5C, 9A-1D', '3A-12C+'). Column
// positions drift between pages, so rows are parsed by token, not position.
// The parser fails loudly on anything it doesn't recognise, on gaps in the
// row numbering, and if the count doesn't match the total in the header.
//
// The VBRC list follows the AOS checklist, but rare() matches sightings from
// eBird exports by scientific name, and eBird (Clements) sometimes differs.
// EBIRD_SCIENTIFIC_NAMES maps the AOS name to the eBird one for those taxa, so
// that e.g. every Yellow Warbler isn't reported as a Vermont first. Common
// names (the Species field) stay as VBRC writes them. Re-check this map with
// --taxonomy whenever either taxonomy changes.
//
// Output: one record per line, keys in alphabetical order (the order the
// original file used), so that future diffs show one changed line per species.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STATUS = ['E', 'H', 'I', 'X']
const REPORTING = ['C', 'K', 'N', 'V']
// AOS (as printed by VBRC) -> eBird/Clements v2025
export const EBIRD_SCIENTIFIC_NAMES = {
  // eBird split Whimbrel; the Vermont bird is Hudsonian Whimbrel
  'Numenius phaeopus': 'Numenius hudsonicus',
  'Dryobates villosus': 'Leuconotopicus villosus',
  // eBird split Yellow Warbler; the Vermont bird is Northern Yellow Warbler
  'Setophaga petechia': 'Setophaga aestiva',
  'Coccothraustes vespertinus': 'Hesperiphona vespertina'
}
const KEYS = ['Breeding', 'Occurrence', 'Reporting', 'Scientific Name', 'Species', 'Status']

const week = '(?:1[0-2]|[1-9])[A-D]'
const range = `${week}(?:-${week})?`
const occurrence = `${range}(?:, ${range})*\\+?`
// Everything after the scientific name: [status][*] [reporting] [occurrence]
const tailPattern = new RegExp(
  `^(?:([${STATUS.join('')}])\\s*)?(\\*)?\\s*(?:([${REPORTING.join('')}])(?=\\s|$))?\\s*(${occurrence})?$`
)
const rowPattern = /^\s*(\d+)\s+(\S.*?)\s{2,}([A-Z][a-z]+ [a-z]+)(?:\s+(.*?))?\s*$/

export function parseStateList (text) {
  const lines = text.split('\n')
  const records = []
  const header = text.match(/includes\s+(\d+)\s+species/)
  for (const line of lines) {
    // Prose lines that happen to start with a number are skipped here; a
    // real row that fails to match is caught by the numbering check below.
    const row = line.match(rowPattern)
    if (!row) continue
    const [, number, species, scientificName, tail = ''] = row
    const fields = tail.trim().match(tailPattern)
    if (!fields) throw new Error(`Unrecognised codes in row ${number}: ${JSON.stringify(tail)}`)
    const [, status = '', breeding = '', reporting = '', occ = ''] = fields
    if (Number(number) !== records.length + 1) {
      throw new Error(`Expected row ${records.length + 1}, found row ${number}: ${JSON.stringify(line)}`)
    }
    records.push({
      Breeding: breeding,
      Occurrence: occ,
      Reporting: reporting,
      'Scientific Name': scientificName,
      // The PDF mixes typographic and straight apostrophes; people type straight ones
      Species: species.replace(/\u2019/g, "'"),
      Status: status
    })
  }
  if (header && Number(header[1]) !== records.length) {
    throw new Error(`Header says ${header[1]} species, but parsed ${records.length}`)
  }
  return records
}

export function applyEbirdNames (records, map = EBIRD_SCIENTIFIC_NAMES) {
  return records.map(r => map[r['Scientific Name']] ? { ...r, 'Scientific Name': map[r['Scientific Name']] } : r)
}

export function formatRecords (records) {
  const lines = records.map(r => JSON.stringify(Object.fromEntries(KEYS.map(k => [k, r[k]]))))
  return `[${lines.join(',\n')}]\n`
}

export function diffRecords (before, after) {
  const bySci = list => new Map(list.map(r => [r['Scientific Name'], r]))
  const byName = list => new Map(list.map(r => [r.Species, r]))
  const oldSci = bySci(before)
  const newSci = bySci(after)
  const oldName = byName(before)
  const report = { added: [], removed: [], renamed: [], changed: [] }
  const compare = (o, n) => KEYS
    .filter(k => o[k] !== n[k])
    .map(k => ({ field: k, from: o[k], to: n[k] }))

  const matchedOld = new Set()
  for (const n of after) {
    let o = oldSci.get(n['Scientific Name'])
    if (!o && oldName.has(n.Species) && !newSci.has(oldName.get(n.Species)['Scientific Name'])) {
      o = oldName.get(n.Species)
    }
    if (!o) {
      report.added.push(n)
      continue
    }
    matchedOld.add(o)
    const changes = compare(o, n)
    if (changes.some(c => c.field === 'Scientific Name' || c.field === 'Species')) {
      report.renamed.push({ from: o, to: n, changes })
    } else if (changes.length) {
      report.changed.push({ record: n, changes })
    }
  }
  report.removed = before.filter(o => !matchedOld.has(o))
  return report
}

export function formatReport (report) {
  const name = r => `${r.Species} (${r['Scientific Name']})`
  const change = c => `${c.field}: ${JSON.stringify(c.from)} -> ${JSON.stringify(c.to)}`
  const out = []
  out.push(`Added (${report.added.length}):`)
  report.added.forEach(r => out.push(`  + ${name(r)} ${JSON.stringify(r)}`))
  out.push(`Removed (${report.removed.length}):`)
  report.removed.forEach(r => out.push(`  - ${name(r)}`))
  out.push(`Renamed (${report.renamed.length}):`)
  report.renamed.forEach(({ from, to, changes }) => {
    out.push(`  ~ ${name(from)} => ${name(to)}`)
    changes.filter(c => !['Species', 'Scientific Name'].includes(c.field)).forEach(c => out.push(`      ${change(c)}`))
  })
  out.push(`Changed (${report.changed.length}):`)
  report.changed.forEach(({ record, changes }) => {
    out.push(`  * ${name(record)}`)
    changes.forEach(c => out.push(`      ${change(c)}`))
  })
  return out.join('\n')
}

function readInput (input) {
  if (input.toLowerCase().endsWith('.pdf')) {
    return execFileSync('pdftotext', ['-layout', input, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 })
  }
  return fs.readFileSync(input, 'utf8')
}

function main (argv) {
  const args = argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const outIndex = args.indexOf('--out')
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const out = outIndex === -1 ? path.join(repoRoot, 'data', 'vermont_records.json') : args[outIndex + 1]
  const valueOf = flag => args.indexOf(flag) === -1 ? -1 : args.indexOf(flag) + 1
  const input = args.find((a, i) => !a.startsWith('--') && i !== valueOf('--out') && i !== valueOf('--taxonomy'))
  if (!input || !out) {
    console.error('Usage: node scripts/updateVermontRecords.js <VTStateList.pdf|list.txt> [--out file] [--dry-run] [--aos-names] [--taxonomy ebird.csv]')
    process.exit(1)
  }

  const parsed = parseStateList(readInput(input))
  const records = args.includes('--aos-names') ? parsed : applyEbirdNames(parsed)
  parsed.forEach((r, i) => {
    if (r !== records[i]) console.error(`eBird name: ${r.Species} ${r['Scientific Name']} -> ${records[i]['Scientific Name']}`)
  })
  const taxonomyIndex = args.indexOf('--taxonomy')
  if (taxonomyIndex !== -1) {
    const known = new Set(fs.readFileSync(args[taxonomyIndex + 1], 'utf8').split('\n').map(l => l.split(',')[0]))
    records.filter(r => !known.has(r['Scientific Name']))
      .forEach(r => console.error(`WARNING: not in eBird taxonomy: ${r.Species} (${r['Scientific Name']})`))
  }
  const before = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : []
  console.error(`Parsed ${records.length} species (previously ${before.length}).`)
  console.error(formatReport(diffRecords(before, records)))
  if (!dryRun) {
    fs.writeFileSync(out, formatRecords(records))
    console.error(`Wrote ${out}`)
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv)
}
