const Town_boundaries = require('./geojson/vt_towns.json')
const Vermont_regions = require('./geojson/Polygon_VT_Biophysical_Regions.json')
const VermontRecords = require('./data/vermont_records.json')
const CountyBarcharts = require('./data/countyBarcharts.json')
const VermontSubspecies = require('./data/vermont_records_subspecies.json')
const GeoJsonGeometriesLookup = require('geojson-geometries-lookup')
const vermontRegions = new GeoJsonGeometriesLookup(Vermont_regions)
const fs = require('fs').promises
const _ = require('lodash')
const Papa = require('papaparse')
const moment = require('moment')
const difference = require('compare-latlong')
const appearsDuringExpectedDates = require('./appearsDuringExpectedDates.js')
const polygonCenter = require('geojson-polygon-center')
const helpers = require('./helpers')
const f = require('./filters.js')

// Why eBird uses this format I have no idea.
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

async function vt251 (input) {
  const opts = {
    year: 2022,
    state: 'Vermont',
    all: true,
    complete: true,
    duration: 5,
    output: 'data/vt_town_counts.json',
    input
  }
  await towns(opts)
}

// Useful for when Rock Pigeon is being compared against other lists, or for times when a single sighting contains only subspecies
function cleanCommonName (arr) {
  return arr.map(s => s.split('(')[0].trim())
}

async function getData (input) {
  if (fs) {
    input = await fs.readFile(input, 'utf8')
    input = Papa.parse(input, { header: true })
    return f.removeSpuh(input.data)
  }

  return f.removeSpuh(input)
}

async function biggestTime (timespan, opts) {
  const dateFormat = helpers.parseDateFormat(timespan)
  const data = await getData(opts.input)
  const dataByDate = {}

  // Sort by the amount of unique entries per day
  data.forEach((e) => {
    const period = moment(e.Date, helpers.momentFormat(e.Date)).format(dateFormat)
    if (!dataByDate[period]) {
      dataByDate[period] = [e]
    } else {
      dataByDate[period].push(e)
    }
  })

  return f.createPeriodArray(dataByDate)[0]
}

async function firstTimes (timespan, opts) {
  const dateFormat = helpers.parseDateFormat(timespan)
  const data = f.orderByDate(await getData(opts.input)) // Sort by the date, instead
  const dataByDate = {}
  const speciesIndex = {}

  // Sort by the amount of unique entries per day
  data.forEach((e) => {
    const period = moment(e.Date, helpers.momentFormat(e.Date)).format(dateFormat)
    if (!speciesIndex[e['Scientific Name']]) {
      if (!dataByDate[period]) {
        dataByDate[period] = [e]
      } else {
        dataByDate[period].push(e)
      }
      // TODO Use scientific name
      speciesIndex[e['Scientific Name']] = e.Date
    }
  })

  return f.createPeriodArray(dataByDate)[0]
}

async function firstTimeList (opts) {
  // TODO Fix
  // const dateFormat = helpers.parseDateFormat('day')
  // const data = f.orderByDate(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts))
  // const dataByDate = {}
  // const speciesIndex = {}
  //
  // data = countUniqueSpecies(data)
  //
  // let i = 1
  // // TODO Doesn't work for MyEBirdData for some reason
  // _.sortBy(f.createPeriodArray(dataByDate), 'Date').forEach((e) => {
  //   e.Species.forEach((specie) => {
  //     console.log(`${i} | ${specie['Common Name']} - ${specie['Scientific Name']} | ${(specie.County) ? specie.County + ', ' : ''}${specie['State/Province']} | ${e.Date}`)
  //     i++
  //   })
  // })
}

// Sort by the amount of unique entries per day
function countUniqueSpecies (data, dateFormat) {
  const speciesIndex = {}
  const dataByDate = {}
  data.forEach((e) => {
    const period = moment(e.Date, helpers.momentFormat(e.Date)).format(dateFormat)
    const specie = e['Scientific Name']
    if (!speciesIndex[specie]) {
      if (!dataByDate[period]) {
        dataByDate[period] = [e]
      } else {
        dataByDate[period].push(e)
      }
      speciesIndex[specie] = e.Date
    }
  })

  return dataByDate
}

