import * as pdfjs from 'pdfjs-dist'
import type {
  ProcessEquipment,
  ProcessInputAdapter,
  ProcessLine,
  ProcessOperation,
  ProcessPlan,
  ProcessStation,
} from './types'

// Vite-friendly worker
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

function stationCode(name: string): string {
  const m = name.match(/\b(GA\s*\d+|TSA\s*\d+|OP\s*\d+|STN\s*\d+)\b/i)
  if (m) return m[1].replace(/\s+/g, '').toUpperCase()
  return name.split(/[\s-]+/).slice(0, 2).join('').toUpperCase().slice(0, 12) || 'STN'
}

function makeId(prefix: string, n: number) {
  return `${prefix}${String(n).padStart(5, '0')}`
}

/** Extract plain text from a PDF (digital text layer). Scanned PDFs need OCR. */
export async function extractPdfText(buf: ArrayBuffer): Promise<{ text: string; pageCount: number }> {
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
    parts.push(line)
  }
  return { text: parts.join('\n'), pageCount: doc.numPages }
}

/**
 * Parse BOP/BOE-style PDF text into ProcessPlan.
 * Expects lines like:
 *   STATION: GA 10 - OIL BOLT ASSEMBLY
 *   EQUIPMENT: MACHINE GB 10
 *   OP: PICK GEAR CASE RH ...
 * Combined BOP+BOE PDFs are supported (same markers).
 */
export function parseBopBoeText(text: string, fileName: string, kindLabel: string): ProcessPlan {
  const warnings: string[] = []
  const normalized = text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')

  // Also split on markers if PDF text extraction collapsed newlines
  const loose = normalized
    .replace(/(?=STATION:)/gi, '\n')
    .replace(/(?=EQUIPMENT:)/gi, '\n')
    .replace(/(?=OP:)/gi, '\n')
    .replace(/(?=LINE:)/gi, '\n')
    .replace(/(?=AREA:)/gi, '\n')
    .replace(/(?=PART:)/gi, '\n')

  const lines = loose.split('\n').map((l) => l.trim()).filter(Boolean)

  let areaName: string | undefined
  let lineName = 'Process Line'
  let lineId = 'LINE001'
  const stations: ProcessStation[] = []
  let current: ProcessStation | null = null
  let stnSeq = 0
  let opSeq = 0
  let eqSeq = 0

  const pushStation = (name: string) => {
    stnSeq++
    current = {
      id: makeId('PS', stnSeq),
      code: stationCode(name),
      name: name.trim(),
      operations: [],
      equipment: [],
    }
    stations.push(current)
  }

  for (const line of lines) {
    const area = line.match(/^AREA:\s*(.+)$/i)
    if (area) {
      areaName = area[1].trim()
      continue
    }
    const ln = line.match(/^LINE:\s*(.+)$/i)
    if (ln) {
      lineName = ln[1].trim()
      continue
    }
    const st = line.match(/^STATION:\s*(.+)$/i)
    if (st) {
      pushStation(st[1])
      continue
    }
    // Alternate: "GA 10 - DESC" as station header without marker
    const altSt = line.match(/^(GA\s*\d+|TSA\s*\d+)\s*[-–:]\s*(.+)$/i)
    if (altSt && !/^OP:/i.test(line) && !/^EQUIPMENT:/i.test(line)) {
      pushStation(`${altSt[1].toUpperCase().replace(/\s+/g, ' ')} - ${altSt[2].trim()}`)
      continue
    }
    const eq = line.match(/^EQUIPMENT:\s*(.+)$/i)
    if (eq) {
      if (!current) pushStation('UNSPECIFIED STATION')
      eqSeq++
      const equipment: ProcessEquipment = {
        id: makeId('AI', eqSeq),
        name: eq[1].trim(),
        kind: /machine/i.test(eq[1]) ? 'machine' : 'other',
      }
      current!.equipment.push(equipment)
      continue
    }
    const op = line.match(/^OP(?:\s*\d*)?:\s*(.+)$/i)
    if (op) {
      if (!current) pushStation('UNSPECIFIED STATION')
      opSeq++
      const operation: ProcessOperation = {
        id: makeId('AT', opSeq),
        name: op[1].trim(),
        parts: [],
      }
      current!.operations.push(operation)
      continue
    }
    const part = line.match(/^PART:\s*(.+)$/i)
    if (part && current && current.operations.length) {
      const last = current.operations[current.operations.length - 1]
      last.parts.push({ id: `PT${last.parts.length + 1}`, name: part[1].trim() })
    }
  }

  // Fallback: numbered list under vague headers
  if (!stations.length) {
    warnings.push(
      'No STATION:/OP: markers found. Tried free-text heuristics; structure may be incomplete. Prefer digital (not scanned) PDFs with the sample template markers.',
    )
    const heuristicOps = text
      .split(/\n|(?=\d+\.\s)/)
      .map((s) => s.trim())
      .filter((s) => /^\d+\.\s+/.test(s) || /^(PICK|PLACE|TORQUE|PRESS|SCAN|MOVE|APPLY|INSERT|ASSEMBLE)\b/i.test(s))
      .slice(0, 40)
    if (heuristicOps.length) {
      pushStation('GA 10 - PARSED OPERATIONS')
      for (const raw of heuristicOps) {
        opSeq++
        current!.operations.push({
          id: makeId('AT', opSeq),
          name: raw.replace(/^\d+\.\s*/, ''),
          parts: [],
        })
      }
    } else {
      warnings.push(
        'Could not extract operations. If this PDF is scanned/image-only, run OCR first or use the sample digital PDFs.',
      )
    }
  }

  const emptyOps = stations.filter((s) => !s.operations.length)
  // BOE sheets often have equipment only — don't warn unless this is a BOP/combined parse
  if (emptyOps.length && !/BOE/i.test(kindLabel)) {
    warnings.push(`${emptyOps.length} station(s) had no OP: lines — check BOP content.`)
  }

  const line: ProcessLine = {
    id: lineId,
    name: lineName,
    areaName,
    stations,
  }

  return {
    source: 'pdf',
    sourceLabel: `${kindLabel}: ${fileName}`,
    line,
    parsedAt: new Date().toISOString(),
    warnings,
  }
}

