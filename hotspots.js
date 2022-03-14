const fetch = require('node-fetch')
const VermontHotspots = require('./data/hotspots.json')
const Town_boundaries = require('./geojson/vt_towns.json')
const BerlinPond = {} //require('./montpelier.json')
const _ = require('lodash')
const fs = require('fs').promises
const moment = require('moment')
const Papa = require('papaparse')
const main = require('./index')
const helpers = require('./helpers')
const difference = require('compare-latlong')
const f = require('./filters')

// Get new hotspots lists
// curl --location -g --request GET 'https://api.ebird.org/v2/ref/hotspot/US-VT' > data/hotspots.csv
// node cli.js csvToJsonHotspots --input=data/hotspots.csv
// git diff -U0 data/hotspotsList.md
// git add data

async function csvToJsonHotspots (opts) {
  let input
  if (fs) {
    input = await fs.readFile(opts.input, 'utf8')
    input = input.split('\n')
    input.unshift('ID,Country,State/Province,Region,Latitude,Longitude,Name,Last visited,Species')
    input = input.join('\n').trim()
    input = Papa.parse(input, { header: true })
  }
  await fs.writeFile('data/hotspots.json', JSON.stringify(input.data))
  await fs.writeFile('data/novisits-hotspots.json', JSON.stringify(input.data.filter(x => !x['Last visited'])))
  const list = input.data.map(x => x.Name).join('\n')
  await fs.writeFile('data/hotspotsList.md', list)
}

async function hotspotsForTown (opts) {
  const hotspots = JSON.parse(await fs.readFile('data/hotspots.json', 'utf8'))
  return f.locationFilter(hotspots.map(x => {
    x.Latitude = x.lat
    x.Longitude = x.lng
    x.State = 'Vermont'
    return x
  }), opts)
}

// Show which hotspots you haven't birded in
async function unbirdedHotspots (opts) {
  let data
  if (!opts.state) { opts.state = 'Vermont' }
  if (opts.input) {
    data = await main.getData(opts.input)
  }

  let hotspots = JSON.parse(await fs.readFile('data/hotspots.json', 'utf8'))

  // If the opts are not this year
  if (opts.currentYear) {
    const year = moment().year()
    // Return all of the ones we haven't gone to
    hotspots = hotspots.filter(x => {
      if (x['Last visited']) {
        const visitedthisYear = moment(x['Last visited'], helpers.momentFormat(x['Last visited'])).format('YYYY') === year.toString()
        return !visitedthisYear
      } else {
        return true
      }
    })
  }

  // If the opts are not this year
  if (opts.sinceYear) {
    const year = opts.sinceYear
    // Return all of the ones we haven't gone to
    hotspots = hotspots.filter(x => {
      if (x['Last visited']) {
        const visitedthisYear = moment(x['Last visited'], helpers.momentFormat(x['Last visited'])).format('YYYY') > year
        return !visitedthisYear
      } else {
        return false
      }
    })
  }

  if (data) {
    hotspots = hotspots.filter(hotspot => {
      return !data.find(checklist => checklist['Location ID'] === hotspot.ID)
    })
  }

  // console.log(result.map(x => `${x.Name}, ${x['Last visited']}`))

  // .filter(x => x.Region === 'US-VT-023')
  // Print out the most unrecent in your county, basically
  console.log(hotspots.sort((a, b) => {
    if (a['Last visited'] && b['Last visited']) {
      const check = moment(a['Last visited']).diff(moment(b['Last visited']))
      return check
    } else {
      // Not really sure how to deal with this, doesn't seem to work well.
      return 0
    }
  }).map(x => `${x.Name}, ${x['Last visited']}`))

  // TODO Add to the map
  // TODO Find closest to you
}