function getAllTowns (geojson) {
  const towns = []
  geojson.features.forEach((t) => {
    towns.push({
      town: t.properties.town
    })
  })
  return towns
}

/* node cli.js count -i=MyEBirdData.csv --town="Fayston" --state=Vermont
As this is set up, it will currently return only the first time I saw species in each town provided, in Vermont */
async function towns (opts) {
  if (!opts.state) {
    // We only have towns for this state
    opts.state = 'Vermont'
  }
  const dateFormat = helpers.parseDateFormat('day')
  let data = f.orderByDate(f.durationFilter(f.completeChecklistFilter(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts), opts), opts), opts)
  var speciesSeenInVermont = []
  _.forEach(countUniqueSpecies(data, dateFormat), (o) => {
    var mapped = _.map(o, 'Common Name')
    speciesSeenInVermont.push(mapped)
  })
  speciesSeenInVermont = _.flatten(speciesSeenInVermont)
  if (opts.all) {
    const towns = getAllTowns(Town_boundaries)
    towns.forEach(t => {
      let i = 0
      t.species = []
      const speciesByDate = countUniqueSpecies(data.filter(x => x.Town === t.town), dateFormat)
      _.sortBy(f.createPeriodArray(speciesByDate), 'Date').forEach((e) => {
        e.Species.forEach((species) => {
          t.species.push(species['Common Name'])
          i++
        })
      })
      t.speciesTotal = i
    })

    if (opts.output) {
      fs.writeFile(`${opts.output.toString().replace('.json', '')}.json`, JSON.stringify(towns), 'utf8')
    }
    return towns
  } else if (opts.town) {
    // Turn on to find checklists in that town console.log(_.uniq(data.map((item, i) => `${item['Submission ID']}`)))
    data = countUniqueSpecies(data.filter(x => x.Town === opts.town.toUpperCase()), dateFormat)

    if (opts.output) {
      fs.writeFile(`${opts.output.toString().replace('.json', '')}.json`, JSON.stringify(data), 'utf8')
    }

    let i = 1
    // TODO Doesn't work for MyEBirdData for some reason
    _.sortBy(f.createPeriodArray(data), 'Date').forEach((e) => {
      e.Species.forEach((specie) => {
        console.log(`${i} | ${specie['Common Name']} - ${specie['Scientific Name']} | ${opts.town}, ${(specie.County) ? specie.County + ', ' : ''}${specie.State} | ${e.Date}`)
        i++
      })
    })
  }
}

/* node cli.js counties -i=MyEBirdData.csv
As this is set up, it will currently return only the first time I saw species in each town provided, in Vermont */
async function counties (opts) {
  opts.state = 'Vermont'
  const dateFormat = helpers.parseDateFormat('day')
  const data = f.orderByDate(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts), opts)

  const countySpecies = f.removeSpuhFromCounties(CountyBarcharts)

  const counties = Object.keys(CountyBarcharts).map(county => {
    const speciesByDate = countUniqueSpecies(data.filter(x => x.County === county), dateFormat)
    const species = _.sortBy(f.createPeriodArray(speciesByDate), 'Date').map(period => {
      return period.Species.map(species => species['Common Name'])
    }).flat()
    return {
      county,
      collectiveTotal: countySpecies[county].length,
      species,
      speciesTotal: species.length
    }
  })

  // Again, as above es6 probably has a better way of doing this.
  const newObj = {}
  counties.forEach(c => newObj[c.county] = c)

  function countyTicks () {
    const total = Object.keys(newObj).reduce((prev, cur) => {
      return prev + newObj[cur].speciesTotal
    }, 0)
    console.log(`Total ticks: ${total}.`)
  }

  if (opts.ticks) {
    countyTicks()
  }

  if (opts.county) {
    console.log(newObj[opts.county])
    return newObj[opts.county]
  }

  if (opts.output) {
    fs.writeFile(`${opts.output.toString().replace('.json', '')}.json`, JSON.stringify(counties), 'utf8')
  }

  return newObj
}

