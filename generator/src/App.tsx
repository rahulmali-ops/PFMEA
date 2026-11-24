import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { parseBopBoePdfs, parseMppExcelFile, type ProcessPlan } from './adapters'
import { generatePfmea, recomputeRow } from './core/generator'
import type { GenerateOptions, LibraryEntry, PfmeaRow } from './core/types'
import { exportPfmeaWorkbook, downloadBlob } from './lib/exportPfmea'
import { getDefaultLibrary, parseLibraryFile } from './lib/libraryExcel'
import { fetchOllamaStatus, type OllamaStatus } from './lib/ollama'

type Step = 'upload' | 'review'

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [bopFile, setBopFile] = useState<File | null>(null)
  const [boeFile, setBoeFile] = useState<File | null>(null)
  const [combinedFile, setCombinedFile] = useState<File | null>(null)
  const [mppFile, setMppFile] = useState<File | null>(null)
  const [libraryFile, setLibraryFile] = useState<File | null>(null)
  const [library, setLibrary] = useState<LibraryEntry[]>(() => getDefaultLibrary())
  const [libraryLabel, setLibraryLabel] = useState('Built-in sample library')
  const [plan, setPlan] = useState<ProcessPlan | null>(null)
  const [rows, setRows] = useState<PfmeaRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [options, setOptions] = useState<GenerateOptions>({
    useOllama: false,
    ollamaModel: 'llama3.2',
    includeMoveSteps: true,
    maxOpsPerStation: undefined,
  })

  useEffect(() => {
    fetchOllamaStatus().then((s) => {
      setOllama(s)
      if (s.available && s.models?.length) {
        setOptions((o) => ({ ...o, ollamaModel: s.models![0], useOllama: false }))
      }
    })
  }, [])

  const stationSummary = useMemo(() => {
    if (!plan) return []
    return plan.line.stations.map((s) => ({
      code: s.code,
      name: s.name,
      ops: s.operations.length,
      eq: s.equipment.length,
    }))
  }, [plan])

  async function onLibraryChange(file: File | null) {
    setLibraryFile(file)
    if (!file) {
      setLibrary(getDefaultLibrary())
      setLibraryLabel('Built-in sample library')
      return
    }
    try {
      const parsed = await parseLibraryFile(file)
      if (!parsed.length) throw new Error('No library rows found')
      setLibrary(parsed)
      setLibraryLabel(`${file.name} (${parsed.length} entries)`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Library parse failed')
    }
  }

  async function loadDemoMpp() {
    setBusy(true)
    setError(null)
    try {
      const [mpp, lib] = await Promise.all([
        fetch('/samples/demo-mpp-bop-boe.xlsx').then((r) => {
          if (!r.ok) throw new Error('Demo MPP missing')
          return r.blob()
        }),
        fetch('/samples/failure-mode-library.xlsx').then((r) => r.blob()),
      ])
      setMppFile(new File([mpp], 'demo-mpp-bop-boe.xlsx'))
      setBopFile(null)
      setBoeFile(null)
      setCombinedFile(null)
      await onLibraryChange(new File([lib], 'failure-mode-library.xlsx'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load demo MPP')
    } finally {
      setBusy(false)
    }
  }

  async function loadDemoPdfs() {
    setBusy(true)
    setError(null)
    try {
      const [bop, boe, lib] = await Promise.all([
        fetch('/samples/sample-bop.pdf').then((r) => r.blob()),
        fetch('/samples/sample-boe.pdf').then((r) => r.blob()),
        fetch('/samples/failure-mode-library.xlsx').then((r) => r.blob()),
      ])
      setBopFile(new File([bop], 'sample-bop.pdf', { type: 'application/pdf' }))
      setBoeFile(new File([boe], 'sample-boe.pdf', { type: 'application/pdf' }))
      setCombinedFile(null)
      setMppFile(null)
      await onLibraryChange(new File([lib], 'failure-mode-library.xlsx'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load demo samples')
    } finally {
      setBusy(false)
    }
  }

  async function parseAndGenerate() {
    setBusy(true)
    setError(null)
    try {
      let nextPlan: ProcessPlan
      if (mppFile) {
        nextPlan = await parseMppExcelFile(mppFile)
      } else {
        nextPlan = await parseBopBoePdfs({
          bop: bopFile,
          boe: boeFile,
          combined: combinedFile,
        })
      }
      setPlan(nextPlan)
      const result = await generatePfmea({
        plan: nextPlan,
        library,
        options,
      })
      setRows(result.rows)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  function updateRow(id: string, patch: Partial<PfmeaRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? recomputeRow({ ...r, ...patch, source: 'manual' }) : r)),
    )
  }

  async function onExport() {
    if (!plan) return
    const blob = await exportPfmeaWorkbook(rows, plan)
    downloadBlob(blob, `PFMEA-${plan.line.name.replace(/\s+/g, '-')}.xlsx`)
  }

  const canGenerate = !!mppFile || !!combinedFile || !!bopFile || !!boeFile
  const totalOps = plan
    ? plan.line.stations.reduce((n, s) => n + s.operations.length, 0)
    : 0

  return (
    <div className="app-shell">
      <header className="hero">
        <h1 className="brand">
          PFMEA <span>Generator</span>
        </h1>
        <p className="lede">
          Upload your full Teamcenter MPP BOP/BOE Excel sheet (or BOP/BOE PDFs). The app maps every
          station and operation, matches your failure-mode library, generates the full PFMEA, then
          lets you edit and export. PFD is skipped — same core later plugs into MPP API.
        </p>
        <div className="flow">
          <div className={`flow-step ${step === 'upload' ? 'active' : ''}`}>
            <span className="n">01</span> Upload BOP/BOE + library
          </div>
          <div className={`flow-step ${step === 'review' ? 'active' : ''}`}>
            <span className="n">02</span> Review / edit PFMEA
          </div>
          <div className="flow-step">
            <span className="n">03</span> Export Excel
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <div className="panel-h">
            <h2>Inputs</h2>
            <span className="meta">Full sheet → all ops</span>
          </div>
          <div className="panel-b stack">
            <div className="btn-row">
              <button type="button" className="primary" onClick={loadDemoMpp} disabled={busy}>
                Load demo MPP sheet + library
              </button>
              <button type="button" className="ghost" onClick={loadDemoPdfs} disabled={busy}>
                Or demo PDFs
              </button>
            </div>

            <label className="field">
              MPP BOP/BOE Excel (recommended)
              <div className="drop">
                <strong>Teamcenter export — entire sheet</strong>
                <span>.xlsx / .xlsm with stations, operations, equipment, parts</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null
                    setMppFile(f)
                    if (f) {
                      setBopFile(null)
                      setBoeFile(null)
                      setCombinedFile(null)
                    }
                  }}
                />
                {mppFile && <span className="pill ok">{mppFile.name}</span>}
              </div>
            </label>

            <label className="field">
              Failure-mode library (Excel)
              <div className="drop">
                <strong>{libraryLabel}</strong>
                <span>process_type → failure modes, SEV/OCC/DET, controls</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => onLibraryChange(e.target.files?.[0] || null)}
                />
                {libraryFile && <span className="pill ok">{libraryFile.name}</span>}
              </div>
            </label>

            <details>
              <summary className="note">Optional: BOP / BOE PDFs instead</summary>
              <div className="stack" style={{ marginTop: 10 }}>
                <label className="field">
                  BOP PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      setBopFile(e.target.files?.[0] || null)
                      setMppFile(null)
                    }}
                  />
                  {bopFile && <span className="pill ok">{bopFile.name}</span>}
                </label>
                <label className="field">
                  BOE PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      setBoeFile(e.target.files?.[0] || null)
                      setMppFile(null)
                    }}
                  />
                  {boeFile && <span className="pill ok">{boeFile.name}</span>}
                </label>
                <label className="field">
                  Combined BOP+BOE PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      setCombinedFile(e.target.files?.[0] || null)
                      if (e.target.files?.[0]) {
                        setBopFile(null)
                        setBoeFile(null)
                        setMppFile(null)
                      }
                    }}
                  />
                  {combinedFile && <span className="pill ok">{combinedFile.name}</span>}
                </label>
                <p className="note">
                  Digital text PDFs only. Scanned/image PDFs need OCR first.
                </p>
              </div>
            </details>

            <div className="stack">
              <div className="toggle">
                <input
                  id="moves"
                  type="checkbox"
                  checked={options.includeMoveSteps}
                  onChange={(e) => setOptions((o) => ({ ...o, includeMoveSteps: e.target.checked }))}
                />
                <label htmlFor="moves">Generate all ops (include move / transfer)</label>
              </div>
              <div className="toggle">
                <input
                  id="ollama"
                  type="checkbox"
                  checked={options.useOllama}
                  onChange={(e) => setOptions((o) => ({ ...o, useOllama: e.target.checked }))}
                  disabled={!ollama?.available}
                />
                <label htmlFor="ollama">Use Ollama for AI assist</label>
              </div>
              {ollama?.available ? (
                <span className="pill ok">Ollama · {(ollama.models || []).join(', ') || 'ready'}</span>
              ) : (
                <span className="pill bad">Ollama offline — library matching only</span>
              )}
              {options.useOllama && (
                <label className="field">
                  Model
                  <select
                    value={options.ollamaModel}
                    onChange={(e) => setOptions((o) => ({ ...o, ollamaModel: e.target.value }))}
                  >
                    {(ollama?.models || [options.ollamaModel]).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {error && <p className="note warn">{error}</p>}

            <div className="btn-row">
              <button
                type="button"
                className="primary"
                disabled={!canGenerate || busy}
                onClick={parseAndGenerate}
              >
                {busy ? 'Generating all…' : 'Generate full PFMEA'}
              </button>
              {step === 'review' && (
                <button type="button" className="secondary" onClick={() => setStep('upload')}>
                  Back
                </button>
              )}
            </div>
            <p className="note">
              Drop your MPP BOP&amp;BOE report sheet, keep “Generate all ops” on, then generate —
              every station/operation gets PFMEA rows from the library.
            </p>
          </div>
        </aside>

        <main className="panel">
          {step === 'upload' && !plan && (
            <>
              <div className="panel-h">
                <h2>How it works</h2>
              </div>
              <div className="panel-b stack">
                <p className="note">
                  1. Upload the full MPP BOP/BOE Excel (Teamcenter export) — stations, ops, machines,
                  parts in one sheet.
                  <br />
                  2. Optionally upload your failure-mode library (or use the built-in sample).
                  <br />
                  3. Generate creates PFMEA rows for <strong>all</strong> operations, then you edit
                  and export Excel.
                  <br />
                  4. Later: same generator takes live MPP API without rewriting core logic.
                </p>
                <p className="note">
                  Demo sheet:{' '}
                  <a href="/samples/demo-mpp-bop-boe.xlsx">demo-mpp-bop-boe.xlsx</a>
                  {' · '}
                  <a href="/samples/failure-mode-library.xlsx">library.xlsx</a>
                  {' · '}
                  <a href="/samples/blank-pfmea-template.xlsx">blank PFMEA</a>
                </p>
              </div>
            </>
          )}

          {plan && (
            <>
              <div className="panel-h">
                <h2>{step === 'review' ? 'PFMEA review' : 'Parsed process'}</h2>
                <span className="meta">{plan.sourceLabel}</span>
              </div>
              <div className="panel-b stack">
                <div className="stats">
                  <div className="stat">
                    <div className="v">{plan.line.stations.length}</div>
                    <div className="k">Stations</div>
                  </div>
                  <div className="stat">
                    <div className="v">{totalOps}</div>
                    <div className="k">Operations</div>
                  </div>
                  <div className="stat">
                    <div className="v">{rows.length}</div>
                    <div className="k">PFMEA rows</div>
                  </div>
                  <div className="stat">
                    <div className="v">{library.length}</div>
                    <div className="k">Library</div>
                  </div>
                </div>

                {plan.warnings.length > 0 && (
                  <div className="stack">
                    {plan.warnings.map((w) => (
                      <p key={w} className="note warn">
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                <div className="station-list">
                  {stationSummary.map((s) => (
                    <div key={s.code + s.name} className="station-item">
                      <strong>
                        {s.code} — {s.name}
                      </strong>
                      <small>
                        {s.ops} ops · {s.eq} equipment
                      </small>
                    </div>
                  ))}
                </div>

                {step === 'review' && (
                  <div className="btn-row">
                    <button type="button" className="primary" onClick={onExport}>
                      Export PFMEA Excel
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={parseAndGenerate}
                      disabled={busy}
                    >
                      Regenerate
                    </button>
                  </div>
                )}
              </div>

              {step === 'review' && rows.length > 0 && (
                <div className="table-wrap">
                  <table className="pfmea">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Operation</th>
                        <th>S No</th>
                        <th>Requirement</th>
                        <th>Failure mode</th>
                        <th>Effect</th>
                        <th>SEV</th>
                        <th>Cause</th>
                        <th>OCC</th>
                        <th>Prevention</th>
                        <th>Detection ctrl</th>
                        <th>DET</th>
                        <th>RPN</th>
                        <th>AP</th>
                        <th>Actions</th>
                        <th>Src</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.operationSequence}</td>
                          <td>{r.operationDescription}</td>
                          <td>{r.sNo}</td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.requirement}
                              onChange={(e) => updateRow(r.id, { requirement: e.target.value })}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.failureMode}
                              onChange={(e) => updateRow(r.id, { failureMode: e.target.value })}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.failureEffect}
                              onChange={(e) => updateRow(r.id, { failureEffect: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="num"
                              type="number"
                              min={1}
                              max={10}
                              value={r.severity}
                              onChange={(e) =>
                                updateRow(r.id, { severity: Number(e.target.value) || 1 })
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.cause}
                              onChange={(e) => updateRow(r.id, { cause: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="num"
                              type="number"
                              min={1}
                              max={10}
                              value={r.occurrence}
                              onChange={(e) =>
                                updateRow(r.id, { occurrence: Number(e.target.value) || 1 })
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.preventionControl}
                              onChange={(e) =>
                                updateRow(r.id, { preventionControl: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.detectionControl}
                              onChange={(e) =>
                                updateRow(r.id, { detectionControl: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="num"
                              type="number"
                              min={1}
                              max={10}
                              value={r.detection}
                              onChange={(e) =>
                                updateRow(r.id, { detection: Number(e.target.value) || 1 })
                              }
                            />
                          </td>
                          <td className="num">{r.rpn}</td>
                          <td>
                            <span className={`ap ${r.actionPriority}`}>{r.actionPriority}</span>
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.recommendedActions}
                              onChange={(e) =>
                                updateRow(r.id, { recommendedActions: e.target.value })
                              }
                            />
                          </td>
                          <td className="src">{r.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <div className="footer-note">
        Upload your full MPP BOP/BOE sheet → generate all stations/ops → edit → export. Adapters:{' '}
        <code>MPP Excel</code> / <code>PDF</code> / future <code>API</code> → same{' '}
        <code>ProcessPlan</code> generator.
      </div>
    </div>
  )
}