function mergePlans(bop: ProcessPlan, boe: ProcessPlan): ProcessPlan {
  const warnings = [...bop.warnings, ...boe.warnings]
  const byCode = new Map(bop.line.stations.map((s) => [s.code, { ...s, operations: [...s.operations], equipment: [...s.equipment] }]))

  for (const st of boe.line.stations) {
    const existing = byCode.get(st.code)
    if (existing) {
      for (const eq of st.equipment) {
        if (!existing.equipment.some((e) => e.name === eq.name)) existing.equipment.push(eq)
      }
      // BOE-only ops rare; merge unique ops
      for (const op of st.operations) {
        if (!existing.operations.some((o) => o.name === op.name)) existing.operations.push(op)
      }
    } else {
      byCode.set(st.code, { ...st, operations: [...st.operations], equipment: [...st.equipment] })
    }
  }

  // If BOE has equipment without stations matching codes, attach by order
  if (boe.line.stations.length === 1 && bop.line.stations.length && boe.line.stations[0].code === 'STN') {
    const eqOnly = boe.line.stations[0]
    bop.line.stations.forEach((st, i) => {
      const target = byCode.get(st.code)
      if (!target) return
      const eq = eqOnly.equipment[i]
      if (eq && !target.equipment.some((e) => e.name === eq.name)) target.equipment.push(eq)
    })
  }

  return {
    source: 'pdf',
    sourceLabel: `BOP+BOE PDF (${bop.sourceLabel} + ${boe.sourceLabel})`,
    line: {
      id: bop.line.id,
      name: bop.line.name || boe.line.name,
      areaName: bop.line.areaName || boe.line.areaName,
      stations: [...byCode.values()],
    },
    parsedAt: new Date().toISOString(),
    warnings,
  }
}

export const pdfBopAdapter: ProcessInputAdapter = {
  kind: 'pdf',
  label: 'BOP PDF',
  async parse(input, fileName = 'bop.pdf') {
    const { text, pageCount } = await extractPdfText(input as ArrayBuffer)
    const plan = parseBopBoeText(text, fileName, 'BOP PDF')
    if (!text.trim()) {
      plan.warnings.push('No extractable text — PDF may be scanned. OCR required.')
    } else if (pageCount === 0) {
      plan.warnings.push('PDF reported 0 pages')
    }
    return plan
  },
}

export const pdfBoeAdapter: ProcessInputAdapter = {
  kind: 'pdf',
  label: 'BOE PDF',
  async parse(input, fileName = 'boe.pdf') {
    const { text } = await extractPdfText(input as ArrayBuffer)
    return parseBopBoeText(text, fileName, 'BOE PDF')
  },
}

export async function parseBopBoePdfs(opts: {
  bop?: File | null
  boe?: File | null
  combined?: File | null
}): Promise<ProcessPlan> {
  if (opts.combined) {
    const buf = await opts.combined.arrayBuffer()
    const { text } = await extractPdfText(buf)
    return parseBopBoeText(text, opts.combined.name, 'Combined BOP/BOE PDF')
  }
  if (opts.bop && opts.boe) {
    const [bopPlan, boePlan] = await Promise.all([
      pdfBopAdapter.parse(await opts.bop.arrayBuffer(), opts.bop.name),
      pdfBoeAdapter.parse(await opts.boe.arrayBuffer(), opts.boe.name),
    ])
    return mergePlans(bopPlan, boePlan)
  }
  if (opts.bop) {
    return pdfBopAdapter.parse(await opts.bop.arrayBuffer(), opts.bop.name)
  }
  if (opts.boe) {
    return pdfBoeAdapter.parse(await opts.boe.arrayBuffer(), opts.boe.name)
  }
  throw new Error('Upload a BOP PDF, BOE PDF, or combined PDF')
}
