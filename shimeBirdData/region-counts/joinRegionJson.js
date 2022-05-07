const fs = require('fs')
const banding = require('../bandingCodes')
const f = require('../filters')
const helpers = require('../helpers')
const _ = require('lodash')
const fetch = require('node-fetch')

const files = [
  require('./vtRegions-001.json'),
  require('./vtRegions-003.json'),
  require('./vtRegions-005.json'),
  require('./vtRegions-007.json'),
  require('./vtRegions-009.json'),
  require('./vtRegions-011.json'),
  require('./vtRegions-013.json'),
  require('./vtRegions-015.json'),
  require('./vtRegions-017.json'),
  require('./vtRegions-019.json'),
  require('./vtRegions-021.json'),
  require('./vtRegions-023.json'),
  require('./vtRegions-025.json'),
  require('./vtRegions-027.json')
]

const filteredYear = function (region, year, filterValue) {
  return Object.keys(region[year]).reduce((res, key) => {
    return (
      (region[year][key].total && region[year][key].total > filterValue)
        ? res[key] = region[year][key]
        : false
        , res
    )
  }, {})
}

const filteredRegion = function (obj, region, filterValue) {
  const newObj = {}
  Object.keys(obj[region]).forEach(year => {
    const observers = filteredYear(obj[region], year, filterValue)
    if (!_.isEmpty(observers)) {
      newObj[year] = observers
    }
  })
  return newObj
}

const regions = [
  'Champlain Hills',
  'Champlain Valley',
  'Northeastern Highlands',
  'Northern Green Mountains',
  'Northern Vermont Piedmont',
  'Southern Green Mountains',
  'Southern Vermont Piedmont',
  'Taconic Mountains',
  'Vermont Valley'
]

const newFile = {}

// Note: Be careful with this! You don't want to stretch the eBird API, and they don't want you to, either.
async function getName (sampleChecklistId) {
  const response = await fetch(`https://api.ebird.org/v2/product/checklist/view/${sampleChecklistId}`, {
    method: 'GET',
    headers: {
      'X-eBirdApiToken': 'a6ebaopct2l3'
    }
  })
  const body = JSON.parse(await response.text())
  return body.userDisplayName
}

async function getLists (regions) {
  regions.forEach(async region => {
    files.forEach(file => {
      if (file[region]) {
        if (!newFile[region]) {
          newFile[region] = file[region]
        } else {
          Object.keys(file[region]).forEach(year => {
            if (!newFile[region][year]) {
              newFile[region][year] = file[region][year]
            } else {
              Object.keys(file[region][year]).forEach(observer => {
                if (!newFile[region][year][observer]) {
                  newFile[region][year][observer] = file[region][year][observer]
                } else {
                  newFile[region][year][observer].species = _.union(newFile[region][year][observer].species, file[region][year][observer].species)
                  const noSpuhs = newFile[region][year][observer].species.filter(s => {
                    const spuhed = f.removeSpuh([{
                      'Scientific Name': banding.codeToScientificName(s)
                    }])
                    return !!(spuhed.length)
                  })
                  newFile[region][year][observer].total = noSpuhs.length
                }
              })
            }
          })
        }
      }
    })

    const newObj = filteredRegion(newFile, region, 150)

    const observerNames = {}
    Object.keys(newObj).forEach(year => {
      Object.keys(newObj[year]).forEach(async obs => {
        if (!observerNames[obs]) {
          const response = await getName(newObj[year][obs].sampleChecklistId)
          observerNames[obs] = response
        }
        console.log(`Region: ${region}. Year: ${year}. Observer: ${observerNames[obs]}. Total: ${newObj[year][obs].total}.`)
      })
    })

    fs.writeFile(`../data/region150-${helpers.capitalizeFirstLetters(region)}.json`, JSON.stringify(newObj), (e) => {
      if (e) {
        console.log(e)
      } else {
        console.log(`Successfully wrote to region150-${helpers.capitalizeFirstLetters(region)}.json.`)
      }
    })
  })
}

getLists(regions)
