import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT || 8787)

// Same-origin only — no open CORS. Ollama is NOT proxied (browser → localhost:11434).
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'pfmea-generator' })
})

/** Ollama runs on the user's machine; this host never relays prompts. */
app.get('/api/ollama/status', (_req, res) => {
  res.json({
    available: false,
    mode: 'localhost-only',
    hint: 'Enable AI in the UI; the browser talks to http://127.0.0.1:11434 directly.',
  })
})

app.post('/api/ollama/generate', (_req, res) => {
  res.status(410).json({
    error: 'Ollama proxy removed',
    hint: 'Use local Ollama at http://127.0.0.1:11434 from the browser (OLLAMA_ORIGINS).',
  })
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
  console.log(`PFMEA generator on http://127.0.0.1:${PORT}`)
  console.log('Ollama: browser → http://127.0.0.1:11434 (no server proxy)')
})
