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

export {
  capitalizeFirstLetters,
  parseDateFormat,
  momentFormat,
  monthAndDay
}
