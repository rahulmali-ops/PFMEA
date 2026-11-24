import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { parseBopBoePdfs, parseMppExcelFile, type ProcessPlan } from './adapters'
import { recomputeRow } from './core/generator'
import { generateQualityPackage, logChange } from './core/qualityPackage'
import type {
  ChangeLogEntry,
  ControlPlanRow,
  GenerateOptions,
  LibraryEntry,
  PfmeaRow,
  WorkInstruction,
} from './core/types'
import { downloadBlob, exportQualityPackage } from './lib/exportPackage'
import { getDefaultLibrary, parseLibraryFile } from './lib/libraryExcel'
import { fetchOllamaStatus, type OllamaStatus } from './lib/ollama'

type Step = 'upload' | 'review'
type Tab = 'pfmea' | 'cp' | 'wi' | 'changes'

export default function App() {
  const [step, setStep] = useState<Step>('upload')
  const [tab, setTab] = useState<Tab>('pfmea')
  const [bopFile, setBopFile] = useState<File | null>(null)
  const [boeFile, setBoeFile] = useState<File | null>(null)
  const [combinedFile, setCombinedFile] = useState<File | null>(null)
  const [mppFile, setMppFile] = useState<File | null>(null)
  const [library, setLibrary] = useState<LibraryEntry[]>(() => getDefaultLibrary())
  const [libraryLabel, setLibraryLabel] = useState('Built-in process-type library')
  const [plan, setPlan] = useState<ProcessPlan | null>(null)
  const [rows, setRows] = useState<PfmeaRow[]>([])
  const [controlPlan, setControlPlan] = useState<ControlPlanRow[]>([])
  const [workInstructions, setWorkInstructions] = useState<WorkInstruction[]>([])
  const [changeLog, setChangeLog] = useState<ChangeLogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ollama, setOllama] = useState<OllamaStatus | null>(null)
  const [options, setOptions] = useState<GenerateOptions>({
    useOllama: false,
    ollamaModel: 'llama3.2',
    includeMoveSteps: true,
    maxOpsPerStation: undefined,
    generateControlPlan: true,
    generateWorkInstructions: true,
  })

  useEffect(() => {
    fetchOllamaStatus().then((s) => {
      setOllama(s)
      if (s.available && s.models?.length) {
        setOptions((o) => ({ ...o, ollamaModel: s.models![0] }))
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
    if (!file) {
      setLibrary(getDefaultLibrary())
      setLibraryLabel('Built-in process-type library')
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

  async function parseAndGenerate() {
    setBusy(true)
    setError(null)
    try {
      const nextPlan = mppFile
        ? await parseMppExcelFile(mppFile)
        : await parseBopBoePdfs({ bop: bopFile, boe: boeFile, combined: combinedFile })
      setPlan(nextPlan)
      const pkg = await generateQualityPackage({ plan: nextPlan, library, options })
      setRows(pkg.pfmea)
      setControlPlan(pkg.controlPlan)
      setWorkInstructions(pkg.workInstructions)
      setChangeLog([])
      setTab('pfmea')
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed')
    } finally {
      setBusy(false)
    }
  }

  function updatePfmea(id: string, field: keyof PfmeaRow, value: string | number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const before = String(r[field] ?? '')
        const next = recomputeRow({ ...r, [field]: value, source: 'manual' })
        setChangeLog((log) =>
          logChange(log, {
            who: 'analyst',
            where: `PFMEA · ${r.operationSequence} · S${r.sNo}`,
            field: String(field),
            before,
            after: String(value),
          }),
        )
        return next
      }),
    )
  }

  function updateCp(id: string, field: keyof ControlPlanRow, value: string | number) {
    setControlPlan((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        setChangeLog((log) =>
          logChange(log, {
            who: 'analyst',
            where: `CP · ${r.operationSequence} · #${r.slNo}`,
            field: String(field),
            before: String(r[field] ?? ''),
            after: String(value),
          }),
        )
        return { ...r, [field]: value }
      }),
    )
  }

  async function onExport() {
    if (!plan) return
    const blob = await exportQualityPackage({
      plan,
      pfmea: rows,
      controlPlan,
      workInstructions,
      changeLog,
    })
    downloadBlob(blob, `QualityPackage-${plan.line.name.replace(/\s+/g, '-')}.xlsx`)
  }

  const canGenerate = !!mppFile || !!combinedFile || !!bopFile || !!boeFile
  const totalOps = plan ? plan.line.stations.reduce((n, s) => n + s.operations.length, 0) : 0

  return (
    <div className="app-shell">
      <header className="hero">
        <h1 className="brand">
          PFMEA <span>Generator</span>
        </h1>
        <p className="lede">
          Phase 1A from requirements: upload full MPP BOP/BOE → generate{' '}
          <strong>PFMEA + Control Plan + Work Instructions</strong> using the process-type failure
          library (optional Ollama). Shared station sequence stays consistent; edit with a change
          log; export the quality package Excel.
        </p>
        <div className="flow">
          <div className={`flow-step ${step === 'upload' ? 'active' : ''}`}>
            <span className="n">01</span> Upload BOP/BOE + library
          </div>
          <div className={`flow-step ${step === 'review' ? 'active' : ''}`}>
            <span className="n">02</span> Review PFMEA / CP / WI
          </div>
          <div className="flow-step">
            <span className="n">03</span> Export package
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <div className="panel-h">
            <h2>Inputs</h2>
            <span className="meta">MPP → PFMEA + CP + WI</span>
          </div>
          <div className="panel-b stack">
            <div className="btn-row">
              <button type="button" className="primary" onClick={loadDemoMpp} disabled={busy}>
                Load demo MPP + library
              </button>
            </div>

            <label className="field">
              MPP BOP/BOE Excel (full sheet)
              <div className="drop">
                <strong>Teamcenter BOP + BOE report</strong>
                <span>Generate all stations / operations</span>
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
                <span>Process type → standard failure modes (requirements § PFMEA Automation)</span>
                <input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => onLibraryChange(e.target.files?.[0] || null)}
                />
              </div>
            </label>

            <details>
              <summary className="note">Optional PDF BOP/BOE</summary>
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
                </label>
                <label className="field">
                  Combined PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => {
                      setCombinedFile(e.target.files?.[0] || null)
                      if (e.target.files?.[0]) setMppFile(null)
                    }}
                  />
                </label>
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
                  id="cp"
                  type="checkbox"
                  checked={options.generateControlPlan}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, generateControlPlan: e.target.checked }))
                  }
                />
                <label htmlFor="cp">Generate Control Plan</label>
              </div>
              <div className="toggle">
                <input
                  id="wi"
                  type="checkbox"
                  checked={options.generateWorkInstructions}
                  onChange={(e) =>
                    setOptions((o) => ({ ...o, generateWorkInstructions: e.target.checked }))
                  }
                />
                <label htmlFor="wi">Generate Work Instructions</label>
              </div>
              <div className="toggle">
                <input
                  id="ollama"
                  type="checkbox"
                  checked={options.useOllama}
                  disabled={!ollama?.available}
                  onChange={(e) => setOptions((o) => ({ ...o, useOllama: e.target.checked }))}
                />
                <label htmlFor="ollama">Ollama AI assist for failure modes</label>
              </div>
              {ollama?.available ? (
                <span className="pill ok">Ollama ready</span>
              ) : (
                <span className="pill bad">Ollama offline — library only</span>
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
                {busy ? 'Generating package…' : 'Generate PFMEA + CP + WI'}
              </button>
              {step === 'review' && (
                <button type="button" className="secondary" onClick={() => setStep('upload')}>
                  Back
                </button>
              )}
            </div>
          </div>
        </aside>

        <main className="panel">
          {step === 'upload' && !plan && (
            <>
              <div className="panel-h">
                <h2>Requirements coverage (Phase 1A)</h2>
              </div>
              <div className="panel-b stack">
                <p className="note">
                  From your PFMEA requirements: MPP holds BOE + BOP for all stations. This app
                  generates <strong>PFMEA, Control Plan, and WI drafts</strong> directly from that
                  document (PFD skipped; same sequence IDs across docs). Process-type library +
                  optional AI fill failure modes. Export the editable Excel package. Change log
                  records edits (approval workflow stubbed for later).
                </p>
                <p className="note">
                  Demo:{' '}
                  <a href="/samples/demo-mpp-bop-boe.xlsx">demo-mpp-bop-boe.xlsx</a>
                  {' · '}
                  <a href="/samples/failure-mode-library.xlsx">library.xlsx</a>
                </p>
              </div>
            </>
          )}

          {plan && (
            <>
              <div className="panel-h">
                <h2>Quality package</h2>
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
                    <div className="k">PFMEA</div>
                  </div>
                  <div className="stat">
                    <div className="v">{controlPlan.length}</div>
                    <div className="k">CP rows</div>
                  </div>
                </div>

                <div className="flow" style={{ marginTop: 0 }}>
                  {(
                    [
                      ['pfmea', `PFMEA (${rows.length})`],
                      ['cp', `Control Plan (${controlPlan.length})`],
                      ['wi', `WI (${workInstructions.length})`],
                      ['changes', `Changes (${changeLog.length})`],
                    ] as [Tab, string][]
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={`flow-step ${tab === id ? 'active' : ''}`}
                      onClick={() => setTab(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

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
                      Export quality package Excel
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

              {step === 'review' && tab === 'pfmea' && (
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
                        <th>OCC</th>
                        <th>DET</th>
                        <th>RPN</th>
                        <th>AP</th>
                        <th>Type</th>
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
                              onChange={(e) => updatePfmea(r.id, 'requirement', e.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.failureMode}
                              onChange={(e) => updatePfmea(r.id, 'failureMode', e.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.failureEffect}
                              onChange={(e) => updatePfmea(r.id, 'failureEffect', e.target.value)}
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
                                updatePfmea(r.id, 'severity', Number(e.target.value) || 1)
                              }
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
                                updatePfmea(r.id, 'occurrence', Number(e.target.value) || 1)
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
                                updatePfmea(r.id, 'detection', Number(e.target.value) || 1)
                              }
                            />
                          </td>
                          <td className="num">{r.rpn}</td>
                          <td>
                            <span className={`ap ${r.actionPriority}`}>{r.actionPriority}</span>
                          </td>
                          <td className="src">{r.processType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {step === 'review' && tab === 'cp' && (
                <div className="table-wrap">
                  <table className="pfmea">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>WI #</th>
                        <th>Sl</th>
                        <th>Process characteristic</th>
                        <th>Product</th>
                        <th>Class</th>
                        <th>Spec</th>
                        <th>Method</th>
                        <th>Control</th>
                        <th>Reaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {controlPlan.map((r) => (
                        <tr key={r.id}>
                          <td>{r.operationSequence}</td>
                          <td>{r.wiNumber}</td>
                          <td>{r.slNo}</td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.processCharacteristic}
                              onChange={(e) =>
                                updateCp(r.id, 'processCharacteristic', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.productCharacteristic}
                              onChange={(e) =>
                                updateCp(r.id, 'productCharacteristic', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="num"
                              value={r.specialClass}
                              onChange={(e) => updateCp(r.id, 'specialClass', e.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.specification}
                              onChange={(e) => updateCp(r.id, 'specification', e.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.evaluationMethod}
                              onChange={(e) => updateCp(r.id, 'evaluationMethod', e.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.controlMethod}
                              onChange={(e) => updateCp(r.id, 'controlMethod', e.target.value)}
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              value={r.reactionPlan}
                              onChange={(e) => updateCp(r.id, 'reactionPlan', e.target.value)}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {step === 'review' && tab === 'wi' && (
                <div className="panel-b stack">
                  {workInstructions.map((doc) => (
                    <div key={doc.id} className="station-item">
                      <strong>
                        {doc.documentNumber} · {doc.operationSequence} — {doc.operationDescription}
                      </strong>
                      <small>
                        Rev {doc.revLevel} · {doc.steps.length} steps ·{' '}
                        {doc.equipment.join('; ') || 'no BOE equipment'}
                      </small>
                      <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.85rem' }}>
                        {doc.steps.map((s) => (
                          <li key={s.operationId + s.stepNo}>
                            {s.instruction}
                            <div className="note">
                              Tools: {s.tools} · Check: {s.qualityCheck}
                            </div>
                          </li>
                        ))}
                      </ol>
                      <p className="note">{doc.reactionRules}</p>
                    </div>
                  ))}
                </div>
              )}

              {step === 'review' && tab === 'changes' && (
                <div className="table-wrap">
                  <table className="pfmea">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Who</th>
                        <th>Where</th>
                        <th>Field</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Approval</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeLog.length === 0 && (
                        <tr>
                          <td colSpan={7}>No edits yet — changes appear when you edit PFMEA/CP.</td>
                        </tr>
                      )}
                      {changeLog.map((e) => (
                        <tr key={e.id}>
                          <td className="src">{e.at}</td>
                          <td>{e.who}</td>
                          <td>{e.where}</td>
                          <td>{e.field}</td>
                          <td>{e.before}</td>
                          <td>{e.after}</td>
                          <td>{e.approvalStatus}</td>
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
        Requirements Phase 1A: BOP/BOE → PFMEA + CP + WI · process-type library · optional AI ·
        shared sequence IDs · change log · Excel package export. Phase 2: live MPP API + 8D →
        OCC/DET for Action Priority.
      </div>
    </div>
  )
}
