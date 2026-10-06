#!/usr/bin/env node

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import main from './index.js'
import * as hotspots from './hotspots.js'
import * as reports from './reports.js'
import _ from 'lodash'
import { format, parseISO } from 'date-fns'

// TODO Make Country, State, and County mutually exclusive
// TODO Make input automatic based on file location

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

// How each timespan's Date reads in a sentence
const PERIOD_NAMES = {
  year: date => date,
  month: date => format(parseISO(date), 'MMMM yyyy'),
  day: date => format(parseISO(date), 'MMMM do, yyyy')
}

// big-year, first-day and so on: one timespan, with the species if --list
function oneTimespan (fn, timespan, verb, noun) {
  return async flags => {
    const result = await fn(timespan, flags)
    console.log(`Your ${verb} ${timespan} was ${PERIOD_NAMES[timespan](result.Date)} with ${result.SpeciesTotal} ${noun}.`)
    if (flags.list) {
      console.log(`With these species: ${_.map(result.Species, 'Scientific Name').join(', ')}.`)
    }
  }
}

// big and first: every timespan, without the species
function everyTimespan (fn, verb) {
  return async flags => {
    for (const timespan of ['year', 'month', 'day']) {
      const result = await fn(timespan, { ...flags, list: undefined })
      console.log(`Your ${verb} ${timespan} was ${PERIOD_NAMES[timespan](result.Date)} with ${result.SpeciesTotal} new species.`)
    }
  }
}

