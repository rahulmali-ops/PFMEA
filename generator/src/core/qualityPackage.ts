import { generateControlPlan } from './controlPlanGenerator'
import { generatePfmea } from './generator'
import { generateWorkInstructions } from './wiGenerator'
import type {
  ChangeLogEntry,
  ControlPlanRow,
  GenerateContext,
  PfmeaRow,
  WorkInstruction,
} from './types'

export interface QualityPackage {
  pfmea: PfmeaRow[]
  controlPlan: ControlPlanRow[]
  workInstructions: WorkInstruction[]
  stats: {
    stations: number
    operations: number
    pfmeaRows: number
    controlPlanRows: number
    wiCount: number
    ollamaUsed: boolean
  }
}

/** Phase 1A: BOP/BOE → PFMEA (+ CP + WI drafts) from one ProcessPlan. */
export async function generateQualityPackage(ctx: GenerateContext): Promise<QualityPackage> {
  const pfmeaResult = await generatePfmea(ctx)
  const controlPlan = ctx.options.generateControlPlan
    ? generateControlPlan(ctx.plan, ctx.options, pfmeaResult.rows)
    : []
  const workInstructions = ctx.options.generateWorkInstructions
    ? generateWorkInstructions(ctx.plan, ctx.options)
    : []

  return {
    pfmea: pfmeaResult.rows,
    controlPlan,
    workInstructions,
    stats: {
      stations: pfmeaResult.stats.stations,
      operations: pfmeaResult.stats.operations,
      pfmeaRows: pfmeaResult.stats.rows,
      controlPlanRows: controlPlan.length,
      wiCount: workInstructions.length,
      ollamaUsed: pfmeaResult.stats.ollamaUsed,
    },
  }
}

export function logChange(
  log: ChangeLogEntry[],
  entry: Omit<ChangeLogEntry, 'id' | 'at' | 'approvalStatus'> & {
    approvalStatus?: ChangeLogEntry['approvalStatus']
  },
): ChangeLogEntry[] {
  return [
    {
      id: `chg-${Math.random().toString(36).slice(2, 9)}`,
      at: new Date().toISOString(),
      approvalStatus: entry.approvalStatus || 'draft',
      who: entry.who,
      where: entry.where,
      field: entry.field,
      before: entry.before,
      after: entry.after,
    },
    ...log,
  ].slice(0, 200)
}
