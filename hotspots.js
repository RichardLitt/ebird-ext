const VermontHotspots = require('./data/hotspots.json')
const townBoundaries = require('./geojson/vt_towns.json')
const _ = require('lodash')
const fs = require('fs').promises
const moment = require('moment')
const Papa = require('papaparse')
const main = require('./index')
const helpers = require('./helpers')
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
      const towns = main.getAllTowns(townBoundaries).sort((a, b) => a.town.localeCompare(b.town))
      console.log('Towns with unvisited hotspots:')
      towns.forEach(t => {
        const hotspots = data.filter(x => x.Town === t.town)
        const noVisits = hotspots.filter(x => !x['Last visited'])
        if (noVisits.length) {
          console.log(`${helpers.capitalizeFirstLetters(t.town)}: ${noVisits.length}`)
          console.log(`  ${noVisits.map(x => `${x.Name} (https://ebird.org/hotspot/${x.ID})`).join('\n  ')}
            `)
        }
      })
    }
    const noVisits = data.filter(x => !x['Last visited'])
    return noVisits
  }
  if (opts.all) {
    const towns = main.getAllTowns(townBoundaries).sort((a, b) => a.town.localeCompare(b.town))
    console.log('Town hotspots:')
    towns.forEach(t => {
      const hotspots = data.filter(x => x.Town === t.town)
      console.log(`${helpers.capitalizeFirstLetters(t.town)}: ${hotspots.length}`)
    })
  } else if (opts.town) {
    // Turn on to find checklists in that town console.log(_.uniq(data.map((item, i) => `${item['Submission ID']}`)))
    data = data.filter(x => x.Town === opts.town.toUpperCase())
    console.log(data)
  }
}

async function weeksYouveBirdedAtHotspot (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  const data = await main.getData(opts.input)
  const observedDates = []
  const unbirdedDates = Array.from({ length: 52 }, (_, i) => i + 1)

  // Filter and add all days observed to the chart
  data.filter(x => x['Location ID'] === opts.id).forEach(x => {
    const week = moment(x.Date).week()
    if (observedDates.indexOf(week) === -1) {
      observedDates.push(week)
    }
  })

  const unbirdedWeeks = _.difference(unbirdedDates, observedDates.sort((a, b) => Number(a) - Number(b)))

  console.log()

  if (observedDates.length === 52) {
    // Note - this assumes the location is a hotspot
    if (VermontHotspots.find(h => h.ID === opts.id).Name) {
      console.log(`
You've birded at ${VermontHotspots.find(h => h.ID === opts.id).Name} every week of the calendar year!`)
    } else {
      console.log("You've birded at this location every week of the year!")
    }
  } else {
    console.log(`You've not birded here on weeks: ${unbirdedWeeks.join(', ')}.`)
    console.log(`The next unbirded week (#${unbirdedWeeks[0]}) starts on ${moment().startOf('year').week(unbirdedWeeks[0]).startOf('week').format('dddd, MMMM Do')}.`)
  }
  console.log('Note this only takes into account your bird sightings, not the databases.')
  console.log()
}

module.exports = {
  csvToJsonHotspots,
  unbirdedHotspots,
  townHotspots,
  weeksYouveBirdedAtHotspot,
  hotspotsForTown
}