// Every command, in the order --help lists them. A command's flags are all
// the options given, so the library functions see flags this file doesn't
// declare, like --id or --sinceYear.
const COMMANDS = [
  {
    group: 'Your lists',
    name: 'big',
    describe: 'Your biggest year, month and day',
    run: everyTimespan(main.biggestTime, 'biggest')
  },
  {
    group: 'Your lists',
    name: 'big-year',
    describe: 'Your biggest year (--list for the species)',
    run: oneTimespan(main.biggestTime, 'year', 'biggest', 'species')
  },
  {
    group: 'Your lists',
    name: 'big-month',
    describe: 'Your biggest month (--list for the species)',
    run: oneTimespan(main.biggestTime, 'month', 'biggest', 'species')
  },
  {
    group: 'Your lists',
    name: 'big-day',
    describe: 'Your biggest day (--list for the species)',
    run: oneTimespan(main.biggestTime, 'day', 'biggest', 'species')
  },
  {
    group: 'Your lists',
    name: 'first',
    describe: 'The year, month and day with the most new species',
    run: everyTimespan(main.firstTimes, 'newest')
  },
  {
    group: 'Your lists',
    name: 'first-year',
    describe: 'The year with the most new species (--list for the species)',
    run: oneTimespan(main.firstTimes, 'year', 'newest', 'new species')
  },
  {
    group: 'Your lists',
    name: 'first-month',
    describe: 'The month with the most new species (--list for the species)',
    run: oneTimespan(main.firstTimes, 'month', 'newest', 'new species')
  },
  {
    group: 'Your lists',
    name: 'first-day',
    describe: 'The day with the most new species (--list for the species)',
    run: oneTimespan(main.firstTimes, 'day', 'newest', 'new species')
  },
  {
    group: 'Your lists',
    name: 'quad',
    describe: "Species you've seen, photographed and recorded. Give both\nMyEBirdData.csv and Macaulay Library export CSVs",
    run: async flags => print(reports.quadReport(await main.quadBirds(flags), flags))
  },
  {
    group: 'Your lists',
    name: 'subspecies',
    describe: 'Subspecies, spuhs, slashes, hybrids and other leaf nodes',
    run: async flags => console.log(await main.subspecies(flags))
  },
  {
    group: 'Your lists',
    name: 'countTheBirds',
    describe: 'The total of all individual birds counted',
    run: async flags => console.log(await main.countTheBirds(flags))
  },
  {
    group: 'Your lists',
    name: 'checklists',
    describe: 'Your checklists (with --year, --county, --complete, ...)',
    run: async flags => {
      const checklists = await main.checklists(flags)
      checklists.forEach(c => console.log(`${c.Date} ${c.Time || ''} | ${c.Location} | https://ebird.org/checklist/${c['Submission ID']}`))
      console.log(`${checklists.length} checklists.`)
    }
  },
  {
    group: 'Vermont',
    name: 'towns',
    describe: "Species per town. --town=<name> lists one town's species",
    run: async flags => {
      if (flags.town) {
        print(reports.townReport(await main.towns(flags), flags.town))
      } else {
        printAreaTotals(await main.towns({ ...flags, all: true }))
      }
    }
  },
  {
    group: 'Vermont',
    name: 'regions',
    describe: 'Species per biophysical region',
    run: async flags => printAreaTotals(await main.regions(flags))
  },
  {
    group: 'Vermont',
    name: 'counties',
    describe: 'Species per county. --county=<name> for one county',
    run: async flags => {
      const result = await main.counties(flags)
      if (flags.county) {
        console.log(result)
      } else {
        printAreaTotals(result)
        if (flags.ticks) console.log(reports.countyTicks(result))
      }
    }
  },
  {
    group: 'Vermont',
    name: 'state',
    describe: 'Species in Vermont, by the date you first saw each',
    run: async flags => print(reports.stateReport(await main.state(flags)))
  },
  {
    group: 'Vermont',
    name: 'withinDistance',
    describe: 'Species within --distance miles (default 10) of\n--coordinates=<lat,lng> (default: Montpelier)',
    run: async flags => {
      // Default: Montpelier
      const coordinates = (flags.coordinates || '44.2581012,-72.5766799').split(',').map(Number)
      const distance = flags.distance ? Number(flags.distance) : 10
      const result = await main.radialSearch({ ...flags, coordinates, distance })
      console.log(`${result.speciesTotal} species within ${distance} miles of ${coordinates.join(', ')}${result.speciesTotal ? ': ' + result.species.join(', ') + '.' : '.'}`)
    }
  },
  {
    group: 'Vermont',
    name: 'rare',
    describe: 'Records to report to the Vermont Bird Records Committee.\nWith --year, includes earlier sightings last edited that year',
    run: async flags => {
      const output = await main.rare(flags)
      if (flags.slack) {
        const messages = main.splitSlackMessages(main.rareSlackReport(output, flags))
        messages.forEach((message, i) => {
          if (messages.length > 1) console.log(`${i ? '\n' : ''}----- Slack message ${i + 1} of ${messages.length} -----\n`)
          console.log(message)
        })
      } else {
        console.log(main.rareReport(output).join('\n'))
      }
    }
  },
  {
    group: 'Vermont',
    name: 'issr',
    describe: 'Is one sighting reportable? --species, --town and --date',
    run: async flags => console.log(main.rareReport(await main.isSpeciesSightingRare(flags)).join('\n'))
  },
  {
    group: 'Vermont',
    name: 'datesSpeciesObserved',
    describe: "The 20 species you've seen on the most days of the year",
    run: async flags => console.log(await main.datesSpeciesObserved(flags))
  },
  {
    group: 'Vermont',
    name: 'daylistTargets',
    describe: "Species you've never seen in Vermont on today's date",
    run: async flags => print(await main.daylistTargets({ ...flags, today: true }))
  },
  {
    group: 'Vermont',
    name: '251',
    describe: 'Project 251 town lists for --year (default: this year)',
    run: flags => main.vt251(flags.input, { year: flags.year && Number(flags.year), output: flags.output, release: flags.release })
  },
  {
    group: 'Vermont',
    name: 'getLastDate',
    describe: "Today's date, formatted for the Project 251 page",
    run: async flags => console.log(await main.getLastDate(flags))
  },
  {
    group: 'Hotspots',
    name: 'townHotspots',
    describe: 'Hotspots in a --town',
    run: async flags => {
      const result = await hotspots.townHotspots(flags)
      if (flags.noVisits && flags.print) {
        print(reports.unvisitedHotspotsByTown(result, hotspots.allTowns()))
      } else if (flags.all) {
        print(reports.townHotspotCounts(result, hotspots.allTowns()))
      } else {
        console.log(result)
      }
    }
  },
  {
    group: 'Hotspots',
    name: 'unbirdedHotspots',
    describe: "Hotspots you've never birded (--input), or not this\nyear (--currentYear) or since a year (--sinceYear)",
    run: async flags => console.log((await hotspots.unbirdedHotspots(flags)).map(x => `${x.Name}, ${x['Last visited']}`))
  },
  {
    group: 'Hotspots',
    name: 'weeksYouveBirdedAtHotspot',
    describe: "Weeks of the year you haven't birded --id",
    run: async flags => print(reports.weeksReport(await hotspots.weeksYouveBirdedAtHotspot(flags)))
  },
  {
    group: 'Hotspots',
    name: 'csvToJsonHotspots',
    describe: 'Rebuild data/hotspots.json from --input (used by\nscripts/updateHotspots.sh)',
    run: flags => hotspots.csvToJsonHotspots(flags)
  }
]

