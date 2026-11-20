import test from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import TownInfo from '../data/vt_town_info.json' with { type: 'json' }
import TownBoundaries from '../geojson/vt_towns.json' with { type: 'json' }
import { townInfo } from '../scripts/updateTownInfo.js'
import { isSpeciesSightingRare } from '../rarity.js'
import * as index from '../index.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// isSpeciesSightingRare reads each town's county and region from
// data/vt_town_info.json instead of the boundaries (see scripts/updateTownInfo.js).

test('vt_town_info.json is up to date: run node scripts/updateTownInfo.js', () => {
  assert.deepEqual(TownInfo, townInfo())
})

test('vt_town_info.json has every town, each with a county and a region', () => {
  assert.deepEqual(Object.keys(TownInfo).sort(), TownBoundaries.features.map(x => x.properties.town).sort())
  for (const [town, info] of Object.entries(TownInfo)) {
    assert.ok(info.county, `${town} has no county`)
    assert.ok(info.region, `${town} has no region`)
  }
})

// The site loads rarity.js for its single-sighting checker so that it doesn't
// download the town and region boundaries (over 1 MB). Follow its local
// imports and make sure none of them reaches them.
test('rarity.js does not import the boundaries, filters.js or index.js', async () => {
  const seen = new Set()
  async function visit (file) {
    if (seen.has(file)) return
    seen.add(file)
    if (!file.endsWith('.js')) return
    const source = await fs.readFile(path.join(root, file), 'utf8')
    for (const [, spec] of source.matchAll(/^import\s[^'"]*['"](\.[^'"]+)['"]/gm)) {
      await visit(path.normalize(path.join(path.dirname(file), spec)))
    }
  }
  await visit('rarity.js')
  const heavy = [...seen].filter(file => file.startsWith('geojson') || ['filters.js', 'index.js'].includes(file))
  assert.deepEqual(heavy, [])
})

test('index.js re-exports the same isSpeciesSightingRare', () => {
  assert.equal(index.isSpeciesSightingRare, isSpeciesSightingRare)
  assert.equal(index.default.isSpeciesSightingRare, isSpeciesSightingRare)
})

test('isSpeciesSightingRare: the town table gives the region the Champlain rule needs', async () => {
  // Harlequin Duck is reported outside the Champlain Valley
  const inValley = await isSpeciesSightingRare({ species: 'Harlequin Duck', town: 'Burlington', date: '2024-01-15' })
  const outside = await isSpeciesSightingRare({ species: 'Harlequin Duck', town: 'Montpelier', date: '2024-01-15' })
  assert.equal(inValley.Champlain.length, 0)
  assert.equal(outside.Champlain.length, 1)
})

test('isSpeciesSightingRare finds towns with apostrophes and periods', async () => {
  for (const town of ["Buel's Gore", 'St. Albans City']) {
    const opts = { species: 'Garganey', town, date: '2024-01-15' }
    await isSpeciesSightingRare(opts)
    assert.ok(opts.data[0].County && opts.data[0].Region, town)
  }
})
