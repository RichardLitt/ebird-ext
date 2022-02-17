function capitalizeFirstLetters(string) {
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

module.exports = {
  capitalizeFirstLetters,
  parseDateFormat,
  momentFormat
}