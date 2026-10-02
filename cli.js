#!/usr/bin/env node

import meow from 'meow'
import main from './index.js'
import * as hotspots from './hotspots.js'
import * as reports from './reports.js'
import _ from 'lodash'
import moment from 'moment'

const cli = meow(`
  Usage
    $ node cli.js <command> --input=<file> [options]

  --input is a MyEBirdData.csv export (https://ebird.org/downloadMyData) or an
  eBird Basic Dataset file (ebd_*.txt). Several files can be given, separated
  by commas. See the README for each command's output.

  Your lists
    big           Your biggest year, month and day
    big-year      Your biggest year (--list for the species)
    big-month     Your biggest month (--list for the species)
    big-day       Your biggest day (--list for the species)
    first         The year, month and day with the most new species
    first-year    The year with the most new species (--list for the species)
    first-month   The month with the most new species (--list for the species)
    first-day     The day with the most new species (--list for the species)
    quad          Species you've seen, photographed and recorded. Give both
                  MyEBirdData.csv and Macaulay Library export CSVs
    subspecies    Subspecies, spuhs, slashes, hybrids and other leaf nodes
    countTheBirds The total of all individual birds counted
    checklists    Your checklists (with --year, --county, --complete, ...)

  Vermont
    towns         Species per town. --town=<name> lists one town's species
    regions       Species per biophysical region
    counties      Species per county. --county=<name> for one county
    state         Species in Vermont, by the date you first saw each
    withinDistance Species within --distance miles (default 10) of
                  --coordinates=<lat,lng> (default: Montpelier)
    rare          Records to report to the Vermont Bird Records Committee.
                  With --year, includes earlier sightings last edited that year
    issr          Is one sighting reportable? --species, --town and --date
    datesSpeciesObserved  The 20 species you've seen on the most days of the year
    daylistTargets        Species you've never seen in Vermont on today's date
    251           Project 251 town lists for --year (default: this year)
    getLastDate   Today's date, formatted for the Project 251 page

  Hotspots
    townHotspots          Hotspots in a --town
    unbirdedHotspots      Hotspots you've never birded (--input), or not this
                          year (--currentYear) or since a year (--sinceYear)
    weeksYouveBirdedAtHotspot  Weeks of the year you haven't birded --id
    csvToJsonHotspots     Rebuild data/hotspots.json from --input (used by
                          scripts/updateHotspots.sh)

  Options
    --input, -i   The input file, or several separated by commas
    --country     Only records in this country
    --state       Only records in this state
    --county      Only records in this county
    --town        Only records in this Vermont town
    --region      Only records in this Vermont biophysical region
    --year        Only records from this year
    --after       Only records after this date
    --complete    Only complete checklists
    --list, -l    List the species
    --output      Also write the result to this JSON file
    --slack       With rare: group by county, formatted as Slack messages
    --verbose     Adds extra logging

  Examples
    $ node cli.js big-day --input=MyEBirdData.csv --list
    $ node cli.js towns --input=MyEBirdData.csv --town=Montpelier
    $ node cli.js rare --input=ebd_US-VT-001_202601_202612.txt --county=Addison --year=2026
    $ node cli.js rare --input=ebd_US-VT_relAug-2026.txt,ebd_US-VT_relAug-2026_unvetted.txt --year=2026 --slack
`, {
  importMeta: import.meta,
  flags: {
    input: {
      type: 'string',
      shortFlag: 'i'
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
      shortFlag: 'l'
    },
    towns: {
      type: 'string'
    },
    regions: {
      type: 'string'
    },
    verbose: {
      shortFlag: 'v',
      type: 'boolean'
    },
    slack: {
      type: 'boolean'
    },
    coordinates: {
      type: 'string'
    },
    distance: {
      type: 'string'
    }
  }
})

// TODO Make Country, State, and County mutually exclusive
// TODO Make input automatic based on file location
// TODO This is ugly. Make it better.

function print (lines) {
  lines.forEach(line => console.log(line))
}

// One line per area with any species, most species first
function printAreaTotals (areas) {
  Object.entries(areas)
    .map(([name, area]) => [name, Array.isArray(area) ? area.length : area.speciesTotal])
    .filter(([, total]) => total)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([name, total]) => console.log(`${name}: ${total}`))
}

