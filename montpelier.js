const fetch = require('node-fetch')
const VermontHotspots = require('./data/hotspots.json')
// const eBirdDataAsJSON = require('./data/washCoHotspotObservations.json')
// TODO Implement this, instead
const hotspotDates = require('./data/hotspotsDates.json')
const _ = require('lodash')
const moment = require('moment')
const difference = require('compare-latlong')
const f = require('./filters')
const fs = require('fs')

const eBirdApiToken = 'a6ebaopct2l3'

let opts = {}

const command = process.argv[2];

try {
  switch (command) {
    case 'daysYouveBirdedAtHotspot':
      if (!process.argv[3]) {
        throw new Error("Expected an argument after 'daysYouveBirdedAtHotspot'");
      }
      daysYouveBirdedAtHotspot(process.argv[3]);
      break;

    case 'shimFilterHotspotJSON':
      shimFilterHotspotJSON();
      break;

    case 'region':
      if (!process.argv[3]) {
        throw new Error("Expected a region code after 'region'");
      }
      opts = {
        regionCode: process.argv[3]
      };
      getIdsFromRegion(opts);
      break;

    case 'ids':
      opts = {
        miles: 10,
        lat: '44.2587866',
        lng: '-72.5740852'
        // Rebecca
        // lat: '44.1341227',
        // lng: '-72.5339384'
        // Ben
        // lat: '35.8040346',
        // lng: '-79.1351467'
      };
      getIdsFromRadius(opts);
      break;

    default:
      opts = {
        miles: 12,
        lat: '44.2587866',
        lng: '-72.5740852'
      };

      if (command && command.split(',').length === 2) {
        [opts.lat, opts.lng] = command.split(',');
      } else if (command) {
        throw new Error(`Unknown command: ${command}`);
      }

      findMontpelierHotspotNeedsToday(opts);
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
}


/* I needed to make this because I made a massive JSON file of all observations in every hotspot,
which was too much for this scripts memory to handle. Instead, this is a much smaller output that 
should cover all of the dates purposes here.

Turn this on when you use it. Note: I didn't create washingtonHotspots.json this time, so I don't
know how or when I created it. So, the input for this is vague, which means it may need fixing when
you eventually decide to repopulate your hotspot information. The variable for it is just 'ebirdDataAsJSON',
which probably gives a hint in to how it was gotten. It looks like [[{"Submission ID": ..., ...}]] and so on - 
So, a massive array of arrays of single dictionary entries. Weird format.
*/
async function shimFilterHotspotJSON () {
  const data = eBirdDataAsJSON
  const hotspots = {}

  data
    // This may be causing some bugs below. 
    .filter(x => {
      const entry = f.completeChecklistFilter([x], { complete: true, noIncidental: true })
      if (entry[0]) {
        return true
      }
    })
    .map(entry => {
      return {
        Location: entry.Location,
        'Location ID': entry['Location ID'],
        Date: entry.Date
      }
    })
    .map(entry => {
      if (!hotspots[entry['Location ID']]) {
        hotspots[entry['Location ID']] = {
          Location: entry['Location'],
          'Dates Birded': {}
        }
        Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).forEach(key => { hotspots[entry['Location ID']]['Dates Birded'][key] = [] })
      }
      const [month, day] = entry.Date.split('-').slice(1)
      if (hotspots[entry['Location ID']]['Dates Birded'][month].indexOf(Number(day)) === -1) {
        hotspots[entry['Location ID']]['Dates Birded'][month].push(Number(day))
      }
    })

    fs.writeFile(`hotspotsDates.json`, JSON.stringify(hotspots), 'utf8', (err) => {
      if (err) {
        console.log(err)
      } else {
        console.log(`hotspotsDates.json written successfully.`)
      }
    })
}

async function getChecklist (checklistId) {
  // curl --location -g --request GET 'https://api.ebird.org/v2/product/checklist/view/{{subId}}' \
  let checklist = await fetch(`https://api.ebird.org/v2/product/checklist/view/${checklistId}`,
    { method: 'GET', headers: { 'X-eBirdApiToken': eBirdApiToken } })
  checklist = JSON.parse(await checklist.text())
  console.log(checklist)
}