async function winterFinch (opts) {
  function sortedList (list, orderedList) {
    list = list.map(species => species.split(' (')[0])
    return list.sort((a, b) => orderedList.indexOf(a) - orderedList.indexOf(b))
  }

  const owls = [
    'Eastern Screech-owl',
    'Great Horned Owl',
    'Snowy Owl',
    'Barred Owl',
    'Long-eared Owl',
    'Short-eared Owl',
    'Boreal Owl',
    'Northern Saw-whet Owl'
  ]

  const winterFinches = [
    'Rough-legged Hawk',
    'Snowy Owl',
    'Northern Shrike',
    'Boreal Chickadee',
    'Horned Lark',
    'Bohemian Waxwing',
    'Evening Grosbeak',
    'Pine Grosbeak',
    'Common Redpoll',
    'Hoary Redpoll',
    'Red Crossbill',
    'White-winged Crossbill',
    'Pine Siskin',
    'Lapland Longspur',
    'Snow Bunting',
    'American Tree Sparrow'
  ]

  const data = await counties(opts)
  Object.keys(data).forEach(county => {
    const intersection = sortedList(_.intersection(cleanCommonName(data[county].species), winterFinches), winterFinches)
    console.log(`${county} (${intersection.length})${(intersection.length !== 0) ? `: ${intersection.join(', ')}.` : ''}`)
  })

  console.log('')
  Object.keys(data).forEach(county => {
    const intersection = sortedList(_.intersection(cleanCommonName(data[county].species), owls), owls)
    console.log(`${county} (${intersection.length})${(intersection.length !== 0) ? `: ${intersection.join(', ')}.` : ''}`)
  })
}

/* node cli.js count -i=MyEBirdData.csv --town="Fayston" --state=Vermont
As this is set up, it will currently return only the first time I saw species in each town provided, in Vermont */
async function regions (opts) {
  opts.state = 'Vermont'
  const dateFormat = helpers.parseDateFormat('day')
  const data = f.orderByDate(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts), opts)

  function getRegions (geojson) {
    const regions = []
    geojson.features.forEach((r) => regions.push({ region: r.properties.name }))
    return regions
  }

  const regions = getRegions(Vermont_regions)
  regions.forEach(r => {
    let i = 0
    r.species = []
    r.speciesByDate = countUniqueSpecies(data.filter(x => x.Region === r.region), dateFormat)
    _.sortBy(f.createPeriodArray(r.speciesByDate), 'Date').forEach((e) => {
      e.Species.forEach((specie) => {
        r.species.push(specie['Common Name'])
        i++
      })
    })
    r.speciesTotal = i
    // console.log(`Region: ${r.region}. Species count: ${r.speciesTotal}.`)
  })

  return regions
  // fs.writeFile('vt_region_counts.json', JSON.stringify(regions), 'utf8')
}

async function radialSearch (opts) {
  const dateFormat = helpers.parseDateFormat('day')
  const radius = opts.distance || 10 // miles
  const lat = opts.coordinates[0]
  const long = opts.coordinates[1]
  console.log(dateFormat, lat, long)
  let data = await getData(opts.input)

  // Get a total list of species that you have seen in Vermont
  // TODO Get a list of all species ever seen in Vermont, here.
  var speciesSeenInVermont = []
  opts.state = 'Vermont'
  _.forEach(countUniqueSpecies(f.dateFilter(f.locationFilter(data, opts), opts), dateFormat), (o) => {
    var mapped = _.map(o, 'Common Name')
    speciesSeenInVermont.push(mapped)
  })
  speciesSeenInVermont = _.flatten(speciesSeenInVermont)

  data = f.orderByDate(data, opts).filter((d) => {
    const distance = difference.distance(lat, long, d.Latitude, d.Longitude, 'M')
    return distance <= radius
  })
  let i = 0
  const areaResults = {}

  areaResults.species = []
  areaResults.speciesByDate = countUniqueSpecies(data, dateFormat)
  _.sortBy(f.createPeriodArray(areaResults.speciesByDate), 'Date').forEach((e) => {
    e.Species.forEach((specie) => {
      areaResults.species.push(specie['Common Name'])
      i++
    })
  })
  areaResults.speciesTotal = i

  return areaResults
}