// Show which hotspots are in which towns
async function townHotspots (opts) {
  if (!opts.state) { opts.state = 'Vermont' }

  // LocationFilter really shouldn't be used on these, as they're not checklists, but it works (for now...)
  let data = f.locationFilter(VermontHotspots.map(x => {
    // Otherwise it messes up and writes over the region
    x.County = main.eBirdCountyIds[Number(x.Region.split('US-VT-')[1])]
    return x
  }), opts)

  if (opts.noVisits) {
    if (opts.print) {
      const towns = main.getAllTowns(Town_boundaries).sort((a, b) => a.town.localeCompare(b.town));
      console.log('Towns with unvisited hotspots:')
      towns.forEach(t => {
        let hotspots = data.filter(x => x.Town === t.town)
        let noVisits = hotspots.filter(x => !x["Last visited"])
        if (noVisits.length) {
          console.log(`${helpers.capitalizeFirstLetters(t.town)}: ${noVisits.length}`)
          console.log(`  ${noVisits.map(x => `${x.Name} (https://ebird.org/hotspot/${x.ID})`).join('\n  ')}
            `)
          }
        })
    }
    let noVisits = data.filter(x => !x["Last visited"])
    return noVisits
  }
  if (opts.all) {
    const towns = main.getAllTowns(Town_boundaries).sort((a, b) => a.town.localeCompare(b.town));
    console.log('Town hotspots:')
    towns.forEach(t => {
      let hotspots = data.filter(x => x.Town === t.town)
      console.log(`${helpers.capitalizeFirstLetters(t.town)}: ${hotspots.length}`)
    })
  } else if (opts.town) {
    // Turn on to find checklists in that town console.log(_.uniq(data.map((item, i) => `${item['Submission ID']}`)))
    data = data.filter(x => x.Town === opts.town.toUpperCase())
    console.log(data)
  }
}

async function daysYouveBirdedAtHotspot (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  let name = (VermontHotspots.find(h => h.ID === opts.id)) ? VermontHotspots.find(h => h.ID === opts.id).Name : opts.id

  // Note - this assumes the location is a hotspot
  console.log(`
You have not birded in ${name} on:`)

  let data = BerlinPond //await main.getData(opts.input)
  let observedDates = {}
  let fullYearChart = {}
  let unbirdedDates = {}

  // Create keys in observedDates for months
  Array.from({length: 12}, (_, i) => (i+1).toString().padStart(2, '0')).forEach(key => observedDates[key] = [])

  // Filter and add all days observed to the chart
  // EDIT: this breaks for personal locations
  data.filter(x => x['Location ID'] === opts.id)
    .forEach(x => {
    let [month, day] = x.Date.split('-').slice(1)
    if (observedDates[month].indexOf(Number(day)) === -1) {
      observedDates[month].push(Number(day))
    }
  })

  // Create a full year chart, and then find days that weren't in days observed
  Object.keys(observedDates).forEach(month => {
    fullYearChart[month.toString().padStart(2, '0')] = Array.from({length: moment().month(month-1).daysInMonth()}, (_, i) => i + 1)
    unbirdedDates[month] = _.difference(fullYearChart[month], observedDates[month].sort((a,b) => a-b))
  })

  // Print
  Object.keys(unbirdedDates).sort((a,b) => Number(a)-Number(b)).forEach(month => {
    console.log(`${moment().month(Number(month)-1).format('MMMM')}: ${unbirdedDates[month].join(', ')}`)
  })
}

function dataForThisWeekInHistory (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  let data = BerlinPond
  let observedDates = []
  let unbirdedDates = Array.from({length: 52}, (_, i) => i + 1)

  // Filter and add all days observed to the chart
  data.filter(x => x['Location ID'] === opts.id).forEach(x => {
    let week = moment(x.Date).week()
    if (observedDates.indexOf(week) === -1) {
      observedDates.push(week)
    }
  })

  // Last observations are almost certainly not in the downloaded db.
  let lastBirdedWeek = moment(opts.latestObsDt.split(' ')[0]).week()
  if (!observedDates.includes(lastBirdedWeek)) {
    observedDates.push(lastBirdedWeek)
  }

  let unbirdedWeeks = _.difference(unbirdedDates, observedDates.sort((a,b) => Number(a)-Number(b)))
  // Returns next unbirded week
  if (unbirdedWeeks.length === 0) {
    return ''
  } else {
    let nextWeek = unbirdedWeeks.filter(w => w >= moment().week())[0]
    if (moment().week() === nextWeek) {
      return 'No data'
    } else {
      return '' // moment().startOf('year').week(nextWeek).startOf('week').format('YYYY-MM-DD')
    }
  }
}

async function weeksYouveBirdedAtHotspot (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  let data = await main.getData(opts.input)
  let observedDates = []
  let unbirdedDates = Array.from({length: 52}, (_, i) => i + 1)

  // Filter and add all days observed to the chart
  data.filter(x => x['Location ID'] === opts.id).forEach(x => {
    let week = moment(x.Date).week()
    if (observedDates.indexOf(week) === -1) {
      observedDates.push(week)
    }
  })

  let unbirdedWeeks = _.difference(unbirdedDates, observedDates.sort((a,b) => Number(a)-Number(b)))

  console.log()

  if (observedDates.length === 52){
    // Note - this assumes the location is a hotspot
    if (VermontHotspots.find(h => h.ID === opts.id).Name) {
      console.log(`
You've birded at ${VermontHotspots.find(h => h.ID === opts.id).Name} every week of the calendar year!`)
    } else {
      console.log(`You've birded at this location every week of the year!`)
    }

  } else {
    console.log(`You've not birded here on weeks: ${unbirdedWeeks.join(', ')}.`)
    console.log(`The next unbirded week (#${unbirdedWeeks[0]}) starts on ${moment().startOf('year').week(unbirdedWeeks[0]).startOf('week').format('dddd, MMMM Do')}.`)
  }
  console.log('Note this only takes into account your bird sightings, not the databases.')
  console.log()
}

/*
  A really useful function that won't be useful for anyone else - given the local
  hotspots in my area, which ones should I go to today to maximally fill out
  those hotspots?
*/
async function findMontpelierHotspotNeedsToday (opts) {
  console.log('')
  console.log('These hotspots have not been birded on this date:')
  console.log(`${'Hotspot'.padEnd(50)} Last        This Week`)
  console.log(`${'-----'.padEnd(72, '-')}`)
  const lat = '44.2587866'
  const lng = '-72.5740852'
  let today = moment().format('MM-DD')
  let data = BerlinPond
  let ids = [...new Set(data.map(item => item['Location ID']))]
  let unbirded = []
  ids.forEach(id => {
    data.filter(entry => entry['Location ID'] === id).forEach(entry => {
      if (entry.Date.slice(5) === today && !unbirded.includes(id)) {
        unbirded.push(id)
      }
    })
  })
  let unbirdedToday = ids.filter(x => !unbirded.includes(x))
  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/geo?lat=${lat}&lng=${lng}&dist=10&fmt=json`)
  const body = JSON.parse(await response.text())

  body
    .map((d) => {
      d.distance = difference.distance(lat, lng, d.lat, d.lng, 'M')
      d.nextUnbirdedWeek = dataForThisWeekInHistory({id: d.locId, latestObsDt: d.latestObsDt})
      return d
    })
    .filter(d => unbirdedToday.includes(d.locId))
    .filter(d => d.distance < 3)
    .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
    .forEach(d => {
      console.log(`${d.locName.padEnd(50)} ${d.latestObsDt.split(' ')[0]}    ${d.nextUnbirdedWeek}`)
    })
  console.log('')

  function hasBerlinPondBeenBirdedThisWeeK () {
    let lastDate = body.find(d => d.locId === 'L150998').latestObsDt.split(' ')[0]
    if (moment(lastDate).week() >= moment().week()) {
      return 'Yes'
    } else {
      return 'No'
    }
  }

  console.log(`Was Berlin Pond birded this week, this year: ${hasBerlinPondBeenBirdedThisWeeK()}.`)
}

module.exports = {
  csvToJsonHotspots,
  unbirdedHotspots,
  townHotspots,
  daysYouveBirdedAtHotspot,
  weeksYouveBirdedAtHotspot,
  findMontpelierHotspotNeedsToday,
  hotspotsForTown
}
