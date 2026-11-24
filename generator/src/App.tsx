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
    includeMoveSteps: false,
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

  async function loadDemoPdfs() {
    setBusy(true)
    setError(null)
    try {
      const [bop, boe, lib] = await Promise.all([
        fetch('/samples/sample-bop.pdf').then((r) => r.blob()),
        fetch('/samples/sample-boe.pdf').then((r) => r.blob()),
        fetch('/samples/failure-mode-library.xlsx').then((r) => r.blob()),
      ])
      const bopF = new File([bop], 'sample-bop.pdf', { type: 'application/pdf' })
      const boeF = new File([boe], 'sample-boe.pdf', { type: 'application/pdf' })
      const libF = new File([lib], 'failure-mode-library.xlsx')
      setBopFile(bopF)
      setBoeFile(boeF)
      setCombinedFile(null)
      setMppFile(null)
      await onLibraryChange(libF)
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

  const canGenerate =
    !!mppFile || !!combinedFile || !!bopFile || !!boeFile

  return (
    <div className="app-shell">
      <header className="hero">
        <h1 className="brand">
          PFMEA <span>Generator</span>
        </h1>
        <p className="lede">
          Upload BOP/BOE PDFs and your failure-mode library Excel. The app maps process steps,
          matches the library (optional Ollama assist), then lets you edit and export a PFMEA
          workbook. PFD is skipped — BOP/BOE feed the generator directly so the same core can later
          take MPP API data.
        </p>
        <div className="flow">
          <div className={`flow-step ${step === 'upload' ? 'active' : ''}`}>
            <span className="n">01</span> Upload PDFs + library
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
            <span className="meta">PDF primary</span>
          </div>
          <div className="panel-b stack">
            <div className="btn-row">
              <button type="button" className="secondary" onClick={loadDemoPdfs} disabled={busy}>
                Load demo PDFs + library
              </button>
            </div>

            <label className="field">
              BOP PDF
              <div className="drop">
                <strong>Bill of Process</strong>
                <span>Stations + OP: lines (digital PDF)</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setBopFile(e.target.files?.[0] || null)}
                />
                {bopFile && <span className="pill ok">{bopFile.name}</span>}
              </div>
            </label>

            <label className="field">
              BOE PDF
              <div className="drop">
                <strong>Bill of Equipment</strong>
                <span>Stations + EQUIPMENT: lines</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setBoeFile(e.target.files?.[0] || null)}
                />
                {boeFile && <span className="pill ok">{boeFile.name}</span>}
              </div>
            </label>

            <label className="field">
              Or combined BOP+BOE PDF
              <div className="drop">
                <strong>Single PDF</strong>
                <span>Optional if BOP and BOE ship together</span>
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => {
                    setCombinedFile(e.target.files?.[0] || null)
                    if (e.target.files?.[0]) {
                      setBopFile(null)
                      setBoeFile(null)
                    }
                  }}
                />
                {combinedFile && <span className="pill ok">{combinedFile.name}</span>}
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
              <summary className="note">Alternate: Teamcenter MPP Excel (BOP+BOE)</summary>
              <label className="field" style={{ marginTop: 10 }}>
                MPP .xlsx / .xlsm
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => {
                    setMppFile(e.target.files?.[0] || null)
                    if (e.target.files?.[0]) {
                      setBopFile(null)
                      setBoeFile(null)
                      setCombinedFile(null)
                    }
                  }}
                />
                {mppFile && <span className="pill ok">{mppFile.name}</span>}
              </label>
              <p className="note">Same generator core via Excel adapter — useful for live Teamcenter exports.</p>
            </details>

            <div className="stack">
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
              <div className="toggle">
                <input
                  id="moves"
                  type="checkbox"
                  checked={options.includeMoveSteps}
                  onChange={(e) => setOptions((o) => ({ ...o, includeMoveSteps: e.target.checked }))}
                />
                <label htmlFor="moves">Include move / transfer ops</label>
              </div>
            </div>

            {error && <p className="note warn">{error}</p>}

            <div className="btn-row">
              <button
                type="button"
                className="primary"
                disabled={!canGenerate || busy}
                onClick={parseAndGenerate}
              >
                {busy ? 'Generating…' : 'Generate PFMEA'}
              </button>
              {step === 'review' && (
                <button type="button" className="secondary" onClick={() => setStep('upload')}>
                  Back
                </button>
              )}
            </div>
            <p className="note">
              Scanned/image-only PDFs have no text layer — OCR them first, or use the digital sample
              PDFs under <code>/samples</code>.
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
                  1. Parse BOP/BOE PDFs into stations and operations (adapter layer).
                  <br />
                  2. Classify each op (torquing, press, load, …) and match your Excel library.
                  <br />
                  3. Optionally enrich with local Ollama. Edit rows, then export PFMEA Excel.
                  <br />
                  4. Later: swap the PDF adapter for Teamcenter/MPP API — core generator unchanged.
                </p>
                <p className="note">
                  Templates:{' '}
                  <a href="/samples/sample-bop.pdf">sample-bop.pdf</a>
                  {' · '}
                  <a href="/samples/sample-boe.pdf">sample-boe.pdf</a>
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
                    <div className="v">
                      {plan.line.stations.reduce((n, s) => n + s.operations.length, 0)}
                    </div>
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
                  <>
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
                  </>
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
        Architecture: <code>ProcessInputAdapter</code> (PDF today, MPP Excel optional, API later) →
        canonical <code>ProcessPlan</code> → library/Ollama generator → editable PFMEA → Excel
        export. Control Plan / WI generation stubbed for a later phase. Change-management diffs hook
        lives in <code>src/core/changeManagement.ts</code>.
      </div>
    </div>
  )
}