async function quadBirds (opts) {
  const files = opts.input.split(',')
  let data = []
  await Promise.all(files.map(async (file) => {
    const contents = await getData(file)
    data = data.concat(contents)
  }))
  data = f.orderByDate(f.dateFilter(f.locationFilter(data, opts), opts))
  const speciesIndex = {}
  let completionDates = []

  // Sort by the amount of unique entries per day
  data.forEach((e) => {
    const species = e['Scientific Name']
    if (!speciesIndex[species]) {
      speciesIndex[species] = {
        seen: undefined,
        audio: undefined,
        photo: undefined,
        species: e
      }
    }
    if (e['Submission ID'] && !speciesIndex[species].seen) {
      speciesIndex[species].seen = moment(e.Date, helpers.momentFormat(e.Date)).format('YYYY-MM-DD')
    }
    if (e.Format === 'Photo' && !speciesIndex[species].photo) {
      speciesIndex[species].photo = moment(e.Date, helpers.momentFormat(e.Date)).format('YYYY-MM-DD')
    }
    if (e.Format === 'Audio' && !speciesIndex[species].audio) {
      speciesIndex[species].audio = moment(e.Date, helpers.momentFormat(e.Date)).format('YYYY-MM-DD')
    }
    if (!speciesIndex[species].completed &&
      speciesIndex[species].audio &&
      speciesIndex[species].photo &&
      speciesIndex[species].seen) {
      if (moment(speciesIndex[species].audio, helpers.momentFormat(speciesIndex[species].audio)).isBefore(speciesIndex[species].photo, helpers.momentFormat(speciesIndex[species].audio))) {
        speciesIndex[species].completed = speciesIndex[species].photo
      } else {
        speciesIndex[species].completed = speciesIndex[species].audio
      }
      completionDates.push({ Date: speciesIndex[species].completed, species: speciesIndex[species].species })
    }
  })

  completionDates = f.orderByDate(completionDates)

  if (opts.list) {
    for (const species in completionDates) {
      console.log(`${completionDates[species].Date}: ${completionDates[species].species['Common Name']}.`)
    }
  }
  console.log(`You ${(!opts.year || opts.year.toString() === moment().format('YYYY')) ? 'have seen' : 'saw'}, photographed, and recorded a total of ${completionDates.length} species${(opts.year) ? ` in ${opts.year}` : ''}.`)
}

function pointLookup (geojson, geojsonLookup, data) {
  let point
  if (data.type === 'Point') {
    point = data
  } else {
    point = { type: 'Point', coordinates: [data.Longitude, data.Latitude] }
  }
  const containerArea = geojsonLookup.getContainers(point)
  if (containerArea.features[0]) {
    const props = containerArea.features[0].properties
    return (props.town) ? props.town : props.name
  }
  // If, for some reason, the point is on a border and the map I have discards it, but eBird doesn't - just discard it.
  // This can be fixed by using nearest neighbor approaches, but those tend to have a high computational load, and they require
  // mapping libraries that need window, which just stinks.
  // TODO Use turf for this, seems to work just fine.
}

// - Get scientific name for a given bird
async function getSpeciesObjGivenName (str) {
  // Search for substring in vermontRecords
  // Substrings before this doesn't work due to Latin names having different capitalization rules
  return VermontRecords.find((item) => (item.Species.toLowerCase() === str.toLowerCase() || item['Scientific Name'].toLowerCase() === str.toLowerCase()) ? item : undefined)
}

async function getCountyForTown (town) {
  const mapping = Town_boundaries.features.map(obj => obj.properties)
  const res = mapping.find(t => t.town === town.toUpperCase())
  return (res) ? eBirdCountyIds[res.county] : undefined
}

async function getLatLngCenterofTown (town) {
  if (typeof town !== 'string') {
    throw new Error('Town must be a string to get a LatLng coördinate.')
  }
  const polygon = Town_boundaries.features.find(x => x.properties.town === town.toUpperCase())
  const center = polygonCenter(polygon.geometry)
  return center
}

