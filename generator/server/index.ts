import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 8787)
const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')

app.use(cors())
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pfmea-generator', ollamaBase: OLLAMA_BASE })
})

app.get('/api/ollama/status', async (_req, res) => {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!r.ok) {
      res.json({ available: false, error: `Ollama responded ${r.status}` })
      return
    }
    const data = (await r.json()) as { models?: { name: string }[] }
    res.json({
      available: true,
      baseUrl: OLLAMA_BASE,
      models: (data.models || []).map((m) => m.name),
    })
  } catch (err) {
    res.json({
      available: false,
      baseUrl: OLLAMA_BASE,
      error: err instanceof Error ? err.message : 'Ollama unreachable',
    })
  }
})

app.post('/api/ollama/generate', async (req, res) => {
  const { model, prompt, system, format } = req.body as {
    model?: string
    prompt?: string
    system?: string
    format?: string
  }
  if (!prompt) {
    res.status(400).json({ error: 'prompt required' })
    return
  }
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || process.env.OLLAMA_MODEL || 'llama3.2',
        prompt,
        system,
        stream: false,
        format: format || undefined,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!r.ok) {
      const text = await r.text()
      res.status(502).json({ error: `Ollama error ${r.status}`, detail: text.slice(0, 500) })
      return
    }
    const data = await r.json()
    res.json(data)
  } catch (err) {
    res.status(503).json({
      error: 'Ollama unavailable',
      detail: err instanceof Error ? err.message : String(err),
      hint: 'Start Ollama locally (ollama serve) and set OLLAMA_BASE_URL if needed.',
    })
  }
})

const dist = path.join(__dirname, '..', 'dist')
app.use(express.static(dist))
app.get(/^(?!\/api).*/, (_req, res, next) => {
  const index = path.join(dist, 'index.html')
  res.sendFile(index, (err) => {
    if (err) next()
  })
})

app.listen(PORT, '127.0.0.1', () => {
  console.log(`PFMEA generator API on http://127.0.0.1:${PORT}`)
  console.log(`Ollama proxy → ${OLLAMA_BASE}`)
})
