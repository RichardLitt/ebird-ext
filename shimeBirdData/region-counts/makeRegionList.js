// This just makes a list from the console log output of joinRegionJson.js.
// Not a great way to do it, but it's where I am at right now, so whatever.

const fs = require('fs').promises
const Papa = require('papaparse')

const regions = [
  'Champlain Hills',
  'Champlain Valley',
  'Northeastern Highlands',
  'Northern Green Mountains',
  'Northern Vermont Piedmont',
  'Southern Green Mountains',
  'Southern Vermont Piedmont',
  'Taconic Mountains',
  'Vermont Valley'
]

async function getData (input) {
  if (fs) {
    input = await fs.readFile(input, 'utf8')
    input = Papa.parse(input, { header: true })
    return input.data
  }
}

async function runFile () {
  const result = await getData('150 Region Counts.csv')
  regions.forEach(region => {
    const observerList = {}
    let highcount = 150
    let highcountObserver, highcountYear
    const regionList = result.filter(d => {
      return d.Region === region
    })
    regionList.forEach(entry => {
      if (!observerList[entry.Observer]) {
        observerList[entry.Observer] = [entry.Year]
      } else {
        observerList[entry.Observer].push(entry.Year)
      }

      if (entry.Total > highcount) {
        highcount = entry.Total
        highcountObserver = entry.Observer
        highcountYear = entry.Year
      }
    })

    console.log()
    console.log(`Region: ${region}.`)
    console.log(`Highest count: ${highcountObserver} with ${highcount} bird species in ${highcountYear}.`)
    console.log()
    Object.keys(observerList).forEach(o => {
      console.log(o, `- ${observerList[o][0]} (${observerList[o].length} year${(observerList[o].length === 1) ? '' : 's'})`)
    })
    console.log()
    console.log('-----')
  })
}

runFile()