const OPTIONS = {
  input: { type: 'string', alias: 'i', describe: 'The input file, or several separated by commas' },
  country: { type: 'string', describe: 'Only records in this country' },
  state: { type: 'string', describe: 'Only records in this state' },
  county: { type: 'string', describe: 'Only records in this county' },
  town: { type: 'string', describe: 'Only records in this Vermont town' },
  region: { type: 'string', describe: 'Only records in this Vermont biophysical region' },
  year: { type: 'string', describe: 'Only records from this year' },
  after: { type: 'string', describe: 'Only records after this date' },
  complete: { type: 'boolean', describe: 'Only complete checklists' },
  list: { type: 'boolean', alias: 'l', describe: 'List the species' },
  output: { type: 'string', describe: 'Also write the result to this JSON file' },
  slack: { type: 'boolean', describe: 'With rare: group by county, formatted as Slack messages' },
  verbose: { type: 'boolean', alias: 'v', describe: 'Adds extra logging' },
  coordinates: { type: 'string', hidden: true },
  distance: { type: 'string', hidden: true }
}

// Lines of a name-and-description list, with descriptions in one column
function columns (rows, minWidth) {
  const width = Math.max(minWidth, ...rows.map(([name]) => name.length + 1))
  return rows.flatMap(([name, describe]) => describe.split('\n').map((line, i) => `    ${(i ? '' : name).padEnd(width)}${line}`))
}

function helpText () {
  const commands = Object.entries(_.groupBy(COMMANDS, 'group'))
    .map(([group, list]) => [`  ${group}`, ...columns(list.map(c => [c.name, c.describe]), 14)].join('\n'))
  const options = columns(Object.entries(OPTIONS)
    .filter(([, option]) => !option.hidden)
    .map(([name, option]) => [`--${name}${option.alias ? `, -${option.alias}` : ''}`, option.describe]), 14)
  return `
  Usage
    $ node cli.js <command> --input=<file> [options]

  --input is a MyEBirdData.csv export (https://ebird.org/downloadMyData) or an
  eBird Basic Dataset file (ebd_*.txt). Several files can be given, separated
  by commas. See the README for each command's output.

${commands.join('\n\n')}

  Options
${options.join('\n')}

  Examples
    $ node cli.js big-day --input=MyEBirdData.csv --list
    $ node cli.js towns --input=MyEBirdData.csv --town=Montpelier
    $ node cli.js rare --input=ebd_US-VT-001_202601_202612.txt --county=Addison --year=2026
    $ node cli.js rare --input=ebd_US-VT_relAug-2026.txt,ebd_US-VT_relAug-2026_unvetted.txt --year=2026 --slack`
}

// The parsed options, as the library functions take them
const flagsOf = argv => _.omit(argv, ['_', '$0'])

function showHelp () {
  console.log(helpText())
}

const cli = yargs(hideBin(process.argv))
  // Like meow: values stay strings, and each flag appears once, camelCased
  .parserConfiguration({ 'parse-numbers': false, 'parse-positional-numbers': false, 'strip-aliased': true, 'strip-dashed': true })
  .options(OPTIONS)
  .help(false)
  .fail(false)
  .middleware(argv => {
    if (argv.help) {
      showHelp()
      process.exit(0)
    }
  })

COMMANDS.forEach(command => cli.command(command.name, command.describe, {}, argv => command.run(flagsOf(argv))))
// No command, or one this file doesn't know
cli.command('$0', false, {}, () => {
  showHelp()
  process.exitCode = 2
})

cli.parseAsync().catch(error => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
