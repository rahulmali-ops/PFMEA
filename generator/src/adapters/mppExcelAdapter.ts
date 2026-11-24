import * as XLSX from 'xlsx'
import type {
  ProcessEquipment,
  ProcessInputAdapter,
  ProcessLine,
  ProcessOperation,
  ProcessPart,
  ProcessPlan,
  ProcessStation,
} from './types'

type RawRow = {
  level: number
  name: string
  type: string
  id: string
  revision?: string
  makeOrBuy?: string
  quantity?: number
  parent?: string
  cycleTime?: number
  headCount?: string
  taktTime?: number
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function cellNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function extractName(row: Record<string, unknown>): string {
  // Teamcenter export puts names in B/C/D/E by hierarchy depth
  for (const key of ['B', 'C', 'D', 'E', '__name']) {
    const v = cellStr(row[key])
    if (v) return v
  }
  // Fallback: scan lettered columns before Type (G)
  for (const col of Object.keys(row)) {
    if (/^[B-F]$/.test(col) && cellStr(row[col])) return cellStr(row[col])
  }
  return ''
}

function parentId(parent: string | undefined): string | undefined {
  if (!parent) return undefined
  // e.g. PS00003903/01;1-GA 10 - OIL BOLT ASSEMBLY x 1
  const m = parent.match(/^([A-Z]{2}\d+)/i)
  return m ? m[1] : parent.split('/')[0]
}

function stationCode(name: string): string {
  const m = name.match(/\b(GA\s*\d+|TSA\s*\d+|OP\s*\d+)\b/i)
  if (m) return m[1].replace(/\s+/g, '').toUpperCase()
  // Short code from leading tokens
  const tokens = name.split(/[\s-]+/).filter(Boolean)
  return tokens.slice(0, 2).join(' ').toUpperCase().slice(0, 24) || 'STN'
}

function isStationType(t: string) {
  return /proc\s*stn/i.test(t) || /station/i.test(t)
}
function isOpType(t: string) {
  return /opn\s*revision/i.test(t) || /^ather opn/i.test(t) || /operation/i.test(t)
}
function isMachineType(t: string) {
  return /machine\s*revision/i.test(t) || /^machine\b/i.test(t)
}
function isResourceType(t: string) {
  return /proc\s*res/i.test(t)
}
function isPartType(t: string) {
  return /mechanical/i.test(t)
}
function isLineType(t: string) {
  return /proc\s*line/i.test(t)
}
function isAreaType(t: string) {
  return /proc\s*area/i.test(t)
}

function sheetToObjects(wb: XLSX.WorkBook): { rows: RawRow[]; warnings: string[] } {
  const warnings: string[] = []
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    warnings.push('Workbook has no sheets')
    return { rows: [], warnings }
  }
  const sheet = wb.Sheets[sheetName]

  // Find header row containing Level + Type + ID
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown as unknown[][]

  let headerIdx = -1
  let headers: string[] = []
  for (let i = 0; i < Math.min(matrix.length, 30); i++) {
    const row = (matrix[i] || []).map((c) => cellStr(c).toLowerCase())
    if (row.includes('level') && row.includes('type') && row.includes('id')) {
      headerIdx = i
      headers = (matrix[i] || []).map((c, idx) => {
        const h = cellStr(c)
        if (h) return h
        return XLSX.utils.encode_col(idx)
      })
      break
    }
  }

  if (headerIdx < 0) {
    warnings.push('Could not find Teamcenter header row (Level / Type / ID). Using column letters.')
    // Fallback assume row 5 (0-index 4) style export
    headerIdx = 4
    headers = ['Level', 'B', 'C', 'D', 'E', 'F', 'Type', 'ID', 'Revision ID', 'Make or Buy', 'Quantity', 'Parent', 'Takt time', 'Head Count', 'Cycle time']
  }

  const colIndex = (names: string[]) => {
    const lower = headers.map((h) => h.toLowerCase())
    for (const n of names) {
      const i = lower.indexOf(n.toLowerCase())
      if (i >= 0) return i
    }
    return -1
  }

  const iLevel = colIndex(['Level'])
  const iType = colIndex(['Type'])
  const iId = colIndex(['ID'])
  const iRev = colIndex(['Revision ID', 'Revision'])
  const iMob = colIndex(['Make or Buy'])
  const iQty = colIndex(['Quantity'])
  const iParent = colIndex(['Parent'])
  const iTakt = colIndex(['Takt time'])
  const iHead = colIndex(['Head Count'])
  const iCycle = colIndex(['Cycle time'])

  const rows: RawRow[] = []
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const raw = matrix[r] || []
    const type = cellStr(iType >= 0 ? raw[iType] : raw[6])
    const id = cellStr(iId >= 0 ? raw[iId] : raw[7])
    if (!type && !id) continue

    const obj: Record<string, unknown> = {}
    raw.forEach((v, idx) => {
      obj[XLSX.utils.encode_col(idx)] = v
    })
    const name = extractName(obj)
    if (!name && !id) continue

    rows.push({
      level: cellNum(iLevel >= 0 ? raw[iLevel] : raw[0]) ?? 0,
      name,
      type,
      id,
      revision: cellStr(iRev >= 0 ? raw[iRev] : raw[8]) || undefined,
      makeOrBuy: cellStr(iMob >= 0 ? raw[iMob] : '') || undefined,
      quantity: cellNum(iQty >= 0 ? raw[iQty] : undefined),
      parent: cellStr(iParent >= 0 ? raw[iParent] : '') || undefined,
      taktTime: cellNum(iTakt >= 0 ? raw[iTakt] : undefined),
      headCount: cellStr(iHead >= 0 ? raw[iHead] : '') || undefined,
      cycleTime: cellNum(iCycle >= 0 ? raw[iCycle] : undefined),
    })
  }

  if (!rows.length) warnings.push('No process rows found in MPP sheet')
  return { rows, warnings }
}

