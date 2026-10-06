import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import csvStream from '../shimeBirdData/csvStream.js'

const read = async (text, opts) => {
  const rows = []
  for await (const row of Readable.from([text]).pipe(csvStream(opts))) rows.push(row)
  return rows
}

test('csvStream skips the header and blank lines, and keys rows by columns', async () => {
  const rows = await read('Name,State\nMallard , VT\n\n"Brant, Atlantic",NH\n', { columns: ['Common Name', 'State'] })
  assert.deepEqual(rows, [
    { 'Common Name': 'Mallard', State: 'VT' },
    { 'Common Name': 'Brant, Atlantic', State: 'NH' }
  ])
})

test('csvStream reads unquoted TSV with stray quotes, and fills short rows', async () => {
  const rows = await read('A\tB\tC\n"Singing\tx\n', { columns: ['A', 'B', 'C'], delimiter: '\t', quoteChar: '\u0000' })
  assert.deepEqual(rows, [{ A: '"Singing', B: 'x', C: '' }])
})
