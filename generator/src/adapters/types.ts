/** Canonical process model used by the PFMEA generator (source-agnostic). */

export type ProcessSourceKind = 'mpp-excel' | 'pdf' | 'api' | 'manual'

export interface ProcessPart {
  id: string
  name: string
  revision?: string
  makeOrBuy?: string
  quantity?: number
}

export interface ProcessOperation {
  id: string
  name: string
  revision?: string
  cycleTime?: number
  parts: ProcessPart[]
}

export interface ProcessEquipment {
  id: string
  name: string
  kind: 'machine' | 'resource' | 'other'
  revision?: string
}

export interface ProcessStation {
  id: string
  code: string
  name: string
  revision?: string
  cycleTime?: number
  headCount?: string
  operations: ProcessOperation[]
  equipment: ProcessEquipment[]
}

export interface ProcessLine {
  id: string
  name: string
  areaName?: string
  taktTime?: number
  stations: ProcessStation[]
}

export interface ProcessPlan {
  source: ProcessSourceKind
  sourceLabel: string
  line: ProcessLine
  parsedAt: string
  warnings: string[]
}

/**
 * Input adapter contract.
 * Today: Teamcenter MPP Excel (BOP+BOE).
 * Later: PDF parsers, live MPP/Teamcenter API — same ProcessPlan out.
 */
export interface ProcessInputAdapter {
  readonly kind: ProcessSourceKind
  readonly label: string
  parse(input: ArrayBuffer | unknown, fileName?: string): Promise<ProcessPlan>
}
