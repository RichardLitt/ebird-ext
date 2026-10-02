import VermontHotspots from './data/hotspots.json' with { type: 'json' }
import townBoundaries from './geojson/vt_towns.json' with { type: 'json' }
import _ from 'lodash'
import moment from 'moment'
import Papa from 'papaparse'
import * as main from './index.js'
import * as helpers from './helpers.js'
import * as f from './filters.js'

// Node-only file access, loaded on first use (see io.js)
const io = () => import('./io.js')

// Get new hotspots lists
// curl --location -g --request GET 'https://api.ebird.org/v2/ref/hotspot/US-VT' > data/hotspots.csv
// node cli.js csvToJsonHotspots --input=data/hotspots.csv
// git diff -U0 data/hotspotsList.md
// git add data

// Columns of https://api.ebird.org/v2/ref/hotspot/US-VT (CSV, no header row).
// Checklists was added to the API around 2024; older downloads stop at Species.
const HOTSPOT_COLUMNS = ['ID', 'Country', 'State/Province', 'Region', 'Latitude', 'Longitude', 'Name', 'Last visited', 'Species', 'Checklists']

async function csvToJsonHotspots (opts) {
  let input = await (await io()).readText(opts.input)
  input = input.split(/\r?\n/)
  input.unshift(HOTSPOT_COLUMNS.join(','))
  input = input.join('\n').trim()
  // Never-visited hotspots come with no trailing fields at all; give every
  // record every column (empty when missing) so they all look alike
  const data = Papa.parse(input, { header: true }).data.map(row => {
    const record = {}
    HOTSPOT_COLUMNS.forEach(column => { record[column] = row[column] ?? '' })
    return record
  })
  await (await io()).writeFile('data/hotspots.json', JSON.stringify(data))
  await (await io()).writeFile('data/novisits-hotspots.json', JSON.stringify(data.filter(x => !x['Last visited'])))
  const list = data.map(x => x.Name).join('\n')
  await (await io()).writeFile('data/hotspotsList.md', list)
}

async function hotspotsForTown (opts) {
  const hotspots = await (await io()).readJSON('data/hotspots.json')
  return f.locationFilter(hotspots.map(x => {
    // eBird API records use lat / lng; csvToJsonHotspots writes Latitude / Longitude
    if (x.Latitude === undefined) { x.Latitude = x.lat }
    if (x.Longitude === undefined) { x.Longitude = x.lng }
    x.State = 'Vermont'
    return x
  }), opts)
}

// Show which hotspots you haven't birded in
async function unbirdedHotspots (opts) {
  let data
  if (!opts.state) { opts.state = 'Vermont' }
  if (opts.input) {
    // Keep spuh-only checklists: you still birded there
    data = await main.getData(opts.input, { keepSpuh: true })
  }

  let hotspots = await (await io()).readJSON('data/hotspots.json')

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
        return true
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
  // Never-visited hotspots first, then oldest visit first
  console.log(hotspots.sort((a, b) => {
    if (a['Last visited'] && b['Last visited']) {
      const check = moment(a['Last visited']).diff(moment(b['Last visited']))
      return check
    } else if (a['Last visited']) {
      return 1
    } else if (b['Last visited']) {
      return -1
    } else {
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
  // Work on copies: locationFilter overwrites Region, which would break the next call
  let data = f.locationFilter(VermontHotspots.map(x => {
    // Otherwise it messes up and writes over the region
    return { ...x, County: main.eBirdCountyIds[Number(x.Region.split('US-VT-')[1])] }
  }), opts)

  if (opts.noVisits) {
    if (opts.print) {
      const towns = Object.keys(main.getAllTowns(townBoundaries)).sort((a, b) => a.localeCompare(b))
      console.log('Towns with unvisited hotspots:')
      towns.forEach(t => {
        const hotspots = data.filter(x => x.Town === t)
        const noVisits = hotspots.filter(x => !x['Last visited'])
        if (noVisits.length) {
          console.log(`${helpers.capitalizeFirstLetters(t)}: ${noVisits.length}`)
          console.log(`  ${noVisits.map(x => `${x.Name} (https://ebird.org/hotspot/${x.ID})`).join('\n  ')}
            `)
        }
      })
    }
    const noVisits = data.filter(x => !x['Last visited'])
    return noVisits
  }
  if (opts.all) {
    const towns = Object.keys(main.getAllTowns(townBoundaries)).sort((a, b) => a.localeCompare(b))
    console.log('Town hotspots:')
    towns.forEach(t => {
      const hotspots = data.filter(x => x.Town === t)
      console.log(`${helpers.capitalizeFirstLetters(t)}: ${hotspots.length}`)
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
    return
  }

  // Keep spuh-only checklists: you still birded there that week
  const data = await main.getData(opts.input, { keepSpuh: true })
  const observedDates = []
  const unbirdedDates = Array.from({ length: 52 }, (_, i) => i + 1)

  // Filter and add all days observed to the chart
  data.filter(x => x['Location ID'] === opts.id).forEach(x => {
    // Fold locale week 53 (the last few days of some years) into week 52
    const week = Math.min(moment(x.Date).week(), 52)
    if (observedDates.indexOf(week) === -1) {
      observedDates.push(week)
    }
  })

  const unbirdedWeeks = _.difference(unbirdedDates, observedDates.sort((a, b) => Number(a) - Number(b)))

  console.log()

  if (observedDates.length === 52) {
    const hotspot = VermontHotspots.find(h => h.ID === opts.id)
    if (hotspot && hotspot.Name) {
      console.log(`
You've birded at ${hotspot.Name} every week of the calendar year!`)
    } else {
      console.log("You've birded at this location every week of the year!")
    }
  } else {
    console.log(`You've not birded here on weeks: ${unbirdedWeeks.join(', ')}.`)
    // The next unbirded week after this one, wrapping to next year if needed
    let weekYear = moment().weekYear()
    let nextWeek = unbirdedWeeks.find(w => w > moment().week())
    if (!nextWeek) {
      nextWeek = unbirdedWeeks[0]
      weekYear += 1
    }
    console.log(`The next unbirded week (#${nextWeek}) starts on ${moment().year(weekYear).startOf('year').week(nextWeek).startOf('week').format('dddd, MMMM Do')}.`)
  }
  console.log('Note this only takes into account your bird sightings, not the databases.')
  console.log()
}

export {
  csvToJsonHotspots,
  unbirdedHotspots,
  townHotspots,
  weeksYouveBirdedAtHotspot,
  hotspotsForTown
}

export default {
  csvToJsonHotspots,
  unbirdedHotspots,
  townHotspots,
  weeksYouveBirdedAtHotspot,
  hotspotsForTown
}
