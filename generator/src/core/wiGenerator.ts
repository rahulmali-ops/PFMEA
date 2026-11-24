import { classifyProcessType, isLikelyMoveOnly } from './processTypeClassifier'
import { wiNumberFromStation } from './controlPlanGenerator'
import type { GenerateOptions, WorkInstruction } from './types'
import type { ProcessPlan } from '../adapters/types'

function uid() {
  return `wi-${Math.random().toString(36).slice(2, 9)}`
}

/** Draft Work Instructions per station from BOP/BOE (AE-H-GB-WI-### style). */
export function generateWorkInstructions(
  plan: ProcessPlan,
  options: GenerateOptions,
): WorkInstruction[] {
  const out: WorkInstruction[] = []

  plan.line.stations.forEach((station, stIdx) => {
    let ops = station.operations
    if (!options.includeMoveSteps) ops = ops.filter((op) => !isLikelyMoveOnly(op.name))
    if (options.maxOpsPerStation) ops = ops.slice(0, options.maxOpsPerStation)

    const docNo = wiNumberFromStation(station.code, stIdx)
    const equipment = station.equipment.map((e) => e.name)

    const steps = ops.map((op, i) => {
      const processType = classifyProcessType(op.name, station.name)
      const tools =
        processType === 'Torquing & Fastening'
          ? 'Torque gun / bits per BOE'
          : processType === 'Press Fit'
            ? 'Press / fixture per BOE'
            : processType === 'Scanning / Traceability'
              ? 'Scanner'
              : equipment[0] || 'Station tooling'
      const qualityCheck =
        processType === 'Torquing & Fastening'
          ? 'Verify torque OK signal (SC)'
          : processType === 'Press Fit'
            ? 'Verify press OK / seating (CC/SC)'
            : processType === 'Leak Test' || processType === 'Inspection / Test'
              ? 'Verify tester OK within limits'
              : 'Visual self-check per SOP'
      return {
        stepNo: i + 1,
        instruction: op.name,
        tools,
        qualityCheck,
        operationId: op.id,
      }
    })

    out.push({
      id: uid(),
      documentNumber: docNo,
      revLevel: '0',
      operationSequence: station.code,
      operationDescription: station.name,
      stationId: station.id,
      partName: plan.line.name,
      drawingNumber: '-',
      equipment,
      steps,
      safetyNotes: 'Wear mandatory PPE; watch pinch points; handle parts carefully; follow ESD rules where applicable.',
      reactionRules:
        'On NG / miss: stop station, place suspect parts in red-bin quarantine, escalate to supervisor immediately.',
    })
  })

  return out
}
