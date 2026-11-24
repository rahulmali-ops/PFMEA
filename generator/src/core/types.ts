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

/** Control Plan row — aligned to AE VL CP columns (simplified for MVP). */
export interface ControlPlanRow {
  id: string
  operationSequence: string
  operationDescription: string
  wiNumber: string
  equipment: string
  slNo: number
  productCharacteristic: string
  processCharacteristic: string
  specialClass: string
  specification: string
  evaluationMethod: string
  sampleSize: string
  frequency: string
  responsibility: string
  capability: string
  controlMethod: string
  reactionPlan: string
  stationId: string
  operationId: string
}

/** Work Instruction draft per station. */
export interface WorkInstruction {
  id: string
  documentNumber: string
  revLevel: string
  operationSequence: string
  operationDescription: string
  stationId: string
  partName: string
  drawingNumber: string
  equipment: string[]
  steps: {
    stepNo: number
    instruction: string
    tools: string
    qualityCheck: string
    operationId: string
  }[]
  safetyNotes: string
  reactionRules: string
}

export interface ChangeLogEntry {
  id: string
  at: string
  who: string
  where: string
  field: string
  before: string
  after: string
  approvalStatus: 'draft' | 'pending' | 'approved'
}

export interface GenerateOptions {
  useOllama: boolean
  ollamaModel: string
  includeMoveSteps: boolean
  maxOpsPerStation?: number
  generateControlPlan: boolean
  generateWorkInstructions: boolean
}

export interface GenerateContext {
  plan: ProcessPlan
  library: LibraryEntry[]
  options: GenerateOptions
}

export type { ProcessPlan, ProcessStation, ProcessOperation }
