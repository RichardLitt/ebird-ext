// Support for the eBird Basic Dataset (EBD): the tab-separated ebd_*.txt files
// you can request from https://ebird.org/data/download. They hold everyone's
// records for a region, under different column names from MyEBirdData.csv.
// These helpers turn EBD rows into MyEBirdData-shaped rows, so every other
// function in this toolkit can use them unchanged.

import Papa from 'papaparse'

// A column only the EBD has; MyEBirdData uses mixed-case names throughout
const EBD_MARKER = 'SAMPLING EVENT IDENTIFIER'

function isEBDHeader (text) {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? undefined : text.indexOf('\n'))
  return firstLine.includes(EBD_MARKER)
}

function isEBDRows (rows) {
  return Array.isArray(rows) && rows.length > 0 && rows[0] !== null &&
    typeof rows[0] === 'object' && EBD_MARKER in rows[0]
}

const trim = value => (typeof value === 'string') ? value.trim() : value

function fromEBDRow (row) {
  const subspeciesName = trim(row['SUBSPECIES SCIENTIFIC NAME'])
  return {
    'Submission ID': trim(row['SAMPLING EVENT IDENTIFIER']),
    // The EBD has no upload date; this is the nearest thing to one
    'Last Edited Date': trim(row['LAST EDITED DATE']),
    // MyEBirdData puts the subspecies or group on the main name fields, e.g.
    // "Red-tailed Hawk (abieticola)" / "Buteo jamaicensis abieticola", and
    // removeSpuh() splits that back out into Subspecies. Match it.
    'Common Name': trim(row['SUBSPECIES COMMON NAME']) || trim(row['COMMON NAME']),
    'Scientific Name': subspeciesName || trim(row['SCIENTIFIC NAME']),
    'Taxonomic Order': trim(row['TAXONOMIC ORDER']),
    Count: trim(row['OBSERVATION COUNT']),
    'State/Province': trim(row['STATE CODE']),
    County: trim(row.COUNTY),
    'Location ID': trim(row['LOCALITY ID']),
    Location: trim(row.LOCALITY),
    Latitude: trim(row.LATITUDE),
    Longitude: trim(row.LONGITUDE),
    Date: trim(row['OBSERVATION DATE']),
    Time: trim(row['TIME OBSERVATIONS STARTED']),
    // Renamed in newer EBD releases
    Protocol: trim(row['PROTOCOL TYPE'] ?? row['PROTOCOL NAME']),
    'Duration (Min)': trim(row['DURATION MINUTES']),
    'All Obs Reported': trim(row['ALL SPECIES REPORTED']),
    'Distance Traveled (km)': trim(row['EFFORT DISTANCE KM']),
    'Area Covered (ha)': trim(row['EFFORT AREA HA']),
    'Number of Observers': trim(row['NUMBER OBSERVERS']),
    'Breeding Code': trim(row['BREEDING CODE']),
    'Observation Details': trim(row['SPECIES COMMENTS']),
    'Checklist Comments': trim(row['TRIP COMMENTS']),
    // EBD-only fields, kept because they matter when looking at other people's records
    'Observer ID': trim(row['OBSERVER ID']),
    'Group Identifier': trim(row['GROUP IDENTIFIER']),
    Approved: trim(row.APPROVED),
    Reviewed: trim(row.REVIEWED),
    'Has Media': trim(row['HAS MEDIA'])
  }
}

// A checklist shared between several observers appears once per observer, under
// different Submission IDs but one Group Identifier. Keep the first copy of each
// taxon per group, so one sighting is one record.
function collapseSharedChecklists (rows) {
  const seen = new Set()
  return rows.filter(row => {
    const group = row['Group Identifier']
    if (!group) return true
    const key = `${group}|${row['Scientific Name']}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function fromEBD (rows) {
  return collapseSharedChecklists(rows.filter(row => row[EBD_MARKER]).map(fromEBDRow))
}

// Papa options for raw EBD text. The EBD is tab-separated and does not quote
// fields, but comments can contain stray double quotes, so quoting is turned
// off rather than letting one comment swallow the rest of the file.
const EBD_PARSE_OPTIONS = {
  header: true,
  delimiter: '\t',
  quoteChar: '\u0000',
  skipEmptyLines: true
}

// Parse raw EBD text (e.g. a file read in the browser) into MyEBirdData-shaped rows
function parseEBD (text) {
  return fromEBD(Papa.parse(text.replace(/^\uFEFF/, ''), EBD_PARSE_OPTIONS).data)
}

export {
  EBD_PARSE_OPTIONS,
  parseEBD,
  isEBDHeader,
  isEBDRows,
  fromEBDRow,
  fromEBD,
  collapseSharedChecklists
}