function buildPlan(rows: RawRow[], fileName: string, warnings: string[]): ProcessPlan {
  let areaName: string | undefined
  let lineMeta: { id: string; name: string; taktTime?: number } | null = null

  const stations: ProcessStation[] = []
  const stationById = new Map<string, ProcessStation>()
  const opById = new Map<string, ProcessOperation & { stationId: string }>()

  for (const row of rows) {
    if (isAreaType(row.type)) {
      areaName = row.name
      continue
    }
    if (isLineType(row.type)) {
      lineMeta = { id: row.id, name: row.name, taktTime: row.taktTime ?? row.cycleTime }
      continue
    }
    if (isStationType(row.type)) {
      const st: ProcessStation = {
        id: row.id,
        code: stationCode(row.name),
        name: row.name,
        revision: row.revision,
        cycleTime: row.cycleTime,
        headCount: row.headCount,
        operations: [],
        equipment: [],
      }
      stations.push(st)
      stationById.set(row.id, st)
      continue
    }
  }

  // Second pass: attach ops / equipment / parts under stations
  let currentStationId: string | undefined
  for (const row of rows) {
    if (isStationType(row.type)) {
      currentStationId = row.id
      continue
    }
    const pId = parentId(row.parent) || currentStationId
    const station = (pId && stationById.get(pId)) || (currentStationId ? stationById.get(currentStationId) : undefined)

    if (isOpType(row.type)) {
      const op: ProcessOperation = {
        id: row.id,
        name: row.name,
        revision: row.revision,
        cycleTime: row.cycleTime,
        parts: [],
      }
      if (station) {
        station.operations.push(op)
        opById.set(row.id, { ...op, stationId: station.id })
      } else {
        warnings.push(`Operation "${row.name}" has no parent station`)
      }
      continue
    }

    if (isMachineType(row.type) || isResourceType(row.type)) {
      const eq: ProcessEquipment = {
        id: row.id,
        name: row.name,
        kind: isMachineType(row.type) ? 'machine' : 'resource',
        revision: row.revision,
      }
      if (station) station.equipment.push(eq)
      continue
    }

    if (isPartType(row.type)) {
      const part: ProcessPart = {
        id: row.id,
        name: row.name,
        revision: row.revision,
        makeOrBuy: row.makeOrBuy,
        quantity: row.quantity,
      }
      const opParent = parentId(row.parent)
      const op = opParent ? opById.get(opParent) : undefined
      if (op) {
        op.parts.push(part)
      } else if (station && station.operations.length) {
        // orphan part under station → attach to last op
        station.operations[station.operations.length - 1].parts.push(part)
      }
    }
  }

  if (!stations.length) {
    warnings.push('No stations (Proc Stn) found — check that this is a Teamcenter MPP BOP/BOE export')
  }

  const line: ProcessLine = {
    id: lineMeta?.id || 'LINE',
    name: lineMeta?.name || 'Process Line',
    areaName,
    taktTime: lineMeta?.taktTime,
    stations,
  }

  return {
    source: 'mpp-excel',
    sourceLabel: fileName || 'MPP BOP/BOE Excel',
    line,
    parsedAt: new Date().toISOString(),
    warnings,
  }
}

export const mppExcelAdapter: ProcessInputAdapter = {
  kind: 'mpp-excel',
  label: 'Teamcenter MPP Excel (BOP + BOE)',
  async parse(input: ArrayBuffer | unknown, fileName = 'upload.xlsx'): Promise<ProcessPlan> {
    const buf = input as ArrayBuffer
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const { rows, warnings } = sheetToObjects(wb)
    return buildPlan(rows, fileName, warnings)
  },
}

export async function parseMppExcelFile(file: File): Promise<ProcessPlan> {
  const buf = await file.arrayBuffer()
  return mppExcelAdapter.parse(buf, file.name)
}
