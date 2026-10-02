// File reading and writing for the library. The website bundles index.js for
// the browser, so the library never imports Node's fs itself: it loads this
// module, with import('./io.js'), only when it's given a file path or an
// output file, which only happens in Node.

import { promises as fs, createReadStream } from 'node:fs'
import Papa from 'papaparse'
import * as ebd from './ebd.js'

// The first bytes of a file: enough to see its header line
async function readHead (file) {
  const handle = await fs.open(file)
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(4096), 0, 4096, 0)
    return buffer.toString('utf8', 0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function isEBDFile (file) {
  return ebd.isEBDHeader(await readHead(file))
}

// Stream an EBD file a row at a time: a statewide download is hundreds of MB,
// too big to hold whole. Rows are renamed to MyEBirdData columns, kept if
// keepRow(row) says so, and shared checklists are collapsed.
function readEBDFile (file, keepRow = () => true) {
  return new Promise((resolve, reject) => {
    const rows = []
    Papa.parse(createReadStream(file, 'utf8'), {
      ...ebd.EBD_PARSE_OPTIONS,
      step: ({ data }) => {
        if (!ebd.isEBDRows([data])) return
        const row = ebd.fromEBDRow(data)
        if (keepRow(row)) rows.push(row)
      },
      complete: () => resolve(ebd.collapseSharedChecklists(rows)),
      error: reject
    })
  })
}

// A text file, without the UTF-8 BOM that spreadsheet-resaved exports have
// (Papa would keep it on the first header)
async function readText (file) {
  return (await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')
}

async function readJSON (file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function writeFile (file, text) {
  await fs.writeFile(file, text, 'utf8')
}

export {
  readHead,
  isEBDFile,
  readEBDFile,
  readText,
  readJSON,
  writeFile
}
