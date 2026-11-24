import { calcRpn, calculateAP } from './actionPriority'
import {
  classifyProcessType,
  isLikelyMoveOnly,
  requirementFromOperation,
} from './processTypeClassifier'
import { matchLibrary } from '../lib/libraryExcel'
import { classifyWithOllama, suggestFailureModesWithOllama } from '../lib/ollama'
import type { GenerateContext, LibraryEntry, PfmeaRow, PfmeaSuggestions } from './types'

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function suggestionsFrom(entry: LibraryEntry): PfmeaSuggestions {
  return {
    failureEffect: entry.failureEffect || '',
    severity: entry.severity || 5,
    classification: entry.classification || '-',
    cause: entry.cause || '',
    occurrence: entry.occurrence || 2,
    preventionControl: entry.preventionControl || '',
    detectionControl: entry.detectionControl || '',
    detection: entry.detection || 5,
    recommendedActions: entry.recommendedAction || '',
  }
}

/**
 * Guided PFMEA from BOP:
 * - Requirement = BOP process characteristic / operation text (as on the sheet)
 * - Process type = expertise classifier (optional local Ollama override)
 * - One row per library FM for that type; each FM carries its paired failure effect (1:1)
 * - SEV / OCC / DET / cause / controls = blank + suggestions only
 */
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

      const requirement = requirementFromOperation(op.name, processType)
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
            failureMode: '',
            failureEffect: '',
            severity: 5,
            cause: '',
            occurrence: 2,
            preventionControl: '',
            detectionControl: '',
            detection: 5,
          },
        ]
        source = 'manual'
      }

      // One PFMEA row per FM; each FM gets exactly one paired failure effect from the library
      for (const entry of entries) {
        const sug = suggestionsFrom(entry)
        rows.push({
          id: uid('row'),
          operationSequence: station.code,
          operationDescription: station.name,
          sNo: globalSNo++,
          requirement,
          processType,
          failureMode: entry.failureMode,
          failureEffect: entry.failureEffect || '',
          // Ratings / causes / controls — left blank for the analyst
          severity: '',
          classification: '',
          cause: '',
          occurrence: '',
          preventionControl: '',
          detectionControl: '',
          detection: '',
          rpn: '',
          actionPriority: '',
          recommendedActions: '',
          responsibility: '',
          actionsTaken: '',
          revSeverity: '',
          revOccurrence: '',
          revDetection: '',
          revRpn: '',
          source,
          stationId: station.id,
          operationId: op.id,
          suggestions: sug,
        })
      }
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
  const s = row.severity
  const o = row.occurrence
  const d = row.detection
  if (s === '' || o === '' || d === '') {
    return { ...row, rpn: '', actionPriority: '' }
  }
  const rpn = calcRpn(Number(s), Number(o), Number(d))
  return {
    ...row,
    rpn,
    actionPriority: calculateAP(Number(s), Number(o), Number(d)),
    revRpn:
      row.revSeverity !== '' && row.revOccurrence !== '' && row.revDetection !== ''
        ? calcRpn(Number(row.revSeverity), Number(row.revOccurrence), Number(row.revDetection))
        : '',
  }
}

/** Apply one or all suggestion fields onto the manual columns. */
export function applySuggestions(
  row: PfmeaRow,
  fields?: (keyof PfmeaSuggestions)[],
): PfmeaRow {
  const s = row.suggestions
  const keys = fields || (Object.keys(s) as (keyof PfmeaSuggestions)[])
  const next: PfmeaRow = { ...row, source: 'manual' }
  for (const k of keys) {
    if (k === 'severity' || k === 'occurrence' || k === 'detection') {
      next[k] = s[k]
    } else if (k === 'recommendedActions') {
      next.recommendedActions = s.recommendedActions
    } else {
      next[k] = s[k]
    }
  }
  return recomputeRow(next)
}
