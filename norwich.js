#!/usr/bin/env node
'use strict'

const meow = require('meow')
const main = require('./index')
const _ = require('lodash')
const helpers = require('./helpers')
const fs = require('fs').promises
const hotspots = require('./hotspots')

const cli = meow(`
  Usage
    $ node cli.js <input> [opts]

  Arguments
    norwich       Output for the Norwich quest

  Options
    --input, -i The input file
    --year      Limit results to a given year
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

async function getNorwichHotspots () {
  let data = await hotspots.hotspotsForTown({ town: 'Norwich'})
  let norwichHotspots = {}
  data.forEach(x => {
      norwichHotspots[x.locId] = x.locName
  })
  return norwichHotspots
}

// Only usefulf for the Norwich County Quest account
async function norwich(input) {
  const opts = {
    year: 2022,
    state: 'Vermont',
    town: 'Norwich',
    all: false,
    complete: false,
    // output: `data/vt_town_counts.json`,
    input
  }
  const dateFormat = helpers.parseDateFormat('day')
  let data = main.orderByDate(main.durationFilter(main.completeChecklistFilter(main.dateFilter(main.locationFilter(await main.getData(opts.input), opts), opts), opts), opts), opts)
  data = main.countUniqueSpecies(data.filter(x => x.Town === opts.town.toUpperCase()), dateFormat)

  if (opts.output) {
    fs.writeFile(`${opts.output.toString().replace('.json', '')}.json`, JSON.stringify(data), 'utf8')
  }

  function isEven(n) { return n % 2 === 0 }

  let norwichHotspots = await getNorwichHotspots()

  let str = ''
  let i = 1
  _.sortBy(main.createPeriodArray(data), 'Date').forEach((e) => {
    e.Species.forEach((checklist) => {
      let location = (norwichHotspots[checklist['Location ID']]) ?
        `<a href="https://ebird.org/vt/hotspot/${checklist['Location ID']}">${checklist.Location}</a>`
        : checklist.Location
      let newStr = `<tr class="row-${i+1} ${(isEven(i+1) ? 'even' : 'odd')}">
  <td class="column-1">${i}</td>
  <td class="column-2">${checklist['Common Name']}</td>
  <td class="column-3">${location}</td>
  <td class="column-4"><a href="https://ebird.org/vt/checklist/${checklist['Submission ID']}">${e.Date}</a></td>
</tr>`
      str += newStr
      i++
    })
  })
  console.log(str)
}

async function run () {
  await norwich(cli.flags.input)
}

run()
