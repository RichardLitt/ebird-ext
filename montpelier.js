const fetch = require('node-fetch')
const VermontHotspots = require('./data/hotspots.json')
const montpelierHotspotIDs = require('./data/10kmontpelierhotspotids.json')
const eBirdDataAsJSON = require('./data/montpelierhotspots.json')
const _ = require('lodash')
const moment = require('moment')
const difference = require('compare-latlong')
const f = require('./filters')

if (process.argv[2] === 'daysYouveBirdedAtHotspot') {
  daysYouveBirdedAtHotspot(process.argv[3])
} else {
  findMontpelierHotspotNeedsToday()
}

async function daysYouveBirdedAtHotspot (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  const name = (VermontHotspots.find(h => h.ID === opts.id)) ? VermontHotspots.find(h => h.ID === opts.id).Name : opts.id

  // Note - this assumes the location is a hotspot
  console.log(`
You have not birded in ${name} on:`)

  const data = eBirdDataAsJSON
  const observedDates = {}
  const fullYearChart = {}
  const unbirdedDates = {}

  // Create keys in observedDates for months
  Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).forEach(key => observedDates[key] = [])

  // Filter and add all days observed to the chart
  // EDIT: this breaks for personal locations
  data.filter(x => x['Location ID'] === opts.id)
    .forEach(x => {
      const [month, day] = x.Date.split('-').slice(1)
      if (observedDates[month].indexOf(Number(day)) === -1) {
        observedDates[month].push(Number(day))
      }
    })

  // Create a full year chart, and then find days that weren't in days observed
  Object.keys(observedDates).forEach(month => {
    fullYearChart[month.toString().padStart(2, '0')] = Array.from({ length: moment().month(month - 1).daysInMonth() }, (_, i) => i + 1)
    unbirdedDates[month] = _.difference(fullYearChart[month], observedDates[month].sort((a, b) => a - b))
  })

  // Print
  Object.keys(unbirdedDates).sort((a, b) => Number(a) - Number(b)).forEach(month => {
    console.log(`${moment().month(Number(month) - 1).format('MMMM')}: ${unbirdedDates[month].join(', ')}`)
  })
}

function dataForThisWeekInHistory (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  const data = eBirdDataAsJSON
  const observedDates = []
  const unbirdedDates = Array.from({ length: 52 }, (_, i) => i + 1)

  // Filter and add all days observed to the chart
  data
    .filter(x => (x.length !== 0 && x[0]) ? x[0]['Location ID'] === opts.id : false)
    // Should automatically happen anyway due to data input
    .filter(x => f.completeChecklistFilter(x, { complete: true, noIncidental: true }))
    .forEach(x => {
      const week = moment(x[0].Date).week()
      if (observedDates.indexOf(week) === -1) {
        observedDates.push(week)
      }
    })

  // Last observations are almost certainly not in the downloaded db.
  // Note - latest observations can be incindental. I can't think of a way around this, except to get all of the checklists from a region
  const lastBirdedWeek = moment(opts.latestObsDt.split(' ')[0]).week()
  if (!observedDates.includes(lastBirdedWeek)) {
    observedDates.push(lastBirdedWeek)
  }

  const unbirdedWeeks = _.difference(unbirdedDates, observedDates.sort((a, b) => Number(a) - Number(b)))
  // Returns next unbirded week
  if (unbirdedWeeks.length === 0) {
    return ''
  } else {
    const nextWeek = unbirdedWeeks.filter(w => w >= moment().week())[0]
    if (moment().week() === nextWeek) {
      return 'No data'
    } else {
      return '' // moment().startOf('year').week(nextWeek).startOf('week').format('YYYY-MM-DD')
    }
  }
}

/*
  A really useful function that won't be useful for anyone else - given the local
  hotspots in my area, which ones should I go to today to maximally fill out
  those hotspots?
*/
async function findMontpelierHotspotNeedsToday (opts) {
  console.log('')
  console.log('These hotspots have not been birded on this date:')
  console.log(`Last        Week     ${'Hotspot'.padEnd(50)}`)
  console.log(`${'-----'.padEnd(72, '-')}`)
  const lat = '44.2587866'
  const lng = '-72.5740852'
  const today = moment().format('MM-DD')
  const data = eBirdDataAsJSON
  const ids = montpelierHotspotIDs.ids // [...new Set(data.map(item => item['Location ID']))]
  // console.log(montpelierHotspotIDs.ids, ids)
  const unbirded = []
  ids.forEach(id => {
    data.filter(entry => entry['Location ID'] === id).forEach(entry => {
      if (entry.Date.slice(5) === today && !unbirded.includes(id)) {
        unbirded.push(id)
      }
    })
  })
  const unbirdedToday = ids.filter(x => !unbirded.includes(x))
  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/geo?lat=${lat}&lng=${lng}&dist=10&fmt=json`)
  const body = JSON.parse(await response.text())

  body
    .map((d) => {
      d.distance = difference.distance(lat, lng, d.lat, d.lng, 'M')
      d.nextUnbirdedWeek = dataForThisWeekInHistory({ id: d.locId, latestObsDt: d.latestObsDt })
      return d
    })
    // Don't show hotspots that have been birded
    .filter(d => unbirdedToday.includes(d.locId))
    // Within a three mile radius
    .filter(d => d.distance < 3)
    .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
    // Print the results
    .forEach(d => {
      console.log(`${d.latestObsDt.split(' ')[0]}  ${(d.nextUnbirdedWeek) ? d.nextUnbirdedWeek.padEnd(8) : ''.padEnd(8)} ${d.locName.padEnd(50)}`)
    })
  console.log('')

  function hasBerlinPondBeenBirdedThisWeeK () {
    const lastDate = body.find(d => d.locId === 'L150998').latestObsDt.split(' ')[0]
    if (moment(lastDate).week() >= moment().week()) {
      return 'Yes'
    } else {
      return 'No'
    }
  }

  console.log(`Was Berlin Pond birded this week, this year: ${hasBerlinPondBeenBirdedThisWeeK()}.`)
}
