import { calcRpn, calculateAP } from './actionPriority'
import {
  classifyProcessType,
  isLikelyMoveOnly,
  requirementFromOperation,
} from './processTypeClassifier'
import { matchLibrary } from '../lib/libraryExcel'
import { classifyWithOllama, suggestFailureModesWithOllama } from '../lib/ollama'
import type { GenerateContext, LibraryEntry, PfmeaRow } from './types'

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function rowsFromEntries(
  entries: LibraryEntry[],
  meta: {
    stationCode: string
    stationName: string
    stationId: string
    opId: string
    opName: string
    processType: string
    sNoStart: number
    source: PfmeaRow['source']
  },
): PfmeaRow[] {
  return entries.map((e, idx) => {
    const severity = e.severity
    const occurrence = e.occurrence
    const detection = e.detection
    const rpn = calcRpn(severity, occurrence, detection)
    return {
      id: uid('row'),
      operationSequence: meta.stationCode,
      operationDescription: meta.stationName,
      sNo: meta.sNoStart + idx,
      requirement: e.requirementHint
        ? `${requirementFromOperation(meta.opName, meta.processType as never)} (${e.requirementHint})`
        : requirementFromOperation(meta.opName, meta.processType as never),
      processType: meta.processType,
      failureMode: e.failureMode,
      failureEffect: e.failureEffect,
      severity,
      classification: e.classification || '-',
      cause: e.cause,
      occurrence,
      preventionControl: e.preventionControl,
      detectionControl: e.detectionControl,
      detection,
      rpn,
      actionPriority: calculateAP(severity, occurrence, detection),
      recommendedActions: e.recommendedAction || '',
      responsibility: '',
      actionsTaken: '',
      revSeverity: '',
      revOccurrence: '',
      revDetection: '',
      revRpn: '',
      source: meta.source,
      stationId: meta.stationId,
      operationId: meta.opId,
    }
  })
}

export async function generatePfmea(ctx: GenerateContext): Promise<{
  rows: PfmeaRow[]
  stats: { stations: number; operations: number; rows: number; ollamaUsed: boolean }
}> {
  const { plan, library, options } = ctx
  const rows: PfmeaRow[] = []
  let opCount = 0
  let ollamaUsed = false
  let globalSNo = 1

  for (const station of plan.line.stations) {
    let ops = station.operations
    if (!options.includeMoveSteps) {
      ops = ops.filter((op) => !isLikelyMoveOnly(op.name))
    }
    if (options.maxOpsPerStation) {
      ops = ops.slice(0, options.maxOpsPerStation)
    }

    for (const op of ops) {
      opCount++
      let processType = classifyProcessType(op.name, station.name)

      if (options.useOllama) {
        const aiType = await classifyWithOllama(options.ollamaModel, op.name, station.name)
        if (aiType) {
          processType = aiType
          ollamaUsed = true
        }
      }

      let entries = matchLibrary(library, processType, op.name)
      let source: PfmeaRow['source'] = 'library'

      if (options.useOllama) {
        const aiEntries = await suggestFailureModesWithOllama(
          options.ollamaModel,
          op.name,
          station.name,
          processType,
          entries,
        )
        if (aiEntries.length) {
          entries = aiEntries
          source = 'ollama'
          ollamaUsed = true
        }
      }

      if (!entries.length) {
        entries = [
          {
            processType,
            failureMode: 'Process requirement not met',
            failureEffect: 'ME: Quality / process risk',
            severity: 5,
            cause: 'SOP not followed',
            occurrence: 2,
            preventionControl: 'SOP Adherence',
            detectionControl: 'In station visual detection',
            detection: 5,
          },
        ]
        source = 'manual'
      }

      const generated = rowsFromEntries(entries, {
        stationCode: station.code,
        stationName: station.name,
        stationId: station.id,
        opId: op.id,
        opName: op.name,
        processType,
        sNoStart: globalSNo,
        source,
      })
      // Collapse requirement display: first row keeps full requirement; keep all FMs
      rows.push(...generated)
      globalSNo += generated.length
    }
  }

  return {
    rows,
    stats: {
      stations: plan.line.stations.length,
      operations: opCount,
      rows: rows.length,
      ollamaUsed,
    },
  }
}

export function recomputeRow(row: PfmeaRow): PfmeaRow {
  const rpn = calcRpn(row.severity, row.occurrence, row.detection)
  return {
    ...row,
    rpn,
    actionPriority: calculateAP(row.severity, row.occurrence, row.detection),
    revRpn:
      row.revSeverity !== '' && row.revOccurrence !== '' && row.revDetection !== ''
        ? calcRpn(Number(row.revSeverity), Number(row.revOccurrence), Number(row.revDetection))
        : '',
  }
}
