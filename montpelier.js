// Montpelier-area hotspot tools: which Washington County hotspots haven't had
// a complete checklist on today's date, in any year, and how many weeks of the
// year each one has been birded.
//
// Usage:
//   node montpelier.js [lat,lng]                Hotspots within 12 miles that need a
//                                               checklist today (default: Montpelier)
//   node montpelier.js washington               The same, for every hotspot in the county
//   node montpelier.js daysYouveBirdedAtHotspot <hotspot ID>
//                                               Dates of the year nobody has birded it
//   node montpelier.js hotspotDates <ebd_..._sampling.txt> [county code]
//                                               Rebuild data/hotspotsDates.json
//   node montpelier.js ids                      Hotspot IDs within 10 miles of Montpelier
//   node montpelier.js region <region code>     Hotspot IDs in a region, e.g. US-VT-023
//
// The commands that call the eBird API need an API key in EBIRD_API_TOKEN
// (https://ebird.org/api/keygen).
//
// data/hotspotsDates.json holds the days of the year each hotspot has had a
// complete checklist, in any year. Rebuild it with hotspotDates from the
// sampling file of an EBD download (one row per checklist): only complete,
// non-incidental checklists at hotspots in the county count.

import { createReadStream, promises as fs } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import _ from 'lodash'
import { format, getDaysInMonth, getWeek } from 'date-fns'
import difference from 'compare-latlong'
import VermontHotspots from './data/hotspots.json' with { type: 'json' }
import hotspotDates from './data/hotspotsDates.json' with { type: 'json' }
import * as helpers from './helpers.js'

const HOTSPOT_DATES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data/hotspotsDates.json')
const MONTHS = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0'))

async function eBirdApi (url) {
  const token = process.env.EBIRD_API_TOKEN
  if (!token) throw new Error('Set EBIRD_API_TOKEN to your eBird API key (https://ebird.org/api/keygen).')
  const response = await fetch(url, { headers: { 'X-eBirdApiToken': token } })
  if (!response.ok) throw new Error(`eBird API ${response.status} for ${url}`)
  return response.json()
}

// Read an EBD sampling file a line at a time and collect, for each hotspot in
// the county, the days of the year with a complete, non-incidental checklist:
// { [locality ID]: { Location, 'Dates Birded': { '01': [days], ... } } }
async function buildHotspotDates (file, county = 'US-VT-023') {
  const hotspots = {}
  let col
  const lines = readline.createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!col) {
      const header = line.replace(/^\uFEFF/, '').split('\t')
      col = Object.fromEntries(header.map((name, i) => [name.trim(), i]))
      for (const name of ['LOCALITY', 'LOCALITY ID', 'LOCALITY TYPE', 'COUNTY CODE', 'OBSERVATION DATE', 'PROTOCOL NAME', 'ALL SPECIES REPORTED']) {
        if (!(name in col)) throw new Error(`${file} has no ${name} column; is it an EBD sampling file?`)
      }
      continue
    }
    if (!line) continue
    const row = line.split('\t')
    if (row[col['LOCALITY TYPE']] !== 'H' || row[col['COUNTY CODE']] !== county) continue
    if (row[col['ALL SPECIES REPORTED']] !== '1') continue
    if (['Incidental', 'Historical'].includes(row[col['PROTOCOL NAME']])) continue

    const id = row[col['LOCALITY ID']]
    if (!hotspots[id]) {
      hotspots[id] = { Location: row[col.LOCALITY], 'Dates Birded': Object.fromEntries(MONTHS.map(m => [m, []])) }
    }
    const [month, day] = row[col['OBSERVATION DATE']].split('-').slice(1)
    const days = hotspots[id]['Dates Birded'][month]
    if (days && !days.includes(Number(day))) days.push(Number(day))
  }
  for (const hotspot of Object.values(hotspots)) {
    for (const days of Object.values(hotspot['Dates Birded'])) days.sort((a, b) => a - b)
  }
  return hotspots
}

