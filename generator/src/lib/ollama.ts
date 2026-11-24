import type { LibraryEntry, ProcessType } from '../core/types'

/** Local Ollama only — never via the published app's API. */
const LOCAL_OLLAMA = 'http://127.0.0.1:11434'

export interface OllamaStatus {
  available: boolean
  baseUrl?: string
  models?: string[]
  error?: string
  mode?: string
}

async function localGenerate(opts: {
  model: string
  prompt: string
  system?: string
  format?: string
}): Promise<string | null> {
  const r = await fetch(`${LOCAL_OLLAMA}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      system: opts.system,
      stream: false,
      format: opts.format,
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!r.ok) return null
  const data = (await r.json()) as { response?: string }
  return data.response || null
}

export async function fetchOllamaStatus(): Promise<OllamaStatus> {
  try {
    const r = await fetch(`${LOCAL_OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) })
    if (!r.ok) {
      return {
        available: false,
        mode: 'localhost-only',
        error: `Local Ollama HTTP ${r.status}`,
      }
    }
    const data = (await r.json()) as { models?: { name: string }[] }
    return {
      available: true,
      mode: 'localhost-only',
      models: (data.models || []).map((m) => m.name),
    }
  } catch (err) {
    return {
      available: false,
      mode: 'localhost-only',
      error:
        err instanceof Error
          ? `${err.message} — start \`ollama serve\` on this machine (set OLLAMA_ORIGINS for the app origin)`
          : 'Local Ollama unreachable',
    }
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
    const response = await localGenerate({ model, prompt, system, format: 'json' })
    if (!response) return null
    const parsed = JSON.parse(response) as { processType?: string }
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
    const response = await localGenerate({ model, prompt, system, format: 'json' })
    if (!response) return []
    const parsed = JSON.parse(response) as { rows?: LibraryEntry[] }
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