async function run () {
  if (cli.input[0] === 'quad') {
    print(reports.quadReport(await main.quadBirds(cli.flags), cli.flags))
  } else if (cli.input[0] === 'towns') {
    if (cli.flags.town) {
      print(reports.townReport(await main.towns(cli.flags), cli.flags.town))
    } else {
      printAreaTotals(await main.towns({ ...cli.flags, all: true }))
    }
  } else if (cli.input[0] === 'regions') {
    printAreaTotals(await main.regions(cli.flags))
  } else if (cli.input[0] === 'counties') {
    const result = await main.counties(cli.flags)
    if (cli.flags.county) {
      console.log(result)
    } else {
      printAreaTotals(result)
      if (cli.flags.ticks) console.log(reports.countyTicks(result))
    }
  } else if (cli.input[0] === 'state') {
    print(reports.stateReport(await main.state(cli.flags)))
  } else if (cli.input[0] === 'rare') {
    const output = await main.rare(cli.flags)
    if (cli.flags.slack) {
      const messages = main.splitSlackMessages(main.rareSlackReport(output, cli.flags))
      messages.forEach((message, i) => {
        if (messages.length > 1) console.log(`${i ? '\n' : ''}----- Slack message ${i + 1} of ${messages.length} -----\n`)
        console.log(message)
      })
    } else {
      console.log(main.rareReport(output).join('\n'))
    }
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
    // Default: Montpelier
    const coordinates = (cli.flags.coordinates || '44.2581012,-72.5766799').split(',').map(Number)
    const distance = cli.flags.distance ? Number(cli.flags.distance) : 10
    const result = await main.radialSearch({ ...cli.flags, coordinates, distance })
    console.log(`${result.speciesTotal} species within ${distance} miles of ${coordinates.join(', ')}${result.speciesTotal ? ': ' + result.species.join(', ') + '.' : '.'}`)
  } else if (cli.input[0] === '251') {
    await main.vt251(cli.flags.input, { year: cli.flags.year && Number(cli.flags.year), output: cli.flags.output, release: cli.flags.release })
  } else if (cli.input[0] === 'subspecies') {
    console.log(await main.subspecies(cli.flags))
  } else if (cli.input[0] === 'checklists') {
    const checklists = await main.checklists(cli.flags)
    checklists.forEach(c => console.log(`${c.Date} ${c.Time || ''} | ${c.Location} | https://ebird.org/checklist/${c['Submission ID']}`))
    console.log(`${checklists.length} checklists.`)
  } else if (cli.input[0] === 'getLastDate') {
    console.log(await main.getLastDate(cli.flags))
  } else if (cli.input[0] === 'countTheBirds') {
    console.log(await main.countTheBirds(cli.flags))
  } else if (cli.input[0] === 'townHotspots') {
    const result = await hotspots.townHotspots(cli.flags)
    if (cli.flags.noVisits && cli.flags.print) {
      print(reports.unvisitedHotspotsByTown(result, hotspots.allTowns()))
    } else if (cli.flags.all) {
      print(reports.townHotspotCounts(result, hotspots.allTowns()))
    } else {
      console.log(result)
    }
  } else if (cli.input[0] === 'unbirdedHotspots') {
    console.log((await hotspots.unbirdedHotspots(cli.flags)).map(x => `${x.Name}, ${x['Last visited']}`))
  } else if (cli.input[0] === 'csvToJsonHotspots') {
    await hotspots.csvToJsonHotspots(cli.flags)
  } else if (cli.input[0] === 'weeksYouveBirdedAtHotspot') {
    print(reports.weeksReport(await hotspots.weeksYouveBirdedAtHotspot(cli.flags)))
  } else if (cli.input[0] === 'datesSpeciesObserved') {
    console.log(await main.datesSpeciesObserved(cli.flags))
  } else if (cli.input[0] === 'daylistTargets') {
    print(await main.daylistTargets({ ...cli.flags, today: true }))
  } else if (cli.input[0] === 'issr') {
    const output = await main.isSpeciesSightingRare(cli.flags)
    console.log(main.rareReport(output).join('\n'))
  } else {
    console.log(cli.showHelp())
  }
}

run().catch(error => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
