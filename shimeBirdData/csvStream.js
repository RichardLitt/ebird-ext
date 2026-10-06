// A stream for .pipe(): CSV or TSV text in, one object per row out, keyed by
// columns. Skips the header line and blank lines, and trims each field.
// Each call makes a new stream; a stream can only be read once.
import { compose, Transform } from 'node:stream'
import Papa from 'papaparse'

export default function csvStream ({ columns, delimiter = ',', quoteChar = '"' }) {
  let header = true
  return compose(
    Papa.parse(Papa.NODE_STREAM_INPUT, { delimiter, quoteChar, skipEmptyLines: true }),
    new Transform({
      objectMode: true,
      transform (fields, _encoding, done) {
        if (header) {
          header = false
          return done()
        }
        done(null, Object.fromEntries(columns.map((column, i) => [column, (fields[i] ?? '').trim()])))
      }
    })
  )
}