// getChecklist('S121622621')

// L19107474

// ON HOLD - This entire function is on hold. On some weeks, it could ask for as many as 7*25*x hits to the db, which is likely too many.
// Sucks, because I want it to work.
// async function getRecentObs (id) {
//   // Minimum is one, which counts for today.
//   const daysToGet = moment().diff(moment().startOf('week'), 'days') + 1
//   const datesToGet = []
//   for (let step = 0; step < daysToGet; step++) {
//     datesToGet.push(moment().subtract(step, 'days'))
//   }

//   // Actually, should only happen once
//   // For each days to get, find the date, and get the chcklists for that date
//   // Add checklists to a giant list of checklists
//   // TODO Replace dummy data
//   const checklists = [] // require('./test.json')
//   // // console.log(`'https://api.ebird.org/v2/data/obs/KZ/recent?r=${tenIds.join(',')}&back=${daysToGet}`)

//   await datesToGet.forEach(async date => {
//     console.log(`https://api.ebird.org/v2/product/lists/${id}/${moment(date).format('YYYY')}/${moment(date).format('MM')}/${moment(date).format('DD')}`)
//     let recentChecklists = await fetch(`https://api.ebird.org/v2/product/lists/${id}/${moment(date).format('YYYY')}/${moment(date).format('MM')}/${moment(date).format('DD')}`,
//       { method: 'GET', headers: { 'X-eBirdApiToken': 'a6ebaopct2l3' } })
//     recentChecklists = JSON.parse(await recentChecklists.text())
//     // console.log(recentChecklists)
//     await recentChecklists.forEach(async checklist => {
//       checklist = await fetch(`https://api.ebird.org/v2/product/checklist/view/${checklist.subID}`,
//         { method: 'GET', headers: { 'X-eBirdApiToken': 'a6ebaopct2l3' } })
//       checklist = JSON.parse(await checklist.text())
//       console.log(checklist)
//       checklists.push(checklist)
//     })
//   })

//   const hotspotIdsWithCompleteChecklistsThisWeek = []

//   checklists.forEach(checklist => {
//     if (checklist.allObsReported) {
//       hotspotIdsWithCompleteChecklistsThisWeek.push(checklist.locId)
//     }
//   })
//   return hotspotIdsWithCompleteChecklistsThisWeek
// }


async function daysYouveBirdedAtHotspot (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  const name = (VermontHotspots.find(h => h.ID === opts.id)) ? VermontHotspots.find(h => h.ID === opts.id).Name : opts.id

  // Note - this assumes the location is a hotspot
  console.log(`
You have not birded in ${name} on:`)

  const data = eBirdDataAsJSON
  const observedDates = {}
  const fullYearChart = {}
  const unbirdedDates = {}

  // Create keys in observedDates for months
  Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).forEach(key => { observedDates[key] = [] })

  // Filter and add all days observed to the chart
  // EDIT: this breaks for personal locations
  data.filter(x => x['Location ID'] === opts.id)
    .forEach(x => {
      const [month, day] = x.Date.split('-').slice(1)
      if (observedDates[month].indexOf(Number(day)) === -1) {
        observedDates[month].push(Number(day))
      }
    })

  // Create a full year chart, and then find days that weren't in days observed
  Object.keys(observedDates).forEach(month => {
    fullYearChart[month.toString().padStart(2, '0')] = Array.from({ length: moment().month(month - 1).daysInMonth() }, (_, i) => i + 1)
    unbirdedDates[month] = _.difference(fullYearChart[month], observedDates[month].sort((a, b) => a - b))
  })

  // Print
  Object.keys(unbirdedDates).sort((a, b) => Number(a) - Number(b)).forEach(month => {
    console.log(`${moment().month(Number(month) - 1).format('MMMM')}: ${unbirdedDates[month].join(', ')}`)
  })
}

