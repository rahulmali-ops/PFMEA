import * as XLSX from 'xlsx'
import type { LibraryEntry } from '../core/types'
import { SAMPLE_LIBRARY } from './sampleLibrary'

const COL_MAP: Record<string, keyof LibraryEntry | 'ignore'> = {
  process_type: 'processType',
  'process type': 'processType',
  processtype: 'processType',
  requirement_hint: 'requirementHint',
  requirement: 'requirementHint',
  failure_mode: 'failureMode',
  'failure mode': 'failureMode',
  'potential failure mode': 'failureMode',
  failure_effect: 'failureEffect',
  'failure effect': 'failureEffect',
  'potential failure effects': 'failureEffect',
  severity: 'severity',
  sev: 'severity',
  classification: 'classification',
  class: 'classification',
  cause: 'cause',
  'potential cause': 'cause',
  'potential causes(s) of failure': 'cause',
  occurrence: 'occurrence',
  occ: 'occurrence',
  prevention_control: 'preventionControl',
  prevention: 'preventionControl',
  'current process controls - prevention -': 'preventionControl',
  detection_control: 'detectionControl',
  detection_method: 'detectionControl',
  'current process controls - detection -': 'detectionControl',
  detection: 'detection',
  det: 'detection',
  recommended_action: 'recommendedAction',
  'recommended actions': 'recommendedAction',
  keywords: 'keywords',
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/\s+/g, ' ').replace(/\n/g, ' ').trim()
}

export function parseLibraryWorkbook(buf: ArrayBuffer): LibraryEntry[] {
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const out: LibraryEntry[] = []

  for (const row of rows) {
    const mapped: Partial<LibraryEntry> = {}
    for (const [rawKey, value] of Object.entries(row)) {
      const key = COL_MAP[normHeader(rawKey)]
      if (!key || key === 'ignore') continue
      if (key === 'severity' || key === 'occurrence' || key === 'detection') {
        mapped[key] = Number(value) || 1
      } else {
        ;(mapped as Record<string, unknown>)[key] = String(value ?? '').trim()
      }
    }
    if (!mapped.failureMode) continue
    out.push({
      processType: mapped.processType || 'General Process',
      requirementHint: mapped.requirementHint,
      failureMode: mapped.failureMode,
      failureEffect: mapped.failureEffect || '',
      severity: mapped.severity || 5,
      classification: mapped.classification || '-',
      cause: mapped.cause || 'SOP not followed',
      occurrence: mapped.occurrence || 2,
      preventionControl: mapped.preventionControl || 'SOP Adherence',
      detectionControl: mapped.detectionControl || 'In station visual detection',
      detection: mapped.detection || 5,
      recommendedAction: mapped.recommendedAction,
      keywords: mapped.keywords,
    })
  }
  return out
}

export async function parseLibraryFile(file: File): Promise<LibraryEntry[]> {
  const buf = await file.arrayBuffer()
  return parseLibraryWorkbook(buf)
}

export function getDefaultLibrary(): LibraryEntry[] {
  return SAMPLE_LIBRARY.map((e) => ({ ...e }))
}

/**
 * All failure modes for a process type (requirements: each type has multiple FMs).
 * Keyword score only used to order suggestions, not to drop modes.
 */
export function matchLibrary(
  library: LibraryEntry[],
  processType: string,
  operationName: string,
): LibraryEntry[] {
  const byType = library.filter(
    (e) => e.processType.toLowerCase() === processType.toLowerCase(),
  )
  const pool = byType.length
    ? byType
    : library.filter((e) => e.processType === 'General Process')

  const text = operationName.toLowerCase()
  return [...pool].sort((a, b) => {
    const score = (e: LibraryEntry) => {
      const keys = (e.keywords || `${e.failureMode} ${e.requirementHint || ''}`).toLowerCase()
      return keys.split(/\s+/).filter((k) => k.length > 2 && text.includes(k)).length
    }
    return score(b) - score(a)
  })
}
