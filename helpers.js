import { format, getDaysInMonth, isValid } from 'date-fns'

// eBird's county codes: US-VT-001 is Addison, and so on.
const eBirdCountyIds = {
  1: 'Addison',
  3: 'Bennington',
  5: 'Caledonia',
  7: 'Chittenden',
  9: 'Essex',
  11: 'Franklin',
  13: 'Grand Isle',
  15: 'Lamoille',
  17: 'Orange',
  19: 'Orleans',
  21: 'Rutland',
  23: 'Washington',
  25: 'Windham',
  27: 'Windsor'
}

function capitalizeFirstLetters (string) {
  return string.toLowerCase().split(' ').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ')
}

// date-fns format strings for grouping dates by year, month or day
function parseDateFormat (timespan) {
  let dateFormat
  if (timespan === 'year') {
    dateFormat = 'yyyy'
  } else if (timespan === 'month') {
    dateFormat = 'yyyy-MM'
  } else if (timespan === 'day') {
    dateFormat = 'yyyy-MM-dd'
  } else if (timespan) {
    throw new Error('Unable to parse timespan. Must be: year, month, or day.')
  }
  return dateFormat
}

// An eBird date, YYYY-MM-DD or MM/DD/YYYY, as a local Date at midnight.
// Anything after the date, such as a time, is ignored. An impossible date
// like 2023-02-29 gives an Invalid Date; a string with neither delimiter throws.
function parseDate (dateStr) {
  let parts
  if (dateStr.includes('-')) {
    const match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    parts = match && [match[1], match[2], match[3]]
  } else if (dateStr.includes('/')) {
    const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    parts = match && [match[3], match[1], match[2]]
  } else {
    throw new Error('Invalid Date String')
  }
  if (!parts) {
    return new Date(NaN)
  }
  const [year, month, day] = parts.map(Number)
  const date = new Date(year, month - 1, day)
  // new Date() rolls 2023-02-29 over to March 1st; that's an impossible date
  if (date.getMonth() !== month - 1 || date.getDate() !== day) {
    return new Date(NaN)
  }
  // new Date() reads years 0-99 as 1900-1999
  date.setFullYear(year)
  return date
}

// A Date in a date-fns format, or as an ISO string with the local offset
// (+00:00, never Z) if no format is given. 'Invalid date' for an Invalid Date, as moment gave, rather
// than date-fns' RangeError.
function formatDate (date, dateFormat) {
  if (!isValid(date)) {
    return 'Invalid date'
  }
  return format(date, dateFormat || "yyyy-MM-dd'T'HH:mm:ssxxx")
}

// Month and day ('MM', 'DD') of an eBird Date in either YYYY-MM-DD or
// MM/DD/YYYY form. Returns undefined for an impossible date like 2023-02-29.
function monthAndDay (dateStr) {
  const date = parseDate(dateStr)
  if (!isValid(date)) {
    return undefined
  }
  return [String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')]
}

// Days in a month (1-12) of a leap year, so month-day charts that span every
// year have a slot for Feb 29 whatever the current year is.
function leapYearDaysInMonth (month) {
  return getDaysInMonth(new Date(2000, Number(month) - 1))
}

// Drop rows whose Date is not a real calendar date (e.g. 2023-02-29), with
// one warning giving the number skipped and the first few Submission IDs.
function skipInvalidDates (data) {
  const skipped = []
  const valid = data.filter(e => {
    if (isValid(parseDate(e.Date))) {
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
  eBirdCountyIds,
  capitalizeFirstLetters,
  parseDateFormat,
  parseDate,
  formatDate,
  monthAndDay,
  leapYearDaysInMonth,
  skipInvalidDates
}
