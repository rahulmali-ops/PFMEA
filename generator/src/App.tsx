import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { parseBopBoePdfs, parseMppExcelFile, type ProcessPlan } from './adapters'
import { applySuggestions, recomputeRow } from './core/generator'
import { generateQualityPackage, logChange } from './core/qualityPackage'
import type {
  ChangeLogEntry,
  ControlPlanRow,
  GenerateOptions,
  LibraryEntry,
  PfmeaRow,
  PfmeaSuggestions,
  WorkInstruction,
} from './core/types'
import { downloadBlob, exportQualityPackage } from './lib/exportPackage'
import { getDefaultLibrary, parseLibraryFile } from './lib/libraryExcel'
import { fetchOllamaStatus, type OllamaStatus } from './lib/ollama'

type Step = 'upload' | 'stations' | 'review'
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
      operations: s.operations.map((o) => o.name),
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

  /** Step 1 — extract stations/ops from BOP only */
  async function extractStations() {
    setBusy(true)
    setError(null)
    try {
      const nextPlan = mppFile
        ? await parseMppExcelFile(mppFile)
        : await parseBopBoePdfs({ bop: bopFile, boe: boeFile, combined: combinedFile })
      setPlan(nextPlan)
      setRows([])
      setControlPlan([])
      setWorkInstructions([])
      setChangeLog([])
      setStep('stations')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed')
    } finally {
      setBusy(false)
    }
  }

  /** Step 2 — auto: requirements + process type + failure modes; rest blank + suggestions */
  async function buildPfmeaSkeleton() {
    if (!plan) return
    setBusy(true)
    setError(null)
    try {
      const pkg = await generateQualityPackage({ plan, library, options })
      setRows(pkg.pfmea)
      setControlPlan(pkg.controlPlan)
      setWorkInstructions(pkg.workInstructions)
      setTab('pfmea')
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PFMEA build failed')
    } finally {
      setBusy(false)
    }
  }

  function updatePfmea(id: string, field: keyof PfmeaRow, value: string | number) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const before = String(r[field] ?? '')
        const next = recomputeRow({ ...r, [field]: value, source: 'manual' } as PfmeaRow)
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

  function onApplySuggestion(id: string, fields?: (keyof PfmeaSuggestions)[]) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const next = applySuggestions(r, fields)
        setChangeLog((log) =>
          logChange(log, {
            who: 'analyst',
            where: `PFMEA · ${r.operationSequence} · S${r.sNo}`,
            field: fields?.join(',') || 'all suggestions',
            before: '(blank)',
            after: 'applied library suggestion',
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

  const canExtract = !!mppFile || !!combinedFile || !!bopFile || !!boeFile
  const totalOps = plan ? plan.line.stations.reduce((n, s) => n + s.operations.length, 0) : 0

  return (
    <div className="app-shell">
      <header className="hero">
        <h1 className="brand">
          PFMEA <span>Generator</span>
        </h1>
        <p className="lede">
          BOP characteristics become PFMEA <strong>requirements</strong>. Expertise maps each to a{' '}
          <strong>process type</strong>; that type brings its library of{' '}
          <strong>failure modes</strong>. Effects, ratings, and controls stay manual — suggestions
          only.
        </p>
        <div className="flow">
          <div className={`flow-step ${step === 'upload' ? 'active' : ''}`}>
            <span className="n">01</span> Upload BOP/BOE
          </div>
          <div className={`flow-step ${step === 'stations' ? 'active' : ''}`}>
            <span className="n">02</span> Stations from BOP
          </div>
          <div className={`flow-step ${step === 'review' ? 'active' : ''}`}>
            <span className="n">03</span> PFMEA (auto + manual)
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="panel">
          <div className="panel-h">
            <h2>Inputs</h2>
            <span className="meta">BOP first → guided PFMEA</span>
          </div>
          <div className="panel-b stack">
            <div className="btn-row">
              <button type="button" className="secondary" onClick={loadDemoMpp} disabled={busy}>
                Load demo MPP + library
              </button>
            </div>

            <label className="field">
              MPP BOP/BOE Excel
              <div className="drop">
                <strong>Full Teamcenter sheet</strong>
                <span>Stations & operations extracted first</span>
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
                <span>Used to auto process type + failure modes; other fields = suggestions</span>
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
                <label htmlFor="moves">Include move / transfer ops</label>
              </div>
              <div className="toggle">
                <input
                  id="ollama"
                  type="checkbox"
                  checked={options.useOllama}
                  disabled={!ollama?.available}
                  onChange={(e) => setOptions((o) => ({ ...o, useOllama: e.target.checked }))}
                />
                <label htmlFor="ollama">Local Ollama for process type / FM assist</label>
              </div>
              {ollama?.available ? (
                <span className="pill ok">Local Ollama ready</span>
              ) : (
                <span className="pill bad">Local Ollama offline — library only</span>
              )}
            </div>

            {error && <p className="note warn">{error}</p>}

            <div className="btn-row">
              {step === 'upload' && (
                <button
                  type="button"
                  className="primary"
                  disabled={!canExtract || busy}
                  onClick={extractStations}
                >
                  {busy ? 'Extracting…' : '1. Extract stations from BOP'}
                </button>
              )}
              {step === 'stations' && (
                <>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || !plan}
                    onClick={buildPfmeaSkeleton}
                  >
                    {busy ? 'Building…' : '2. Auto-fill req / type / failure modes'}
                  </button>
                  <button type="button" className="secondary" onClick={() => setStep('upload')}>
                    Back
                  </button>
                </>
              )}
              {step === 'review' && (
                <>
                  <button type="button" className="primary" onClick={onExport}>
                    Export Excel
                  </button>
                  <button type="button" className="secondary" onClick={() => setStep('stations')}>
                    Back to stations
                  </button>
                </>
              )}
            </div>

            <div className="legend stack">
              <p className="note">
                <strong>Requirement</strong> = BOP step/characteristic text (e.g. “SECURE TORQUE
                GUN TIGHTEN BOLT…”).
              </p>
              <p className="note">
                <strong>Auto:</strong> Seq · Requirement · Process type · Failure modes (all for
                that type)
              </p>
              <p className="note">
                <strong>Manual + suggestions:</strong> Effect, SEV/OCC/DET, Cause, Controls, Actions
              </p>
            </div>
          </div>
        </aside>

        <main className="panel">
          {step === 'upload' && !plan && (
            <>
              <div className="panel-h">
                <h2>How PFMEA is built</h2>
              </div>
              <div className="panel-b stack">
                <p className="note">
                  1. Extract stations/ops from BOP (machines & parts stay on the process map, not as
                  requirements).
                  <br />
                  2. Each BOP characteristic is the PFMEA <em>requirement</em>; expertise assigns a{' '}
                  <em>process type</em>; the library attaches <em>all failure modes</em> for that
                  type.
                  <br />
                  3. You fill effects, SEV/OCC/DET, causes, and controls — suggestions are optional.
                </p>
              </div>
            </>
          )}

          {plan && step === 'stations' && (
            <>
              <div className="panel-h">
                <h2>Stations from BOP</h2>
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
                    <div className="v">{library.length}</div>
                    <div className="k">Library</div>
                  </div>
                  <div className="stat">
                    <div className="v">—</div>
                    <div className="k">PFMEA next</div>
                  </div>
                </div>
                <p className="note">
                  Review stations below, then continue to auto-fill requirements, process types, and
                  failure modes.
                </p>
                <div className="station-list">
                  {stationSummary.map((s) => (
                    <div key={s.code + s.name} className="station-item">
                      <strong>
                        {s.code} — {s.name}
                      </strong>
                      <small>
                        {s.ops} ops · {s.eq} equipment
                      </small>
                      <ol className="op-list">
                        {s.operations.map((name, i) => (
                          <li key={i}>{name}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {plan && step === 'review' && (
            <>
              <div className="panel-h">
                <h2>PFMEA workspace</h2>
                <span className="meta">
                  Auto columns locked-in · manual columns blank + suggestions
                </span>
              </div>
              <div className="panel-b stack">
                <div className="stats">
                  <div className="stat">
                    <div className="v">{plan.line.stations.length}</div>
                    <div className="k">Stations</div>
                  </div>
                  <div className="stat">
                    <div className="v">{totalOps}</div>
                    <div className="k">Ops</div>
                  </div>
                  <div className="stat">
                    <div className="v">{rows.length}</div>
                    <div className="k">PFMEA rows</div>
                  </div>
                  <div className="stat">
                    <div className="v">{rows.filter((r) => r.severity !== '').length}</div>
                    <div className="k">Rated</div>
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
              </div>

              {tab === 'pfmea' && (
                <div className="table-wrap">
                  <table className="pfmea">
                    <thead>
                      <tr>
                        <th>Seq</th>
                        <th>Operation</th>
                        <th>S No</th>
                        <th>Requirement (auto)</th>
                        <th>Process type (auto)</th>
                        <th>Failure mode (auto)</th>
                        <th>Effect (manual)</th>
                        <th>SEV</th>
                        <th>Cause</th>
                        <th>OCC</th>
                        <th>Prevention</th>
                        <th>Detection</th>
                        <th>DET</th>
                        <th>RPN</th>
                        <th>AP</th>
                        <th>Suggestions</th>
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
                          <td className="src">{r.processType}</td>
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
                              placeholder={r.suggestions.failureEffect || 'Enter effect…'}
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
                              placeholder={String(r.suggestions.severity)}
                              value={r.severity}
                              onChange={(e) =>
                                updatePfmea(
                                  r.id,
                                  'severity',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              placeholder={r.suggestions.cause || 'Enter cause…'}
                              value={r.cause}
                              onChange={(e) => updatePfmea(r.id, 'cause', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="num"
                              type="number"
                              min={1}
                              max={10}
                              placeholder={String(r.suggestions.occurrence)}
                              value={r.occurrence}
                              onChange={(e) =>
                                updatePfmea(
                                  r.id,
                                  'occurrence',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              placeholder={r.suggestions.preventionControl}
                              value={r.preventionControl}
                              onChange={(e) =>
                                updatePfmea(r.id, 'preventionControl', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <textarea
                              rows={2}
                              placeholder={r.suggestions.detectionControl}
                              value={r.detectionControl}
                              onChange={(e) =>
                                updatePfmea(r.id, 'detectionControl', e.target.value)
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="num"
                              type="number"
                              min={1}
                              max={10}
                              placeholder={String(r.suggestions.detection)}
                              value={r.detection}
                              onChange={(e) =>
                                updatePfmea(
                                  r.id,
                                  'detection',
                                  e.target.value === '' ? '' : Number(e.target.value),
                                )
                              }
                            />
                          </td>
                          <td className="num">{r.rpn === '' ? '—' : r.rpn}</td>
                          <td>
                            {r.actionPriority ? (
                              <span className={`ap ${r.actionPriority}`}>{r.actionPriority}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <div className="suggest">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => onApplySuggestion(r.id)}
                                title="Fill all manual fields from library suggestion"
                              >
                                Apply all
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() =>
                                  onApplySuggestion(r.id, [
                                    'failureEffect',
                                    'severity',
                                    'cause',
                                    'occurrence',
                                    'preventionControl',
                                    'detectionControl',
                                    'detection',
                                  ])
                                }
                              >
                                Ratings+text
                              </button>
                              <div className="suggest-peek">
                                S{r.suggestions.severity}/O{r.suggestions.occurrence}/D
                                {r.suggestions.detection}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'cp' && (
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
                          <td>{r.productCharacteristic}</td>
                          <td>{r.specialClass}</td>
                          <td>{r.controlMethod}</td>
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

              {tab === 'wi' && (
                <div className="panel-b stack">
                  {workInstructions.map((doc) => (
                    <div key={doc.id} className="station-item">
                      <strong>
                        {doc.documentNumber} · {doc.operationSequence} — {doc.operationDescription}
                      </strong>
                      <small>
                        {doc.steps.length} steps from BOP
                      </small>
                      <ol className="op-list">
                        {doc.steps.map((s) => (
                          <li key={s.operationId + s.stepNo}>{s.instruction}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'changes' && (
                <div className="table-wrap">
                  <table className="pfmea">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Where</th>
                        <th>Field</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changeLog.length === 0 && (
                        <tr>
                          <td colSpan={4}>Edits and applied suggestions appear here.</td>
                        </tr>
                      )}
                      {changeLog.map((e) => (
                        <tr key={e.id}>
                          <td className="src">{e.at}</td>
                          <td>{e.where}</td>
                          <td>{e.field}</td>
                          <td>{e.after}</td>
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
        Auto from BOP/library: station sequence, requirements, process type, failure modes. Manual
        with suggestions: effects, SEV/OCC/DET, causes, controls, actions.
      </div>
    </div>
  )
}