function dataForThisWeekInHistory (opts) {
  if (!opts.id) {
    console.log('Get the ID for this location first, manually. Send it as --id.')
  }

  const data = hotspotDates
  const observedWeeks = []
  const unbirdedDates = Array.from({ length: 52 }, (_, i) => i + 1)

  // Filter and add all days observed to the chart
  if (data[opts.id]) {
    Object.keys(data[opts.id]['Dates Birded'])
      .forEach(month => {
        data[opts.id]['Dates Birded'][month].forEach(date => {
          // Why Date uses a month index is totally beyond me.
          const dateString = new Date(moment().format('YYYY'), Number(month)-1, date)
          const week = moment(dateString).week()
          if (observedWeeks.indexOf(week) === -1) {
            observedWeeks.push(week)
          }
        })
      })
  }

  // console.log(data['L7487086'])
  
  // Last observations are almost certainly not in the downloaded db.
  // Note - latest observations can be incindental. I can't think of a way around this, except to get all of the checklists from a region
  const lastBirdedWeek = moment(opts.latestObsDt.split(' ')[0]).week()
  if (!observedWeeks.includes(lastBirdedWeek)) {
    observedWeeks.push(lastBirdedWeek)
  }

  const unbirdedWeeks = _.difference(unbirdedDates, observedWeeks.sort((a, b) => Number(a) - Number(b)))
  const coveragePercentage = (52 - unbirdedWeeks.length) / 52 * 100

  const obj = {
    nextUnbirdedWeek: '',
    coveragePercentage
  }
  // Returns next unbirded week
  if (unbirdedWeeks.length !== 0) {
    const nextWeek = unbirdedWeeks.filter(w => w >= moment().week())[0]
    if (moment().week() === nextWeek) {
      obj.nextUnbirdedWeek = 'No data'
    }
  }
  return obj // moment().startOf('year').week(nextWeek).startOf('week').format('YYYY-MM-DD')
}

async function getIdsFromRadius (opts) {
  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/geo?lat=${opts.lat}&lng=${opts.lng}&dist=${opts.miles}&fmt=json`)
  const body = JSON.parse(await response.text())

  
  // Get all of the IDs in the area, not just what is in your data.
  const ids = body.map(d => d.locId)

  ids.forEach(id => {
    console.log(id)
  })
}
async function getIdsFromRegion (opts) {
  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/${opts.regionCode}?fmt=json`)
  const body = JSON.parse(await response.text())

  // Get all of the IDs in the area, not just what is in your data.
  const ids = body.map(d => d.locId)

  ids.forEach(id => {
    console.log(id)
  })
}

/*
  A really useful function that won't be useful for anyone else - given the local
  hotspots in my area, which ones should I go to today to maximally fill out
  those hotspots?
*/

