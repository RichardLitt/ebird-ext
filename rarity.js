// The VBRC check: which sightings the Vermont Bird Records Committee wants a
// rare bird report for. rare() in index.js runs it over a file;
// isSpeciesSightingRare checks one sighting. This file imports no boundaries,
// so the site's single-sighting checker loads it without the town and region
// polygons: data/vt_town_info.json has each town's county and region
// (scripts/updateTownInfo.js).
import VermontRecords from './data/vermont_records.json' with { type: 'json' }
import VermontSubspecies from './data/vermont_records_subspecies.json' with { type: 'json' }
import TownInfo from './data/vt_town_info.json' with { type: 'json' }
import appearsDuringExpectedDates from './appearsDuringExpectedDates.js'
import { capitalizeFirstLetters } from './helpers.js'

// We need both the single letter and the full-text;
// the eBird downloaded database only has single, but MyEbirdData has the full string.
// Alternatively, we should convert them when importing, but there're space issues.
const IGNORED_BREEDING_CODES = [
  'S Singing Bird',
  'S',
  'H In Appropriate Habitat',
  'H',
  'F Flyover',
  'F',
  'S7 Singing Bird Present 7+ Days (Probable)',
  'S7',
  'M Multiple (7+) Singing Birds (Probable)',
  'M',
  'P Pair in Suitable Habitat (Probable)',
  'P',
  'T Territorial Defense (Probable)',
  'T',
  'C Courtship, Display or Copulation (Probable)',
  'C',
  'N Visiting Probable Nest Site (Probable)',
  'N',
  'A Agitated Behavior (Probable)',
  'A',
  'B Wren/Woodpecker Nest Building (Probable)',
  'B'
]

// records: a VBRC list in the shape of data/vermont_records.json (default: that
// file), so a list can be checked against another, as scripts/compareVermontRecords.js does.
const recordsByName = new WeakMap()
function byName (records) {
  if (!recordsByName.has(records)) recordsByName.set(records, new Map(records.map(x => [x['Scientific Name'], x])))
  return recordsByName.get(records)
}

// Whether rare() could flag this record, judged before the slow town and region
// lookups. Only rules out a species the VBRC never asks about, seen inside its
// expected dates, with no nesting code and no reportable subspecies.
const expectedDatesCache = new Map()
function couldBeRare (e, records = VermontRecords) {
  const recordEntry = byName(records).get(e['Scientific Name'])
  if (!recordEntry || ['V', 'C', 'K'].includes(recordEntry.Reporting)) return true
  if (e['Breeding Code'] && !IGNORED_BREEDING_CODES.includes(e['Breeding Code'])) return true
  if (e.Subspecies && VermontSubspecies.some(x => x['Scientific Name'] === e['Scientific Name'])) return true
  // Cached: parsing dates is most of the time spent on a large EBD file
  const key = `${e.Date}|${recordEntry.Occurrence}`
  if (!expectedDatesCache.has(key)) expectedDatesCache.set(key, appearsDuringExpectedDates(e.Date, recordEntry.Occurrence))
  return !expectedDatesCache.get(key)
}

// Sort sightings into rare()'s buckets. Each sighting needs Scientific Name,
// Date, County and Region; Breeding Code and Subspecies are optional.
function classifyRarities (data, records = VermontRecords) {
  const list = byName(records)
  // TODO Update needs JSON file
  const output = {
    Breeding: [],
    Vermont: [],
    Champlain: [],
    NEK: [],
    Unknown: [],
    Subspecies: [],
    OutsideExpectedDates: []
  }

  data.forEach(e => {
    const species = e['Scientific Name']
    const recordEntry = list.get(species)
    if (recordEntry) {
      // TODO Document this. Could also check Observation Details or Checklist Comments
      if (!appearsDuringExpectedDates(e.Date, recordEntry.Occurrence)) {
        output.OutsideExpectedDates.push(e)
      } else if (recordEntry.Breeding !== '*' && e['Breeding Code'] && !IGNORED_BREEDING_CODES.includes(e['Breeding Code'])) {
        output.Breeding.push(e)
      } else if (recordEntry.Reporting === 'N' && (e['Breeding Code']) && !IGNORED_BREEDING_CODES.includes(e['Breeding Code'])) {
        output.Breeding.push(e)
      } else if (recordEntry.Reporting === 'V') {
        // Anyhwere in Vermont
        output.Vermont.push(e)
      } else if (recordEntry.Reporting === 'C') {
        // Outside of Lake Champlain Basin
        if (e.Region !== 'Champlain Valley') {
          output.Champlain.push(e)
        }
      } else if (recordEntry.Reporting === 'K') {
        // Outside of the NEK
        const counties = ['Essex', 'Caledonia', 'Orleans']
        if (!counties.includes(e.County)) {
          output.NEK.push(e)
        }
      }
    } else {
      output.Unknown.push(e)
    }

    if (e.Subspecies) {
      const species = VermontSubspecies.find(x => e['Scientific Name'] === x['Scientific Name'])
      if (species && species['Target Subspecies'].includes(e.Subspecies)) {
        e['Subspecies Notes'] = species
        output.Subspecies.push(e)
      } else if (species && !species['Vermont Subspecies'].includes(e.Subspecies)) {
        if (species['Target Subspecies'][0] === '') {
          e['Subspecies Notes'] = species
          output.Subspecies.push(e)
        } else {
          e['Subspecies Notes'] = species
          output.Subspecies.push(e)
        }
      }
    }
  })

  return output
}

// The VBRC list entry for a common or scientific name, any case
function getSpeciesObjGivenName (str) {
  // Substrings before this doesn't work due to Latin names having different capitalization rules
  return VermontRecords.find(item => item.Species.toLowerCase() === str.toLowerCase() || item['Scientific Name'].toLowerCase() === str.toLowerCase())
}

// Check one sighting: opts is { species, town, date, subspecies?, records? }.
// Does not check breeding codes. Assumes that all towns are in one region:
// the region is the one holding a point inside the town (see vt_town_info.json).
async function isSpeciesSightingRare (opts) {
  // Likely not a bird seen in Vermont before. Just use what they gave us.
  const species = getSpeciesObjGivenName(opts.species) || {
    'Scientific Name': undefined,
    Species: opts.species
  }

  const town = opts.town && TownInfo[opts.town.toUpperCase()]
  if (!town) {
    throw new Error(`Unknown town: "${opts.town}" is not a Vermont town.`)
  }

  // TODO Add a way to get Breeding Codes
  opts.data = [{
    County: town.county,
    Date: opts.date,
    Region: town.region,
    'Scientific Name': species['Scientific Name'],
    Species: species.Species,
    Subspecies: opts.subspecies,
    Town: opts.town,
    // These two are used only for display forms.
    'Common Name': species.Species,
    Location: capitalizeFirstLetters(opts.town)
  }]

  opts.manual = true
  opts.state = 'Vermont'
  return classifyRarities(opts.data, opts.records)
}

export {
  IGNORED_BREEDING_CODES,
  byName,
  couldBeRare,
  classifyRarities,
  getSpeciesObjGivenName,
  isSpeciesSightingRare
}
