// This entire script is rather silly. You can find it here: https://ebird.org/top100?region=Vermont&locInfo.regionCode=US-VT&year=2022&rankedBy=spp

const data = require('./vt-250-clean.json')
const _ = require('lodash')
// const banding = require('../bandingCodes')
// const fs = require('fs').promises
// const eBird = require('../')

const observerIds = {
  obsr27544: 'Records of Vermont Birds Data',
  obsr160125: 'Jim Mead',
  obsr420405: 'Zac Cota',
  obsr223122: 'Ali Wagner',
  obsr125868: 'Mae Mayville',
  obsr974473: 'Bill Mayville',
  obsr349034: 'Eddy Edwards',
  obsr189783: 'Craig Provost',
  obsr554681: 'Graham Rice',
  obsr447060: 'Cat Abbott',
  obsr358028: 'Clem Nilan',
  obsr436055: 'Cedar Stanistreet',
  obsr179495: 'John Peckham',
  obsr1165223: 'Jacob Crawford',
  obsr1795794: 'Jon D. Erickson'
}

function countYears () {
  console.log(Object.keys(data).length)
  console.log(Object.keys(data))
}

function showObserversForYears () {
  Object.keys(data).forEach(year => {
    console.log('')
    console.log(year + ':')
    Object.keys(data[year]).forEach(o => {
      console.log(observerIds[o])
    })
  })
}

function getObservers() {
  const observers = []
  Object.keys(data).forEach(year => {
    Object.keys(data[year]).forEach(o => {
      if (!observers.includes(o)) {
        observers.push(o)

        // Use this if you want to get the checklists
        observerIds[o] = data[year][o].sampleChecklistId
      }
    })
  })
}

async function readData () {
  // countYears()
  showObserversForYears()
  getObservers()
}

readData()