async function writeHotspotDates (file, county, output = HOTSPOT_DATES) {
  const hotspots = await buildHotspotDates(file, county)
  await fs.writeFile(output, JSON.stringify(hotspots), 'utf8')
  console.log(`Wrote ${Object.keys(hotspots).length} hotspots to ${output}.`)
}

// The days of the year nobody has birded a hotspot, by month
function unbirdedDays (id, data = hotspotDates) {
  const birded = data[id] ? data[id]['Dates Birded'] : {}
  const unbirded = {}
  MONTHS.forEach(month => {
    const daysInMonth = getDaysInMonth(new Date(new Date().getFullYear(), Number(month) - 1))
    unbirded[month] = _.difference(Array.from({ length: daysInMonth }, (_, i) => i + 1), birded[month] || [])
  })
  return unbirded
}

function daysYouveBirdedAtHotspot (id) {
  const hotspot = VermontHotspots.find(h => h.ID === id)
  const name = hotspot ? hotspot.Name : (hotspotDates[id] ? hotspotDates[id].Location : id)
  if (!hotspotDates[id]) console.log(`${id} is not in data/hotspotsDates.json, so it has no checklists on record.`)
  console.log(`\nNobody has birded ${name} on:`)
  const unbirded = unbirdedDays(id)
  MONTHS.forEach(month => {
    console.log(`${format(new Date(2000, Number(month) - 1), 'MMMM')}: ${unbirded[month].join(', ')}`)
  })
}

function dataForThisWeekInHistory (opts, data = hotspotDates) {
  const observedWeeks = []
  const allWeeks = Array.from({ length: 52 }, (_, i) => i + 1)

  if (data[opts.id]) {
    Object.keys(data[opts.id]['Dates Birded'])
      .forEach(month => {
        data[opts.id]['Dates Birded'][month].forEach(date => {
          const week = getWeek(new Date(new Date().getFullYear(), Number(month) - 1, date))
          if (observedWeeks.indexOf(week) === -1) {
            observedWeeks.push(week)
          }
        })
      })
  }

  // The latest checklist is probably newer than the EBD download. It may be
  // incidental, but there's no way to tell from the hotspot list.
  const lastBirdedWeek = (opts.latestObsDt) ? getWeek(helpers.parseDate(opts.latestObsDt.split(' ')[0])) : null
  if (lastBirdedWeek && !observedWeeks.includes(lastBirdedWeek)) {
    observedWeeks.push(lastBirdedWeek)
  }

  const unbirdedWeeks = _.difference(allWeeks, observedWeeks)
  const obj = {
    nextUnbirdedWeek: '',
    coveragePercentage: (52 - unbirdedWeeks.length) / 52 * 100
  }
  if (unbirdedWeeks.includes(getWeek(new Date()))) {
    obj.nextUnbirdedWeek = 'No data'
  }
  return obj
}

async function getIdsFromRadius (opts) {
  const body = await eBirdApi(`https://api.ebird.org/v2/ref/hotspot/geo?lat=${opts.lat}&lng=${opts.lng}&dist=${opts.miles}&fmt=json`)
  body.forEach(d => console.log(d.locId))
}

async function getIdsFromRegion (opts) {
  const body = await eBirdApi(`https://api.ebird.org/v2/ref/hotspot/${opts.regionCode}?fmt=json`)
  body.forEach(d => console.log(d.locId))
}

