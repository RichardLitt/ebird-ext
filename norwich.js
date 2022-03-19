#!/usr/bin/env node

const meow = require('meow')
const _ = require('lodash')
const fs = require('fs').promises
const moment = require('moment')
const main = require('./index')
const helpers = require('./helpers')
const hotspots = require('./hotspots')
const f = require('./filters')

const cli = meow(`
  Usage
    $ node cli.js --input=<input> [opts]

  Arguments
    norwich       Output for the Norwich quest

  Options
    --all       Only use checklists that counted all species
    --complete  Filter by complete checklists only
    --input, -i The input file
    --year      Limit results to a given year
    --town      Select which town to make the table for

  Examples
    $ node cli.js
`, {
  flags: {
    input: {
      type: 'string',
      alias: 'i'
    },
    year: {
      type: 'string'
    },
    all: {
      type: 'boolean',
      alias: 'a'
    },
    complete: {
      type: 'boolean',
      alias: 'c'
    },
    town: {
      type: 'string',
      alias: 't'
    }
  }
})

async function getNorwichHotspots () {
  const data = await hotspots.hotspotsForTown({ town: 'Norwich' })
  const norwichHotspots = {}
  data.forEach(x => {
    norwichHotspots[x.locId] = x.locName
  })
  return norwichHotspots
}

// Only usefulf for the Norwich County Quest account
async function norwich (opts) {
  Object.assign(opts, {
    year: opts.year || moment().format('YYYY'),
    state: 'Vermont',
    town: opts.town || 'Norwich',
    all: opts.all || false,
    complete: opts.complete || false
    // output: `data/vt_town_counts.json`,
  })
  const dateFormat = helpers.parseDateFormat('day')
  let data = f.orderByDate(
    f.durationFilter(
      f.completeChecklistFilter(
        f.dateFilter(
          f.locationFilter(
            await main.getData(opts.input), opts), opts), opts), opts), opts)
  data = main.countUniqueSpecies(data.filter(x => x.Town === opts.town.toUpperCase()), dateFormat)

  if (opts.output) {
    fs.writeFile(`${opts.output.toString().replace('.json', '')}.json`, JSON.stringify(data), 'utf8')
  }

  function isEven (n) { return n % 2 === 0 }

  const norwichHotspots = await getNorwichHotspots()

  let str = ''
  let i = 1
  const checklistIds = new Set()
  _.sortBy(f.createPeriodArray(data), 'Date').forEach((e) => {
    e.Species.forEach((checklist) => {
      const location = (norwichHotspots[checklist['Location ID']])
        ? `<a href="https://ebird.org/vt/hotspot/${checklist['Location ID']}">${checklist.Location}</a>`
        : checklist.Location
      const newStr = `<tr class="row-${i + 1} ${(isEven(i + 1) ? 'even' : 'odd')}">
  <td class="column-1">${i}</td>
  <td class="column-2">${checklist['Common Name']}</td>
  <td class="column-3">${location}</td>
  <td class="column-4"><a href="https://ebird.org/vt/checklist/${checklist['Submission ID']}">${e.Date}</a></td>
</tr>`
      str += newStr
      checklistIds.add(checklist['Submission ID'])
      i++
    })
  })
  console.log(`Total amount of checklists: ${checklistIds.size}`)
  console.log()
  console.log(str)
}

async function run () {
  await norwich(cli.flags)
}

run()
