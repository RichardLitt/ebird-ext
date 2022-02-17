// This is a helper library for checking expected dates for VBRC

const moment = require('moment')
const wom = require('moment-weekofmonth')

// const test = [
//   {
//     "Species": "Fulvous Whistling-Duck",
//     "Scientific Name": "Dendrocygna bicolor",
//     "Status": "",
//     "Breeding": "",
//     "Reporting": "V",
//     "Occurrence": ""
//   },
//   {
//     "Species": "Snow Goose",
//     "Scientific Name": "Anser caerulescens",
//     "Status": "",
//     "Breeding": "",
//     "Reporting": "",
//     "Occurrence": "3A-5C, 9A-1D"
//   },
//   {
//     "Species": "Ross's Goose",
//     "Scientific Name": "Anser rossii",
//     "Status": "",
//     "Breeding": "",
//     "Reporting": "",
//     "Occurrence": "3C-4A, 10A-11D"
//   },
//   {
//     "Species": "Greater White-fronted Goose",
//     "Scientific Name": "Anser albifrons",
//     "Status": "",
//     "Breeding": "",
//     "Reporting": "",
//     "Occurrence": "10B-5B"
//   },
//   {
//     "Species": "Wood Duck",
//     "Scientific Name": "Aix sponsa",
//     "Status": "",
//     "Breeding": "*",
//     "Reporting": "",
//     "Occurrence": "3A-12C+"
//   },
//   {
//     "Species": "Northern Pintail",
//     "Scientific Name": "Anas acuta",
//     "Status": "",
//     "Breeding": "*",
//     "Reporting": "N",
//     "Occurrence": "1A-12D"
//   }
// ]

function getWeek (alphaStr) {
  switch (alphaStr) {
    case 'A':
      alphaStr = 1
      break
    case 'B':
      alphaStr = 2
      break
    case 'C':
      alphaStr = 3
      break
    case 'D':
      alphaStr = 4
      break
    case 'E':
      alphaStr = 6
      break
    default:
      alphaStr = 1
  }
  return alphaStr
}

function findFirstDayOfWeekInMonth (month, week) {
  let date = 1
  while (wom(month) !== week) {
    month = moment(month).date(date)
    date = date +1
  }
  return month
}

function findLastDayOfWeekInMonth (month, week) {
  let date = 1
  while (wom(month) !== week+1) {
    // WTF kind of bug is this?
    if (wom(month) === -47) {
      return month
    }
    month = moment(month).date(date)
    date = date +1
  }
  return month
}

function calculateTimespan(str) {
  function splitStringAlphanumerically(str) {
    return str.match(/[\d]+|[A-Z]+/g)
  }

  let weeks
  if (str.includes('-')) {
    weeks = str.split('-')
  } else {
    // For situations with a single week noted
    weeks = [str, str]
  }
  // Could probably be simplified
  let start = splitStringAlphanumerically(weeks[0])
  let startMonth = moment().month(start[0]-1).date(1)
  let startWeek = getWeek(start[1])
  let firstDay = findFirstDayOfWeekInMonth(startMonth, startWeek)
  let end = splitStringAlphanumerically(weeks[1])
  let endMonth = moment().month(end[0]-1).date(1)
  // For cases like 10B-5B, for winter date ranges
  if (end[0]-1 < start[0]-1) {
    endMonth.add(1, 'years')
  }
  let endWeek = getWeek(end[1])
  let lastDay = findLastDayOfWeekInMonth(endMonth, endWeek)
  // Leave one month on either side
  let earliestDate = moment(firstDay)
  if (moment(earliestDate).month() === 0) {
    earliestDate = moment(earliestDate).startOf('year')
  } else {
    earliestDate = moment(earliestDate).subtract(1, 'months').hour(0).minute(0).second(0)
  }
  let latestDate = moment(lastDay)
  if (moment(latestDate).month() === 11) {
    latestDate = moment(latestDate).endOf('year')
  } else {
    latestDate = moment(latestDate).add(1, 'months').hour(0).minute(0).second(0)
  }
  return [earliestDate, latestDate]
}

function getTimespans (occurrence) {
  let timespans = []
  if (occurrence && !occurrence.includes('+') && !(occurrence === '1A-12D')) {
    if (occurrence.includes(',')) {
      let splits = occurrence.split(', ')
      splits.forEach(timespan => timespans.push(calculateTimespan(timespan)))
    } else {
      timespans.push(calculateTimespan(occurrence))
    }
  }
  let carryOverTimespans = []
  if (timespans.length !== 0) {
    timespans.forEach(timespan => {
      if (moment(timespan[1]).year() !== moment().year()) {
        let newTimespan = [
          [timespan[0], moment().endOf('year')],
          [moment().startOf('year'), moment(timespan[1]).year(moment().year())]
        ]
        timespans.pop(timespan)
        carryOverTimespans.push(newTimespan)
      }
    })
  }

  return timespans.concat(carryOverTimespans.flat())
}

function appearsDuringExpectedDates(date, speciesRecord) {
  const timespans = getTimespans(speciesRecord)
  if (timespans.length !== 0) {
    let isInTimespan = timespans.map(x => {
      // IsBetween won't include entries on the date, so subtract a day and add a day
      let start = moment(x[0]).year(moment(date).year()).subtract(1, 'day'), end = moment(x[1]).year(moment(date).year()).add(1, 'day')
      return moment(date).isBetween(start, end)
    })
    return isInTimespan.some(x => x === true)
  } else {
    return true
  }
}

// console.log(test.map(x => appearsDuringExpectedDates('2020-07-03', x.Occurrence)))
module.exports = appearsDuringExpectedDates