/*
  A really useful function that won't be useful for anyone else - given the local
  hotspots in my area, which ones should I go to today to maximally fill out
  those hotspots? With no opts, every hotspot in Washington County.
*/
async function findMontpelierHotspotNeedsToday (opts) {
  const month = format(new Date(), 'MM')
  const todayDate = new Date().getDate()

  const body = await eBirdApi(opts
    ? `https://api.ebird.org/v2/ref/hotspot/geo?lat=${opts.lat}&lng=${opts.lng}&dist=${opts.miles}&fmt=json`
    : 'https://api.ebird.org/v2/ref/hotspot/US-VT-023?fmt=json')
  const ids = body.map(d => d.locId)

  // Birded on this date in some earlier year, according to hotspotsDates.json
  const birded = ids.filter(id => hotspotDates[id] && (hotspotDates[id]['Dates Birded'][month] || []).includes(todayDate))

  // Birded today, according to the latest checklists in the county
  const recent = await eBirdApi('https://api.ebird.org/v2/product/lists/US-VT-023?maxResults=50')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  const birdedToday = recent.filter(item => item.isoObsDate.startsWith(today)).map(item => item.locId)

  const unbirdedToday = ids.filter(x => !birded.includes(x) && !birdedToday.includes(x))

  console.log('\nThese hotspots have not had a complete checklist submitted on this date:')
  console.log(`Last             Cover      ${'Hotspot (Coverage)'.padEnd(50)}`)
  console.log(`${'-----'.padEnd(72, '-')}`)

  body
    .map(d => {
      if (opts) {
        d.distance = difference.distance(opts.lat, opts.lng, d.lat, d.lng, 'M')
      }
      const data = dataForThisWeekInHistory({ id: d.locId, latestObsDt: d.latestObsDt })
      d.nextUnbirdedWeek = data.nextUnbirdedWeek
      d.coveragePercentage = data.coveragePercentage
      return d
    })
    .filter(d => unbirdedToday.includes(d.locId))
    .filter(d => (opts && d.distance) ? d.distance < opts.miles : true)
    .sort((a, b) => (opts) ? parseFloat(a.distance) - parseFloat(b.distance) : a.locName.localeCompare(b.locName))
    .forEach(d => {
      d.locName = d.locName
        .replace('(Restricted Access)', '')
        .replace('Cross Vermont Trail--', '')
        .replace(' - East Montpelier', '')
        .replace('-East Montpelier', '')
        .replace(' - Berlin', '')
        .replace(/\(\d+ acres\)/i, '')
        .trim()
      console.log(`${(d.latestObsDt) ? d.latestObsDt.split(' ')[0] : '          '}  ${(d.nextUnbirdedWeek || '').padEnd(8)} ${(d.locName + ' (' + Math.round(d.coveragePercentage) + '%)').padEnd(42)} https://ebird.org/hotspot/${d.locId} `)
    })

  console.log(`

How does this script work? It takes the hotspots near Montpelier from the eBird API, and checks which dates
each has had a complete checklist, using data/hotspotsDates.json (built from the eBird Basic Dataset) and
today's checklists. Coverage is the percentage of the year's 52 weeks with a checklist in any year, so a
hotspot birded in all 52 weeks is at 100%.

For more infomation, see https://github.com/RichardLitt/ebird-ext/.
`)
}

async function main (args) {
  const [command, arg, arg2] = args
  switch (command) {
    case 'daysYouveBirdedAtHotspot':
      if (!arg) throw new Error("Expected a hotspot ID after 'daysYouveBirdedAtHotspot'")
      return daysYouveBirdedAtHotspot(arg)
    case 'hotspotDates':
      if (!arg) throw new Error("Expected an EBD sampling file after 'hotspotDates'")
      return writeHotspotDates(arg, arg2)
    case 'region':
      if (!arg) throw new Error("Expected a region code after 'region'")
      return getIdsFromRegion({ regionCode: arg })
    case 'ids':
      return getIdsFromRadius({ miles: 10, lat: '44.2587866', lng: '-72.5740852' })
    case 'washington':
      return findMontpelierHotspotNeedsToday()
    default: {
      const opts = { miles: 12, lat: '44.2587866', lng: '-72.5740852' }
      if (command && command.split(',').length === 2) {
        [opts.lat, opts.lng] = command.split(',')
      } else if (command) {
        throw new Error(`Unknown command: ${command}`)
      }
      return findMontpelierHotspotNeedsToday(opts)
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Error: ${error.message}`)
    process.exitCode = 1
  })
}

export {
  buildHotspotDates,
  unbirdedDays,
  dataForThisWeekInHistory,
  main
}
