import { classifyProcessType, isLikelyMoveOnly, requirementFromOperation } from './processTypeClassifier'
import type { ControlPlanRow, GenerateOptions, PfmeaRow } from './types'
import type { ProcessPlan } from '../adapters/types'

function uid() {
  return `cp-${Math.random().toString(36).slice(2, 9)}`
}

/** Match plant WI nomenclature e.g. AE-H-GB-WI-010 for GA 10. */
export function wiNumberFromStation(code: string, stationIndex: number) {
  const m = code.match(/(\d+)/)
  const n = m ? Number(m[1]) : (stationIndex + 1) * 10
  return `AE-H-GB-WI-${String(n).padStart(3, '0')}`
}

function defaultsForType(processType: string): {
  evaluation: string
  controlMethod: string
  reaction: string
  specialClass: string
  specification: string
} {
  switch (processType) {
    case 'Torquing & Fastening':
      return {
        evaluation: 'Torque tool / MES OK-NG',
        controlMethod: 'Torque program interlock',
        reaction: 'Stop station; quarantine part; inform supervisor',
        specialClass: 'SC',
        specification: 'Per torque strategy / drawing',
      }
    case 'Press Fit':
      return {
        evaluation: 'Press force/stroke monitor',
        controlMethod: 'Press curve OK/NG interlock',
        reaction: 'Stop station; quarantine; inform supervisor',
        specialClass: 'CC',
        specification: 'Force & stroke window per process sheet',
      }
    case 'Leak Test':
      return {
        evaluation: 'Leak tester',
        controlMethod: 'Tester OK/NG interlock',
        reaction: 'Hold unit; retest; inform supervisor',
        specialClass: 'CC',
        specification: 'Leak rate within master limits',
      }
    case 'Scanning / Traceability':
      return {
        evaluation: 'Scanner / HMI / MES',
        controlMethod: 'Scanning interlock',
        reaction: 'Inform supervisor — miss / wrong scan',
        specialClass: '-',
        specification: 'Valid scan required to complete cycle',
      }
    case 'Oil / Lubrication':
    case 'Oil Fill':
      return {
        evaluation: 'Visual / volume interlock',
        controlMethod: 'Visual / dispenser OK-NG',
        reaction: 'If oil not applied / wrong qty — inform supervisor',
        specialClass: processType === 'Oil Fill' ? 'SC' : '-',
        specification: 'Per process oil quantity',
      }
    case 'Inspection / Test':
      return {
        evaluation: 'Gauge / tester',
        controlMethod: 'Tester OK/NG interlock',
        reaction: 'Quarantine NG; inform supervisor / IPQC',
        specialClass: 'SC',
        specification: 'Within inspection limits',
      }
    default:
      return {
        evaluation: 'Manual / visual',
        controlMethod: 'SOP / poka-yoke',
        reaction: 'Inform the supervisor — in case of miss out',
        specialClass: '-',
        specification: '-',
      }
  }
}

/** Build Control Plan rows from BOP/BOE process plan (+ optional PFMEA class hints). */
export function generateControlPlan(
  plan: ProcessPlan,
  options: GenerateOptions,
  pfmeaRows: PfmeaRow[] = [],
): ControlPlanRow[] {
  const rows: ControlPlanRow[] = []
  let sl = 1

  plan.line.stations.forEach((station, stIdx) => {
    let ops = station.operations
    if (!options.includeMoveSteps) ops = ops.filter((op) => !isLikelyMoveOnly(op.name))
    if (options.maxOpsPerStation) ops = ops.slice(0, options.maxOpsPerStation)

    const equipment = station.equipment.map((e) => e.name).join('; ') || '-'
    const wi = wiNumberFromStation(station.code, stIdx)

    for (const op of ops) {
      const processType = classifyProcessType(op.name, station.name)
      const d = defaultsForType(processType)
      const pfmeaHint = pfmeaRows.find((r) => r.operationId === op.id)
      const parts = op.parts.map((p) => p.name).join('; ')

      rows.push({
        id: uid(),
        operationSequence: station.code,
        operationDescription: station.name,
        wiNumber: wi,
        equipment,
        slNo: sl++,
        productCharacteristic: parts || '',
        processCharacteristic: requirementFromOperation(op.name),
        specialClass: pfmeaHint?.classification || d.specialClass,
        specification: d.specification,
        evaluationMethod: d.evaluation,
        sampleSize: '1',
        frequency: '1 / cycle',
        responsibility: 'O',
        capability: 'NA',
        controlMethod: d.controlMethod,
        reactionPlan: d.reaction,
        stationId: station.id,
        operationId: op.id,
      })
    }
  })

  return rows
}
