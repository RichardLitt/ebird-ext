#!/usr/bin/env node
'use strict'

const meow = require('meow')
const main = require('./index')
const hotspots = require('./hotspots')
const _ = require('lodash')
const moment = require('moment')

const cli = meow(`
  Usage
    $ node cli.js <input> [opts]

  Arguments
    quad          Show quad birds
    first         Show your entire first time lists
    big           Show all your biggest time periods
    big-year      Show your biggest year
    big-month     Show your biggest month
    big-day       Show your biggest day
    first-year    Show your first lists
    first-month   Show your first lists
    first-day     Show your first lists
    towns         Show your town counts
    regions       Show your region counts
    counties      Show your counties counts
    rare          Show which rarities to report to records committee
    251           Show 251
    winterFinch   Show winterFinch needs
    subspecies    Show subspecies, spuhs, and other leaf nodes
    checklists    Show checklists for a given region and time
    getLastDate   Show most recent date from checklist
    countTheBirds Show the sum of all individual birds counted
    townHotspots  Show which hotspots are in which towns
    csvToJsonHotspots Create hotspots file
    unbirdedHotspots  Show which hotspots haven't been birded

  Options
    --input, -i The input file
    --country   Search by country
    --state     Search by state
    --county    Search by county
    --year      Limit results to a given year
    --town      Search by towns in Vemront
    --region    Search by biophysical regions in Vermont
    --list, -l  List all of the species
    --complete  Filter by complete checklists only
    --verbose   Adds extra logging

  Examples
    $ node cli.js
`, {
  flags: {
    input: {
      type: 'string',
      alias: 'i'
    },
    country: {
      type: 'string'
    },
    county: {
      type: 'string'
    },
    state: {
      type: 'string'
    },
    year: {
      type: 'string'
    },
    town: {
      type: 'string'
    },
    list: {
      type: 'boolean',
      alias: 'l'
    },
    towns: {
      type: 'string'
    },
    regions: {
      type: 'string'
    },
    verbose: {
      alias: 'v',
      type: 'boolean'
    },
    withinDistance: {
      type: 'string'
    }
  }
})

// TODO Make Country, State, and County mutually exclusive
// TODO Make input automatic based on file location
// TODO This is ugly. Make it better.

// WARNING: This doesn't work at the moment with the index.js file, because it is now a module. Damn.

