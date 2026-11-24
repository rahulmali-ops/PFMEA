import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Use dynamic import of compiled path via vite-node alternative: duplicate light parse in node with pdfjs
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  '../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).toString()

function parseBopBoeText(text, fileName, kindLabel) {
  const warnings = []
  const loose = text
    .replace(/\r/g, '')
    .replace(/(?=STATION:)/gi, '\n')
    .replace(/(?=EQUIPMENT:)/gi, '\n')
    .replace(/(?=OP:)/gi, '\n')
    .replace(/(?=LINE:)/gi, '\n')
    .replace(/(?=AREA:)/gi, '\n')
  const lines = loose.split('\n').map((l) => l.trim()).filter(Boolean)
  const stations = []
  let current = null
  let lineName = 'Process Line'
  let areaName
  for (const line of lines) {
    const area = line.match(/^AREA:\s*(.+)$/i)
    if (area) { areaName = area[1].trim(); continue }
    const ln = line.match(/^LINE:\s*(.+)$/i)
    if (ln) { lineName = ln[1].trim(); continue }
    const st = line.match(/^STATION:\s*(.+)$/i)
    if (st) {
      current = { name: st[1].trim(), ops: [], eq: [] }
      stations.push(current)
      continue
    }
    const eq = line.match(/^EQUIPMENT:\s*(.+)$/i)
    if (eq && current) { current.eq.push(eq[1].trim()); continue }
    const op = line.match(/^OP(?:\s*\d*)?:\s*(.+)$/i)
    if (op && current) { current.ops.push(op[1].trim()); continue }
  }
  if (!stations.length) warnings.push('no stations')
  return { fileName, kindLabel, lineName, areaName, stations, warnings }
}

async function extract(path) {
  const data = new Uint8Array(readFileSync(path))
  const doc = await pdfjs.getDocument({ data }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n'
  }
  return text
}

const bopText = await extract('./public/samples/sample-bop.pdf')
const boeText = await extract('./public/samples/sample-boe.pdf')
const bop = parseBopBoeText(bopText, 'sample-bop.pdf', 'BOP')
const boe = parseBopBoeText(boeText, 'sample-boe.pdf', 'BOE')
console.log(JSON.stringify({
  bopStations: bop.stations.length,
  bopOps: bop.stations.reduce((n, s) => n + s.ops.length, 0),
  boeStations: boe.stations.length,
  boeEq: boe.stations.reduce((n, s) => n + s.eq.length, 0),
  sample: bop.stations.slice(0, 2).map((s) => ({ name: s.name, ops: s.ops.length })),
  warnings: [...bop.warnings, ...boe.warnings],
}, null, 2))
