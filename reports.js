// Text output for the CLI. The library functions return data; these turn it
// into lines to print, so the wording can be tested without running the CLI.
// (The VBRC reports, rareReport and rareSlackReport, live in index.js, which
// the site also uses them from.)

import _ from 'lodash'
import { format } from 'date-fns'
import * as f from './filters.js'
import * as helpers from './helpers.js'

// towns({ town }): one line per species, in the order first seen there
function townReport (speciesByDate, town) {
  const lines = []
  _.sortBy(f.createPeriodArray(speciesByDate), 'Date').forEach(e => {
    e.Species.forEach(specie => {
      lines.push(`${lines.length + 1} | ${specie['Common Name']} - ${specie['Scientific Name']} | ${town}, ${(specie.County) ? specie.County + ', ' : ''}${specie.State} | ${e.Date}`)
    })
  })
  return lines
}

// counties() with --ticks: the species in every county, added up
function countyTicks (counties) {
  const total = Object.values(counties).reduce((sum, county) => sum + county.speciesTotal, 0)
  return `Total ticks: ${total}.`
}

// state(): the species total, then the species first seen on each day
function stateReport (state) {
  return [
    String(state.species.length),
    ...Object.keys(state.speciesByDate).map(d => `${d}: ${state.speciesByDate[d].map(submission => submission['Common Name']).join(', ')}.`)
  ]
}

// quadBirds(): the date each species was completed (with --list), then the total
function quadReport (completionDates, opts = {}) {
  const lines = opts.list ? completionDates.map(c => `${c.Date}: ${c.species['Common Name']}.`) : []
  const thisYear = !opts.year || opts.year.toString() === format(new Date(), 'yyyy')
  lines.push(`You ${thisYear ? 'have seen' : 'saw'}, photographed, and recorded a total of ${completionDates.length} species${(opts.year) ? ` in ${opts.year}` : ''}.`)
  return lines
}

// townHotspots({ all }): the number of hotspots in each town
function townHotspotCounts (hotspots, towns) {
  return ['Town hotspots:', ...towns.map(t => `${helpers.capitalizeFirstLetters(t)}: ${hotspots.filter(x => x.Town === t).length}`)]
}

// townHotspots({ noVisits, print }): the never-visited hotspots in each town
function unvisitedHotspotsByTown (hotspots, towns) {
  const lines = ['Towns with unvisited hotspots:']
  towns.forEach(t => {
    const noVisits = hotspots.filter(x => x.Town === t)
    if (noVisits.length) {
      lines.push(`${helpers.capitalizeFirstLetters(t)}: ${noVisits.length}`)
      noVisits.forEach(x => lines.push(`  ${x.Name} (https://ebird.org/hotspot/${x.ID})`))
    }
  })
  return lines
}

// weeksYouveBirdedAtHotspot()
function weeksReport (result) {
  const lines = ['']
  if (result.unbirdedWeeks.length === 0) {
    lines.push(result.name
      ? `You've birded at ${result.name} every week of the calendar year!`
      : "You've birded at this location every week of the year!")
  } else {
    lines.push(`You've not birded here on weeks: ${result.unbirdedWeeks.join(', ')}.`)
    lines.push(`The next unbirded week (#${result.nextWeek}) starts on ${format(helpers.parseDate(result.nextWeekStart), 'EEEE, MMMM do')}.`)
  }
  lines.push('Note this only takes into account your bird sightings, not the databases.', '')
  return lines
}

export {
  townReport,
  countyTicks,
  stateReport,
  quadReport,
  townHotspotCounts,
  unvisitedHotspotsByTown,
  weeksReport
}
