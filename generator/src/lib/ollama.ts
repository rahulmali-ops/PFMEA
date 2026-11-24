import type { LibraryEntry, ProcessType } from '../core/types'

export interface OllamaStatus {
  available: boolean
  baseUrl?: string
  models?: string[]
  error?: string
}

export async function fetchOllamaStatus(): Promise<OllamaStatus> {
  try {
    const r = await fetch('/api/ollama/status')
    return (await r.json()) as OllamaStatus
  } catch (err) {
    return { available: false, error: err instanceof Error ? err.message : 'API unreachable' }
  }
}

export async function classifyWithOllama(
  model: string,
  operationName: string,
  stationName: string,
): Promise<ProcessType | null> {
  const system =
    'You classify manufacturing operations into exactly one process type. Reply with JSON only.'
  const prompt = `Station: ${stationName}
Operation: ${operationName}

Choose one processType from:
Loading / Placement, Torquing & Fastening, Press Fit, Oil / Lubrication, Scanning / Traceability, Handling / Transfer, Inspection / Test, Leak Test, Oil Fill, Assembly / Insertion, General Process

Return JSON: {"processType":"..."}`

  try {
    const r = await fetch('/api/ollama/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system, format: 'json' }),
    })
    if (!r.ok) return null
    const data = (await r.json()) as { response?: string }
    const parsed = JSON.parse(data.response || '{}') as { processType?: string }
    return (parsed.processType as ProcessType) || null
  } catch {
    return null
  }
}

export async function suggestFailureModesWithOllama(
  model: string,
  operationName: string,
  stationName: string,
  processType: string,
  libraryHints: LibraryEntry[],
): Promise<LibraryEntry[]> {
  const hints = libraryHints.slice(0, 5).map((h) => ({
    failureMode: h.failureMode,
    failureEffect: h.failureEffect,
    severity: h.severity,
    cause: h.cause,
    occurrence: h.occurrence,
    preventionControl: h.preventionControl,
    detectionControl: h.detectionControl,
    detection: h.detection,
  }))

  const system =
    'You are a senior quality engineer writing PFMEA rows for automotive/powertrain assembly. Reply with JSON only.'
  const prompt = `Generate 2-4 potential failure modes for this operation.
Station: ${stationName}
Operation: ${operationName}
Process type: ${processType}

Library hints (prefer adapting these):
${JSON.stringify(hints, null, 2)}

Return JSON:
{"rows":[{"failureMode":"","failureEffect":"","severity":1-10,"cause":"","occurrence":1-10,"preventionControl":"","detectionControl":"","detection":1-10,"recommendedAction":"","classification":"-"}]}`

  try {
    const r = await fetch('/api/ollama/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, system, format: 'json' }),
    })
    if (!r.ok) return []
    const data = (await r.json()) as { response?: string }
    const parsed = JSON.parse(data.response || '{}') as { rows?: LibraryEntry[] }
    return (parsed.rows || []).map((row) => ({
      processType,
      failureMode: row.failureMode,
      failureEffect: row.failureEffect,
      severity: Number(row.severity) || 5,
      classification: row.classification || '-',
      cause: row.cause || 'SOP not followed',
      occurrence: Number(row.occurrence) || 2,
      preventionControl: row.preventionControl || 'SOP Adherence',
      detectionControl: row.detectionControl || 'In station visual detection',
      detection: Number(row.detection) || 5,
      recommendedAction: row.recommendedAction,
    }))
  } catch {
    return []
  }
}