// TODO: Figure out how to get input from a dropdown in React
//   - Discrete input (town out of all towns)
//   - Date input
// Does not check breeding codes
// Assumes that all towns are in one region - only uses centerpoint of town
async function isSpeciesSightingRare (opts) {
  let species = await getSpeciesObjGivenName(opts.species)
  // Likely not a bird seen in Vermont before. Just use what they gave us.
  if (!species) {
    species = {
      'Scientific Name': undefined,
      Species: opts.species
    }
  }

  // TODO Add a way to get Breeding Codes
  opts.data = [{
    County: await getCountyForTown(opts.town),
    Date: opts.date,
    Region: await pointLookup(Vermont_regions, vermontRegions, await getLatLngCenterofTown(opts.town)),
    'Scientific Name': species['Scientific Name'],
    Species: species.Species,
    Subspecies: opts.subspecies,
    Town: opts.town,
    // These two are used only for display forms.
    'Common Name': species.Species,
    Location: helpers.capitalizeFirstLetters(opts.town)
  }]
  opts.manual = true
  return rare(opts)
}

async function rare (opts) {
  let data
  opts.state = 'Vermont'
  // Use only data from this year, from Vermont
  if (!opts.manual) {
    data = f.orderByDate(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts), opts).reverse()
  } else {
    // This will correctly flag as 'Unknown'
    if (opts.data) {
      data = opts.data
    } else {
      const spoof = [{
        County: 'Washington',
        Date: '2020-03-02',
        Region: 'Northern Piedmont',
        'Scientific Name': 'Martes martes',
        Species: 'Pine Marten',
        Town: 'Montpelier'
      }]
      data = spoof
    }
  }
  const allSpecies = VermontRecords.map(x => x['Scientific Name'])
  const speciesToReport = VermontRecords.map(x => x['Scientific Name'])
  // TODO Update needs JSON file
  const output = {
    Breeding: [],
    Vermont: [],
    Burlington: [],
    Champlain: [],
    NEK: [],
    Unknown: [],
    Subspecies: [],
    OutsideExpectedDates: []
  }
  const ignoredBreedingCodes = ['S Singing Bird', 'H In Appropriate Habitat', 'F Flyover']
  data.forEach(e => {
    const species = e['Scientific Name']
    if (speciesToReport.includes(species)) {
      const recordEntry = VermontRecords.find(x => x['Scientific Name'] === species)
      // TODO Document this. Could also check Observation Details or Checklist Comments
      if (!appearsDuringExpectedDates(e.Date, recordEntry.Occurrence)) {
        output.OutsideExpectedDates.push(e)
      } else if (recordEntry.Breeding !== '*' && e['Breeding Code'] && !ignoredBreedingCodes.includes(e['Breeding Code'])) {
        output.Breeding.push(e)
      } else if (recordEntry.Reporting === 'N' && (e['Breeding Code']) && !ignoredBreedingCodes.includes(e['Breeding Code'])) {
        output.Breeding.push(e)
      } else if (recordEntry.Reporting === 'V') {
        // Anyhwere in Vermont
        output.Vermont.push(e)
      } else if (recordEntry.Reporting === 'B') {
        // Outside of Burlington
        const towns = ['Burlington', 'South Burlington', 'Essex', 'Colchester', 'Winooski', 'Shelburne']
        if (!towns.includes(e.Town)) {
          output.Burlington.push(e)
        }
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
    } else if (!allSpecies.includes(species)) {
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

// What have you logged, outside of the species level?
async function subspecies (opts) {
  let data = opts.input
  if (fs) {
    const input = await fs.readFile(opts.input, 'utf8')
    data = Papa.parse(input, { header: true }).data
  }

  // const dateFormat = helpers.parseDateFormat('day')
  data = f.orderByDate(f.dateFilter(f.locationFilter(data, opts), opts), opts)
  data = f.removeSpuh(data, true)
  const allIdentifications = _.uniq(data.map(x => x["Scientific Name"]))
  const species = _.uniq(f.removeSpuh(data).map(x => x['Scientific Name']))

  // Counting species as the sole means of a life list is silly, because it
  // doesn't account for species diversity and changing taxonomies well enough
  // Instead, just count any terminal leaf in the identification tree.
  function createLeavesList (species, allIdentifications) {
    const leaves = _.clone(species)

    function removeNode (leaves, base) {
      const baseIndex = leaves.indexOf(base)
      if (baseIndex !== -1) {
        if (opts.verbose) {
          console.log(`Removing node: ${base}`)
        }
        leaves.splice(baseIndex, 1)
      }
    }

    function addLeaf (leaves, leaf) {
      if (opts.verbose) {
        console.log(`Adding leaf: ${leaf}`)
      }
      leaves.push(leaf)
    }

    allIdentifications
      // Don't count these for life lists, in general.
      .filter(x => !x.includes('Domestic'))
      .forEach(x => {
        if (x.includes('sp.')) {
          const genus = x.split(' ')[0].split('/')[0]
          if (!leaves.join(' ').includes(genus)) {
            // Worst offender. Will need a better way of doing this for other genera.
            // These seem to be the only eird adjectival spuhs, though.
            if (['Anatinae', 'Anatidae'].includes(genus)) {
              const anatinae = ['Amazonetta', 'Sibirionetta', 'Spatula', 'Mareca', 'Lophonetta', 'Speculanas', 'Anas']
              if (!anatinae.some(ducks => species.join(' ').includes(ducks))) {
                console.log(`Unsure what to do with ${x} spuh identifation.`)
              }
            }
          }
        } else if (x.includes('/')) {
          if (x.split('/')[1].split(' ').length === 2) {
            const [base1, base2] = x.split('/')
            if (!leaves.includes(base1) && !leaves.includes(base2)) {
              addLeaf(leaves, x)
            }
          } else {
            const base = x.split(' ').slice(0, -1).join(' ')
            if (!leaves.join(' ').includes(base)) {
              addLeaf(leaves, x)
            } else {
              // Anas platyrhyncos/rubripes
              if (x.split(' ').slice(0, -1).length === 1) {
                const species1 = x.split('/')[0]
                const species2 = `${species1.split(' ')[0]} ${x.split('/')[1]}`
                if (!leaves.includes(species1) && !leaves.includes(species2)) {
                  addLeaf(leaves, x)
                }
              } else {
                removeNode(leaves, base)
                addLeaf(leaves, x)
              }
            }
          }
        } else if (x.includes(' x ')) {
          addLeaf(leaves, x)
        } else if (x.includes('Feral')) {
          // We want to count this one twice...
          addLeaf(leaves, x)
        } else if (x.includes('Group]')) {
          removeNode(leaves, x.split('[')[0].trim())
          addLeaf(leaves, x)
        } else if (x.includes('(type')) {
          removeNode(leaves, x.split('(')[0].trim())
          addLeaf(leaves, x)
        } else if (x.split(' ').length > 2) {
          removeNode(leaves, x.split(' ').slice(0, 2).join(' '))
          addLeaf(leaves, x)
        } else {
          if (opts.verbose) {
            console.log(`Keeping species leaf: ${x}`)
          }
        }
      })

    return _.uniq(leaves)
  }

  const output = {
    // Only species, filtered
    species,
    // Every identification type
    allIdentifications,
    spuhs: allIdentifications.filter(x => x.includes('sp.')),
    // Splits, both on genus, species, and subspecies levels
    slashes: allIdentifications.filter(x => x.includes('/')),
    // Included as they're morphologically distinct and part of complexes
    hybrids: allIdentifications.filter(x => x.includes(' x ')),
    // Included as only example also has native stock
    feral: allIdentifications.filter(x => x.includes('Feral')),
    // Included for completeness
    domestic: allIdentifications.filter(x => x.includes('Domestic')),
    // Included as highest subspecies identification in eBird
    grouping: allIdentifications.filter(x => x.includes('Group]')),
    // Included as being identical to subspecies
    types: allIdentifications.filter(x => x.includes('(type')),
    // All trinomial cases
    subspecies: allIdentifications.filter(x => {
      if (!x.includes('sp.') &&
        !x.includes('/') &&
        !x.includes('Domestic') &&
        !x.includes('Feral') &&
        !x.includes(' x ') &&
        !x.includes('Group]') &&
        !x.includes('(type') &&
        x.split(' ').length > 2) {
        return x
      }
      return false
    }),
    // All possible leaf nodes in a taxonomic identification tree, minus any
    // non-leaf nodes, including species identifications if subspecies identified
    leaves: createLeavesList(species, allIdentifications).sort()
  }
  console.log(output)
  // console.log(output.leaves.length)
  return output
}

/* Return a unique list of checklists IDs */
async function checklists (opts) {
  let data = f.orderByDate(f.durationFilter(f.completeChecklistFilter(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts), opts), opts), opts)
  // Intentionally not returning a URL to make this simpler, and to avoid another flag
  data = _.uniqBy(data.map(x => {
    return {
      'Submission ID': x['Submission ID'],
      Date: x.Date,
      Time: x.Time,
      Location: x.Location,
      'All Obs Reported': x['All Obs Reported']
    }
  }), 'Submission ID')
  // data.map(x => console.log(x['Submission ID']))
  return data
}

/* Used when updating the 251 page */
async function getLastDate (opts) {
  let data = f.orderByDate(f.durationFilter(f.completeChecklistFilter(f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts), opts), opts), opts)
  data = moment.max(_.uniq(data.map(x => moment(x.Date, 'YYYY-MM-DD'))))
  console.log(moment(data).format('MMMM Do, YYYY'))
}

async function countTheBirds (opts) {
  const data = f.dateFilter(f.locationFilter(await getData(opts.input), opts), opts)
  const sum = _.sumBy(data, o => {
    if (_.isInteger(parseInt(o.Count))) {
      return parseInt(o.Count)
    }
  })
  console.log(sum)
}

async function datesSpeciesObserved (opts) {
  // Note - this assumes the location is a hotspot
//   console.log(`
// You have not seen ${opts.id} on:`)

  const data = await getData(opts.input)

  const speciesList = data.filter(x => x['State/Province'] === 'US-VT').map(x => x['Common Name']).filter((v, i, a) => a.indexOf(v) === i)
  const speciesArray = []

  speciesList.forEach(species => {
    const observedDates = {}
    const fullYearChart = {}
    const unbirdedDates = {}
    let totalDates = 0

    // Create keys in observedDates for months
    Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).forEach(key => observedDates[key] = [])
    // Filter and add all days observed to the chart
    data.filter(x => x['Common Name'] === species)
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
      totalDates += unbirdedDates[month].length
    })

    speciesArray.push([species, totalDates])

    // Print
    // Object.keys(unbirdedDates).sort((a,b) => Number(a)-Number(b)).forEach(month => {
    //   console.log(`${moment().month(Number(month)-1).format('MMMM')}: ${unbirdedDates[month].join(', ')}`)
    // })
  })

  console.log(speciesArray.sort(function (a, b) {
    return a[1] - b[1]
  }).map(x => `${x[0]}: ${365 - x[1]}`).slice(0, 20))
}

