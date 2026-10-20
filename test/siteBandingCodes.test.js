import test from 'node:test'
import assert from 'node:assert/strict'
import SiteCodes from '../data/siteBandingCodes.json' with { type: 'json' }
import FullCodes from '../data/ibpAlphaCodes2021.json' with { type: 'json' }
import { siteCodes, currentData } from '../scripts/updateSiteCodes.js'

// The site builds with data/siteBandingCodes.json in place of the full table
// (see scripts/updateSiteCodes.js), so it must cover every code in the data.

test('siteBandingCodes.json is up to date: run node scripts/updateSiteCodes.js', async () => {
  assert.deepEqual(SiteCodes, siteCodes(await currentData()))
})

test('siteBandingCodes.json entries match the full table', () => {
  const full = new Map(FullCodes.map(x => [x.alpha, x]))
  for (const entry of SiteCodes) {
    const { alpha, common_name: commonName, scientific_name: scientificName } = full.get(entry.alpha)
    assert.deepEqual(entry, { alpha, common_name: commonName, scientific_name: scientificName })
  }
})

test('siteCodes keeps listed codes and Vermont taxa, in table order, with three fields', () => {
  const table = [
    { alpha: 'AMRO', common_name: 'American Robin', scientific_name: 'Turdus migratorius', a6: 'TURMIG' },
    { alpha: 'BLJA', common_name: 'Blue Jay', scientific_name: 'Cyanocitta cristata' },
    { alpha: 'HITI', common_name: 'Highland Tinamou', scientific_name: 'Nothocercus bonapartei' },
    { alpha: 'SNBU', common_name: 'Snow Bunting', scientific_name: 'Plectrophenax nivalis' }
  ]
  const result = siteCodes({
    lists: [{ MONTPELIER: ['SNBU'] }],
    grid: { species: ['AMRO'] },
    taxonomy: [{ PRIMARY_COM_NAME: 'Blue Jay' }, { PRIMARY_COM_NAME: 'Blue Jay x Robin (hybrid)' }],
    table
  })
  assert.deepEqual(result.map(x => x.alpha), ['AMRO', 'BLJA', 'SNBU'])
  assert.deepEqual(Object.keys(result[0]), ['alpha', 'common_name', 'scientific_name'])
})
