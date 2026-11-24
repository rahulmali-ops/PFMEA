import type { ProcessPlan, ProcessStation, ProcessOperation } from '../adapters/types'

export type ProcessType =
  | 'Loading / Placement'
  | 'Torquing & Fastening'
  | 'Press Fit'
  | 'Oil / Lubrication'
  | 'Scanning / Traceability'
  | 'Handling / Transfer'
  | 'Inspection / Test'
  | 'Leak Test'
  | 'Oil Fill'
  | 'Assembly / Insertion'
  | 'General Process'

export interface LibraryEntry {
  processType: ProcessType | string
  requirementHint?: string
  failureMode: string
  failureEffect: string
  severity: number
  classification?: string
  cause: string
  occurrence: number
  preventionControl: string
  detectionControl: string
  detection: number
  recommendedAction?: string
  keywords?: string
}

export interface PfmeaRow {
  id: string
  operationSequence: string
  operationDescription: string
  sNo: number
  requirement: string
  processType: string
  failureMode: string
  failureEffect: string
  severity: number
  classification: string
  cause: string
  occurrence: number
  preventionControl: string
  detectionControl: string
  detection: number
  rpn: number
  actionPriority: 'H' | 'M' | 'L'
  recommendedActions: string
  responsibility: string
  actionsTaken: string
  revSeverity: number | ''
  revOccurrence: number | ''
  revDetection: number | ''
  revRpn: number | ''
  source: 'library' | 'ollama' | 'manual'
  stationId: string
  operationId: string
}

export interface GenerateOptions {
  useOllama: boolean
  ollamaModel: string
  includeMoveSteps: boolean
  maxOpsPerStation?: number
}

export interface GenerateContext {
  plan: ProcessPlan
  library: LibraryEntry[]
  options: GenerateOptions
}

export type { ProcessPlan, ProcessStation, ProcessOperation }