async function daylistTargets (opts) {
  const data = f.locationFilter(await getData(opts.input), opts)

  // Should probably have a bigger wanring on it.
  const speciesList = data.filter(x => x['State/Province'] === 'US-VT').map(x => x['Common Name']).filter((v, i, a) => a.indexOf(v) === i)
  const speciesArray = {}

  speciesList.forEach(species => {
    const observedDates = {}
    const fullYearChart = {}
    const unbirdedDates = {}

    // Create keys in observedDates for months
    Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).forEach(key => observedDates[key] = [])
    // Filter and add all days observed to the chart
    data.filter(x => x['Common Name'] === species)
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

    speciesArray[species] = unbirdedDates
  })

  if (opts.today) {
    const month = moment().format('MM')
    const date = Number(moment().format('DD'))
    Object.keys(speciesArray).forEach(species => {
      if (speciesArray[species][month].indexOf(date) === -1) {
        console.log(species)
      }
    })
  }
}

// async function today (opts) {
// I want to know:
// - Was today a big day?
// - Did I get new world birds today?
// - Did I get new country birds today?
// - Did I get new state birds today?
// - Did I get new county birds today?
// - Did I get new photo birds today?
// - Did I get new audio birds today?
// }

// Switch this for CLI testing
module.exports = {
// export default {
  biggestTime,
  firstTimeList,
  firstTimes,
  quadBirds,
  radialSearch,
  rare,
  regions,
  towns,
  counties,
  winterFinch,
  vt251,
  subspecies,
  checklists,
  getLastDate,
  pointLookup,
  countTheBirds,
  isSpeciesSightingRare,
  getLatLngCenterofTown,

  // Functions
  getData,
  eBirdCountyIds,
  getAllTowns,
  datesSpeciesObserved,
  daylistTargets,
  countUniqueSpecies
}