async function run () {
  if (cli.input[0] === 'quad') {
    await main.quadBirds(cli.flags)
  } else if (cli.input[0] === 'towns') {
    await main.towns(cli.flags)
  } else if (cli.input[0] === 'regions') {
    await main.regions(cli.flags)
  } else if (cli.input[0] === 'counties') {
    await main.counties(cli.flags)
  } else if (cli.input[0] === 'winterFinch') {
    await main.winterFinch(cli.flags)
  } else if (cli.input[0] === 'rare') {
    await main.rare(cli.flags)
  } else if (cli.input[0] === 'big') {
    cli.flags.list = undefined
    let timespan = 'year'
    let biggest = await main.biggestTime(timespan, cli.flags)
    console.log(`Your biggest ${timespan} was ${biggest.Date} with ${biggest.SpeciesTotal} new species.`)
    timespan = 'month'
    biggest = await main.biggestTime(timespan, cli.flags)
    console.log(`Your biggest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM YYYY')} with ${biggest.SpeciesTotal} new species.`)
    timespan = 'day'
    biggest = await main.biggestTime(timespan, cli.flags)
    console.log(`Your biggest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM Do, YYYY')} with ${biggest.SpeciesTotal} new species.`)
  } else if (cli.input[0] === 'first') {
    cli.flags.list = undefined
    let timespan = 'year'
    let biggest = await main.firstTimes(timespan, cli.flags)
    console.log(`Your newest ${timespan} was ${biggest.Date} with ${biggest.SpeciesTotal} new species.`)
    timespan = 'month'
    biggest = await main.firstTimes(timespan, cli.flags)
    console.log(`Your newest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM YYYY')} with ${biggest.SpeciesTotal} new species.`)
    timespan = 'day'
    biggest = await main.firstTimes(timespan, cli.flags)
    console.log(`Your newest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM Do, YYYY')} with ${biggest.SpeciesTotal} new species.`)
  } else if (cli.input[0] === 'big-year') {
    const timespan = 'year'
    const biggest = await main.biggestTime(timespan, cli.flags)
    console.log(`Your biggest ${timespan} was ${biggest.Date} with ${biggest.SpeciesTotal} species.`)
    if (cli.flags.list) {
      console.log(`With these species: ${_.map(biggest.Species, 'Scientific Name').join(', ')}.`)
    }
  } else if (cli.input[0] === 'big-month') {
    const timespan = 'month'
    const biggest = await main.biggestTime(timespan, cli.flags)
    console.log(`Your biggest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM YYYY')} with ${biggest.SpeciesTotal} species.`)
    if (cli.flags.list) {
      console.log(`With these species: ${_.map(biggest.Species, 'Scientific Name').join(', ')}.`)
    }
  } else if (cli.input[0] === 'big-day') {
    const timespan = 'day'
    const biggest = await main.biggestTime(timespan, cli.flags)
    console.log(`Your biggest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM Do, YYYY')} with ${biggest.SpeciesTotal} species.`)
    if (cli.flags.list) {
      console.log(`With these species: ${_.map(biggest.Species, 'Scientific Name').join(', ')}.`)
    }
  } else if (cli.input[0] === 'first-year') {
    const timespan = 'year'
    const biggest = await main.firstTimes(timespan, cli.flags)
    console.log(`Your newest ${timespan} was ${biggest.Date} with ${biggest.SpeciesTotal} new species.`)
    if (cli.flags.list) {
      console.log(`With these species: ${_.map(biggest.Species, 'Scientific Name').join(', ')}.`)
    }
  } else if (cli.input[0] === 'first-month') {
    const timespan = 'month'
    const biggest = await main.firstTimes(timespan, cli.flags)
    console.log(`Your newest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM YYYY')} with ${biggest.SpeciesTotal} new species.`)
    if (cli.flags.list) {
      console.log(`With these species: ${_.map(biggest.Species, 'Scientific Name').join(', ')}.`)
    }
  } else if (cli.input[0] === 'first-day') {
    const timespan = 'day'
    const biggest = await main.firstTimes(timespan, cli.flags)
    console.log(`Your newest ${timespan} was ${moment(biggest.Date, 'YYYY-MM-DD').format('MMMM Do, YYYY')} with ${biggest.SpeciesTotal} new species.`)
    if (cli.flags.list) {
      console.log(`With these species: ${_.map(biggest.Species, 'Scientific Name').join(', ')}.`)
    }
  } else if (cli.input[0] === 'withinDistance') {
    await main.withinDistance({ coordinates: [-72.5766799, 44.2581012], input: 'MyEBirdData.csv' })
  } else if (cli.input[0] === 251) {
    await main.vt251(cli.flags.input)
  } else if (cli.input[0] === 'subspecies') {
    await main.subspecies(cli.flags)
  } else if (cli.input[0] === 'checklists') {
    await main.checklists(cli.flags)
  } else if (cli.input[0] === 'getLastDate') {
    await main.getLastDate(cli.flags)
  } else if (cli.input[0] === 'countTheBirds') {
    await main.countTheBirds(cli.flags)
  } else if (cli.input[0] === 'townHotspots') {
    await hotspots.townHotspots(cli.flags)
  } else if (cli.input[0] === 'unbirdedHotspots') {
    await hotspots.unbirdedHotspots(cli.flags)
  } else if (cli.input[0] === 'csvToJsonHotspots') {
    await hotspots.csvToJsonHotspots(cli.flags)
  } else if (cli.input[0] === 'daysYouveBirdedAtHotspot') {
    await hotspots.daysYouveBirdedAtHotspot(cli.flags)
  } else if (cli.input[0] === 'weeksYouveBirdedAtHotspot') {
    await hotspots.weeksYouveBirdedAtHotspot(cli.flags)
  } else if (cli.input[0] === 'findMontpelierHotspotNeedsToday') {
    await hotspots.findMontpelierHotspotNeedsToday(cli.flags)
  } else if (cli.input[0] === 'datesSpeciesObserved') {
    await main.datesSpeciesObserved(cli.flags)
  } else if (cli.input[0] === 'daylistTargets') {
    await main.daylistTargets(cli.flags)
  } else if (cli.input[0] === 'issr') {
    await main.isSpeciesSightingRare(cli.flags)
  } else {
    console.log(cli.showHelp())
  }
}

run()
