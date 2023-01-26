/* eslint no-useless-escape: 0 */
// This function reads only already-gotten complete lists from each state.
// These can be made by using readeBirdStateDbForSpecies.js, and a new export
// From the eBird database.

const fs = require('fs')
const t = require('../taxonomicSort')
const f = require('../filters')
const csv = require('csv-parse')
const _ = require('lodash')
const parser = csv({
  delimiter: ',',
  record_delimiter: '\n',
  skip_empty_lines: true,
  relax_column_count: true, // this will cause a blow up if removed
  relax: true, // this should allow for the double quotes in individual columns, specifically field notes
  from: 2, // Skip first line
  quote: '"', // this also helps to prevent errors on quotes
  ltrim: true,
  rtrim: true,
  columns: [
    'Common Name',
    'Scientific Name',
    'State',
    'Counts',
    'Every Year',
    'Total Years',
    'Years'
  ]
})

const allRows = {}

async function analyzeFiles () {
  // const file = 'data/NE-species.csv'
  const file = 'WA-species.csv'
  console.log(`Analyzing ${file}.`)
  await runFile(file)
  console.log(`Analyzed ${file}.`)
}

async function runFile (filepath) {
  return new Promise(function (resolve, reject) {
    return fs.createReadStream(filepath)
      .pipe(parser)
      .on('data', (row) => {
        if (!allRows[row['Scientific Name']]) {
          allRows[row['Scientific Name']] = {
            'Common Name': row['Common Name'],
            'Scientific Name': row['Scientific Name']
          }
        }
        allRows[row['Scientific Name']][row.State] = {
          Counts: row.Counts,
          'Every Year': row['Every Year'],
          Years: row.Years.replace(/"/g, '').split(','),
          'Total Years': row['Total Years']
        }
      })
      .on('error', (e) => {
        console.log('BONK', e)
      })
      .on('end', () => {
        // This will (assumedly, sorry future Richard) always be the last state.
        const sorted = t(Object.keys(allRows), 'scientific')
        const sortedcounts = []
        sorted.forEach(taxon => {
          let occurrence = Object.keys(allRows[taxon]).filter(x => x.length === 2)
          if (occurrence.length === 6) {
            occurrence = 'New England'
          } else if (occurrence.length === 5 || occurrence.length === 4) {
            occurrence = allBut(occurrence)
          } else {
            occurrence = '' + occurrence.join(', ')
          }
          const totalCounts = Object.keys(allRows[taxon]).filter(x => x.length === 2)
            .reduce((previousValue, currentValue) => {
              return previousValue + parseInt(allRows[taxon][currentValue].Counts)
            }, 0)
          const counts = Object.keys(allRows[taxon]).filter(x => x.length === 2)
            .map(state => `${state}: ${allRows[taxon][state].Counts}`)
          let everyYear = Object.keys(allRows[taxon]).filter(x => x.length === 2)
            .map(state => {
              return (allRows[taxon][state]['Every Year'] === 'true') ? state : false
            }).filter(x => x)

          function allBut (arr) {
            const states = ['CT', 'MA', 'ME', 'NH', 'RI', 'VT']
            const missing = []
            for (const check in states) {
              if (!arr.includes(states[check])) {
                missing.push(states[check])
              }
            }
            if (missing.length === 1) {
              return `All but ${missing}`
            } else {
              return `All but ${missing.join(' and ')}`
            }
          }

          if (everyYear.length === 6) {
            everyYear = everyYear
              .join(', ')
              .replace(/CT, MA, ME, NH, RI, VT/g, 'New England')
          } else if (everyYear.length === 5 || everyYear.length === 4) {
            everyYear = allBut(everyYear)
          } else if (everyYear.length === 0) {
            everyYear = 'No'
          } else {
            everyYear = everyYear.join(', ')
          }

          let singleRecord = null
          if (totalCounts <= 20) {
            singleRecord = Object.keys(allRows[taxon]).filter(x => x.length === 2)
              .map(state => {
                return allRows[taxon][state].Years.map(y => `${y} (${state})`)
              })
            singleRecord = [...new Set(_.flatten(singleRecord))].sort().join(', ')
          }

          occurrence = `
Records: ${occurrence}.
Every year: ${everyYear}.
Total counts: ${totalCounts}${(singleRecord) ? ', in ' + singleRecord + '.' : '.'}
State counts: ${counts.join(', ')}

`

          if (allRows[taxon].commonName !== 'undefined') {
            sortedcounts.push(`## ${allRows[taxon]['Common Name']} _${taxon}_
${occurrence}`)
          }
        })
        console.log()
        console.log(`Total entries: ${sorted.length}.`)
        console.log(`Without spuhs: ${f.removeSpuh(sorted.map(x => { return { 'Scientific Name': x } })).map(x => x.Subspecies || x['Scientific Name']).length}.`)
        console.log(`Without ssps: ${_.uniq(f.removeSpuh(sorted.map(x => { return { 'Scientific Name': x } })).map(x => x['Scientific Name'])).length}.`)
        console.log(`Only species seen in every state: ${_.uniq(f.removeSpuh(sorted.map(x => { return { 'Scientific Name': x } })).map(x => x['Scientific Name'])).filter(x => Object.keys(allRows[x]).filter(x => x.length === 2).length < 6).length}`)
        console.log(`Only ssps: ${_.uniq(f.removeSpuh(sorted.map(x => { return { 'Scientific Name': x } })).map(x => x.Subspecies)).length}.`)
        console.log(`Only ssps in every state: ${_.uniq(f.removeSpuh(sorted.map(x => { return { 'Scientific Name': x } })).map(x => x.Subspecies)).filter(x => (x) ? Object.keys(allRows[x]).filter(x => x.length === 2).length === 6 : false).length}.`)
        console.log()
        fs.writeFile('data/New England.md', sortedcounts.join('\n'), 'utf8', (err) => {
          if (err) {
            console.log(err)
          } else {
            console.log('File written successfully.')
          }
          resolve()
        })
      })
  })
}

analyzeFiles()