async function findMontpelierHotspotNeedsToday(opts) {
  const hotspotDatesData = hotspotDates;
  const today = moment().format('MM-DD');
  const month = moment().format('MM');
  const todayDate = moment().format('DD');

  // Get data from eBird. Note that this still depends on a local hotspot dates file, which needs to be got from the database and then shimmed.
  const response = await fetch(`https://api.ebird.org/v2/ref/hotspot/geo?lat=${opts.lat}&lng=${opts.lng}&dist=${opts.miles}&fmt=json`, {
      method: 'GET', // HTTP method
      headers: {
        'X-eBirdApiToken': eBirdApiToken // Include the token in the request headers
      }
  })
  const body = JSON.parse(await response.text())

  async function fetchHotspotsFromEBird() {
      const url = `https://api.ebird.org/v2/ref/hotspot/geo?lat=${opts.lat}&lng=${opts.lng}&dist=${opts.miles}&fmt=json`
      const response = await fetch(url, { method: 'GET', headers: { 'X-eBirdApiToken': 'a6ebaopct2l3' } });
      return JSON.parse(await response.text());
  }

  function filterBirdedHotspots(data, ids) {
      return ids.filter(id => {
          return data[id] && data[id]['Dates Birded'][month].includes(Number(todayDate));
      });
  }

  async function getLocationIdsForToday() {
      const url = 'https://api.ebird.org/v2/product/lists/US-VT-023?maxResults=50';
      const response = await fetch(url, { method: 'GET', headers: { 'X-eBirdApiToken': 'a6ebaopct2l3' } });
      const data = await response.json();

      // // Make a list of IDs of birded hotspots today
      // const birded = []
      // ids.forEach(id => {
      //   if (data[id] && data[id]['Dates Birded'][month]) {
      //     if (data[id]['Dates Birded'][month].includes(Number(todayDate)) && !birded.includes(id)) {
      //       birded.push(id)
      //     }
      //   }
      // })

      const formattedToday = new Date(new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
      }).format(new Date())).toISOString().split('T')[0];

      return data.filter(item => item.isoObsDate.startsWith(formattedToday)).map(item => item.locId);
  }

  async function computeUnbirded(ids, birded) {
      const birdedRecently = await getLocationIdsForToday();
      return ids.filter(x => !birded.includes(x) && !birdedRecently.includes(x));
  }

  function cleanUpAndPrintHotspots(body, unbirdedToday) {
      // Assuming your logic for cleaning up and printing the hotspots remains the same
      body
          .map((d) => {
              d.distance = difference.distance(opts.lat, opts.lng, d.lat, d.lng, 'M');
              const data = dataForThisWeekInHistory({ id: d.locId, latestObsDt: d.latestObsDt });
              d.nextUnbirdedWeek = data.nextUnbirdedWeek;
              d.coveragePercentage = data.coveragePercentage;
              return d;
          })
          .filter(d => unbirdedToday.includes(d.locId))
          .filter(d => d.distance < opts.miles)
          .sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance))
          .forEach(async d => {
              d.locName = d.locName
                  .replace('(Restricted Access)', '')
                  .replace('Cross Vermont Trail--', '')
                  .replace(' - East Montpelier', '')
                  .replace('-East Montpelier', '')
                  .replace(' - Berlin', '')
                  .replace(/\(\d+ acres\)/i, '')
                  .trim();
              console.log(`${d.latestObsDt.split(' ')[0]}  ${(d.nextUnbirdedWeek) ? d.nextUnbirdedWeek.padEnd(8) : ''.padEnd(8)} ${(d.locName + ' (' + Math.round(d.coveragePercentage) + '%)').padEnd(42)} https://ebird.org/hotspot/${d.locId} `);
          });
  }

  // function hasBerlinPondBeenBirdedThisWeek(body) {
  //     const lastDate = body.find(d => d.locId === 'L150998').latestObsDt.split(' ')[0];
  //     return moment(lastDate).week() >= moment().week() ? 'Yes' : 'No';
  // }

  // Main execution logic
  const body = await fetchHotspotsFromEBird();
  const ids = body.map(d => d.locId);
  const birded = filterBirdedHotspots(hotspotDatesData, ids);
  const unbirdedToday = await computeUnbirded(ids, birded);

  printHotspotsHeader()
  cleanUpAndPrintHotspots(body, unbirdedToday)


// Was Berlin Pond birded this week, this year: ${hasBerlinPondBeenBirdedThisWeek(body)}.
  console.log(`

How does this script work? It uses a list of all of the Hotspots in Montpelier and checks to see what dates they 
were all birded, by checking the eBird API. Coverage shows the percent of weeks which have had checklists submi-
tted on them, meaning that if a hotspot has had checklists in any year in all 52 weeks, it is at 100%.

For more infomation, see https://github.com/RichardLitt/ebird-ext/.
`)

  function printHotspotsHeader() {
      console.log('\nThese hotspots have not had a complete checklist submitted on this date:');
      console.log(`Last             Cover      ${'Hotspot (Coverage)'.padEnd(50)}`);
      console.log(`${'-----'.padEnd(72, '-')}`);
  }
}
