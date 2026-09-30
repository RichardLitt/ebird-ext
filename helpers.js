import moment from 'moment'

function capitalizeFirstLetters (string) {
  return string.toLowerCase().split(' ').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ')
}

function parseDateFormat (timespan) {
  let dateFormat
  if (timespan === 'year') {
    dateFormat = 'YYYY'
  } else if (timespan === 'month') {
    dateFormat = 'YYYY-MM'
  } else if (timespan === 'day') {
    dateFormat = 'YYYY-MM-DD'
  } else if (timespan) {
    throw new Error('Unable to parse timespan. Must be: year, month, or day.')
  }
  return dateFormat
}

function momentFormat (dateStr) {
  if (dateStr.includes('-')) {
    return 'YYYY-MM-DD'
  } else if (dateStr.includes('/')) {
    return 'MM/DD/YYYY'
  } else {
    throw new Error('Invalid Date String')
  }
}

// Month and day ('MM', 'DD') of an eBird Date in either YYYY-MM-DD or
// MM/DD/YYYY form. Returns undefined for an impossible date like 2023-02-29.
function monthAndDay (dateStr) {
  const date = moment(dateStr, momentFormat(dateStr))
  if (!date.isValid()) {
    return undefined
  }
  return [date.format('MM'), date.format('DD')]
}

// Days in a month (1-12) of a leap year, so month-day charts that span every
// year have a slot for Feb 29 whatever the current year is.
function leapYearDaysInMonth (month) {
  return moment([2000, Number(month) - 1]).daysInMonth()
}

// Drop rows whose Date is not a real calendar date (e.g. 2023-02-29), with
// one warning giving the number skipped and the first few Submission IDs.
function skipInvalidDates (data) {
  const skipped = []
  const valid = data.filter(e => {
    if (moment(e.Date, momentFormat(e.Date)).isValid()) {
      return true
    }
    skipped.push(e)
    return false
  })
  if (skipped.length) {
    const ids = [...new Set(skipped.map(e => e['Submission ID']))]
    const shown = ids.slice(0, 5).join(', ') + (ids.length > 5 ? ', ...' : '')
    console.warn(`Skipping ${skipped.length} row(s) with an impossible date: ${shown}`)
  }
  return valid
}

export {
  capitalizeFirstLetters,
  parseDateFormat,
  momentFormat,
  monthAndDay,
  leapYearDaysInMonth,
  skipInvalidDates
}
