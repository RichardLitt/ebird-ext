// This is a helper library for checking expected dates for VBRC

const moment = require('moment')
const weekOfMonth = require('moment-weekofmonth')

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
//   },
//   {
//     "Breeding": "*",
//     "Occurrence": "3B-12D",
//     "Reporting": "",
//     "Scientific Name": "Ardea herodias",
//     "Species": "Great Blue Heron",
//     "Status": ""
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
  while (weekOfMonth(month) !== week) {
    month = moment(month).date(date)
    date = date +1
  }
  return month
}

function findLastDayOfWeekInMonth (month, week) {
  let date = 1
  while (weekOfMonth(month) !== week+1) {
    // WTF kind of bug is this?
    if (weekOfMonth(month) === -47) {
      return month
    }
    month = moment(month).date(date)
    date = date +1
  }
  return month
}

function calculateTimespan(str, noPadding) {
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
  // Reminder: 11 is December. Zero-indexing.
  if (moment(latestDate).month() === 11) {
    latestDate = moment(latestDate).endOf('year')
  // No padding exists to offset December records for the January spillover weeks
  } else if (noPadding) {
    latestDate = moment(latestDate).hour(0).minute(0).second(0)
  } else {
    latestDate = moment(latestDate).add(1, 'months').hour(0).minute(0).second(0)
  }

  return [earliestDate, latestDate]
}


// Only used for spilling over December weeks into January
function findLetterAfterTwelve(inputString) {
  // Check if '12' exists in the string
  if (inputString.includes('12')) {
    // Use RegExp to find the occurrence of '12' followed by a letter
    const match = inputString.match(/12([a-zA-Z])/);
    if (match) {
      // If a match is found, it means '12' is followed by a letter.
      // The letter is captured in the first capture group of the RegExp.
      return match[1]; // return the letter that follows '12'
    }
    // If there's no letter following '12', you might want to return a default value or null
    return null;
  }

  // If '12' doesn't exist in the string at all, handle it as you see fit (e.g., return null or a default value)
  return null;
}

function getTimespans (occurrence) {
  let timespans = []
  if (occurrence && !occurrence.includes('+') && !(occurrence === '1A-12D')) {
    if (occurrence.includes('12')) {
      let januaryTimespan = `1A-1${findLetterAfterTwelve(occurrence)}`
      januaryTimespan = calculateTimespan(januaryTimespan, true)
      timespans.push(januaryTimespan)
    }
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
      // For some reason, need to subtract a day to to how isBetween works. No need to add a day.
      let start = moment(x[0]).year(moment(date).year()).subtract(1, 'day'), end = moment(x[1]).year(moment(date).year())
      return moment(date).isBetween(start, end)
    })
    return isInTimespan.some(x => x === true)
  } else {
    return true
  }
}

// test.map(x => {
//   console.log(x.Species, appearsDuringExpectedDates('2020-02-05', x.Occurrence))
// })
module.exports = appearsDuringExpectedDates