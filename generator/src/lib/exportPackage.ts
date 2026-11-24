import ExcelJS from 'exceljs'
import type { ProcessPlan } from '../adapters/types'
import type { ChangeLogEntry, ControlPlanRow, PfmeaRow, WorkInstruction } from '../core/types'

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1419' } }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  })
  row.height = 32
}

export async function exportQualityPackage(opts: {
  plan: ProcessPlan
  pfmea: PfmeaRow[]
  controlPlan: ControlPlanRow[]
  workInstructions: WorkInstruction[]
  changeLog?: ChangeLogEntry[]
}): Promise<Blob> {
  const { plan, pfmea, controlPlan, workInstructions, changeLog = [] } = opts
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PFMEA Generator'
  wb.created = new Date()

  // --- Process from BOP/BOE ---
  const map = wb.addWorksheet('Process from BOP-BOE')
  map.getCell('A1').value =
    'Process steps from MPP BOP/BOE (PFD skipped — shared seq/description feed PFMEA / CP / WI)'
  map.getCell('A1').font = { bold: true }
  map.getRow(2).values = [
    'Station Code',
    'Station',
    'Station ID',
    'Equipment (BOE)',
    'Op ID',
    'Operation (BOP)',
    'Parts',
    'Step class hint',
  ]
  styleHeader(map.getRow(2))
  let rIdx = 3
  for (const st of plan.line.stations) {
    const equip = st.equipment.map((e) => e.name).join('; ')
    if (!st.operations.length) {
      map.getRow(rIdx++).values = [st.code, st.name, st.id, equip, '', '', '', '']
      continue
    }
    for (const op of st.operations) {
      map.getRow(rIdx++).values = [
        st.code,
        st.name,
        st.id,
        equip,
        op.id,
        op.name,
        op.parts.map((p) => p.name).join('; '),
        /move|transfer|lift|wpc/i.test(op.name) ? 'Move' : 'Process',
      ]
    }
  }
  ;[12, 40, 14, 28, 14, 50, 36, 12].forEach((w, i) => {
    map.getColumn(i + 1).width = w
  })

  // --- PFMEA ---
  const ws = wb.addWorksheet('PFMEA', { views: [{ state: 'frozen', ySplit: 6 }] })
  ws.mergeCells('A1', 'U1')
  ws.getCell('A1').value = 'Process Failure Mode and Effects Analysis'
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = 'Source'
  ws.getCell('B2').value = plan.sourceLabel
  ws.getCell('A3').value = 'Line'
  ws.getCell('B3').value = plan.line.name
  ws.getCell('A4').value = 'Area'
  ws.getCell('B4').value = plan.line.areaName || ''
  ws.getCell('A5').value = 'Generated'
  ws.getCell('B5').value = new Date().toISOString().slice(0, 10)

  const pfmeaHeaders = [
    'Operation Sequence No.',
    'Operation Description',
    'S No',
    'Requirement',
    'Potential Failure Mode',
    'Potential Failure Effects',
    'SEV',
    'Class',
    'Potential Cause(s) of Failure',
    'OCC',
    'Current PROCESS Controls - Prevention -',
    'Current PROCESS Controls - Detection -',
    'DET',
    'RPN',
    'Action Priority',
    'Actions Recommended',
    'Responsibility and Target Date',
    'Actions Taken and Completion Date',
    'SEV',
    'OCC',
    'DET',
    'RPN',
    'Process Type',
    'Source',
  ]
  const ph = ws.getRow(6)
  pfmeaHeaders.forEach((h, i) => {
    ph.getCell(i + 1).value = h
  })
  styleHeader(ph)
  pfmea.forEach((r, idx) => {
    ws.getRow(7 + idx).values = [
      r.operationSequence,
      r.operationDescription,
      r.sNo,
      r.requirement,
      r.failureMode,
      r.failureEffect,
      r.severity,
      r.classification,
      r.cause,
      r.occurrence,
      r.preventionControl,
      r.detectionControl,
      r.detection,
      r.rpn,
      r.actionPriority,
      r.recommendedActions,
      r.responsibility,
      r.actionsTaken,
      r.revSeverity === '' ? '' : r.revSeverity,
      r.revOccurrence === '' ? '' : r.revOccurrence,
      r.revDetection === '' ? '' : r.revDetection,
      r.revRpn === '' ? '' : r.revRpn,
      r.processType,
      r.source,
    ]
  })

  // --- Control Plan ---
  const cp = wb.addWorksheet('Control Plan', { views: [{ state: 'frozen', ySplit: 6 }] })
  cp.getCell('A1').value = 'PROCESS CONTROL PLAN'
  cp.getCell('A1').font = { bold: true, size: 14 }
  cp.getCell('A2').value = 'Source'
  cp.getCell('B2').value = plan.sourceLabel
  cp.getCell('A3').value = 'Line'
  cp.getCell('B3').value = plan.line.name
  const cpHeaders = [
    'Sub Assembly / Station',
    'Operation Description',
    'WI Number (AE-WI-###)',
    'Machine / Device / Jigs / Tools',
    'Sl. No',
    'Product Characteristic',
    'Process Characteristic',
    'Spl. Character Class',
    'Specification Tolerance',
    'Evaluation / Measurement tool',
    'Sample size',
    'Frequency',
    'RESP',
    'Cp / Cpk',
    'Control Method',
    'Reaction plan',
  ]
  const cph = cp.getRow(6)
  cpHeaders.forEach((h, i) => {
    cph.getCell(i + 1).value = h
  })
  styleHeader(cph)
  controlPlan.forEach((r, idx) => {
    cp.getRow(7 + idx).values = [
      r.operationSequence,
      r.operationDescription,
      r.wiNumber,
      r.equipment,
      r.slNo,
      r.productCharacteristic,
      r.processCharacteristic,
      r.specialClass,
      r.specification,
      r.evaluationMethod,
      r.sampleSize,
      r.frequency,
      r.responsibility,
      r.capability,
      r.controlMethod,
      r.reactionPlan,
    ]
  })

  // --- Work Instructions (one row per step) ---
  const wi = wb.addWorksheet('Work Instructions')
  wi.getCell('A1').value = 'Work Instructions (draft from BOP/BOE)'
  wi.getCell('A1').font = { bold: true, size: 14 }
  const wiHeaders = [
    'WI Number',
    'Rev',
    'Station Code',
    'Station Description',
    'Step No',
    'Operator Step',
    'Tools / Fixtures',
    'In-process check',
    'Safety notes',
    'Reaction / out-of-spec',
    'Equipment list',
  ]
  const wih = wi.getRow(3)
  wiHeaders.forEach((h, i) => {
    wih.getCell(i + 1).value = h
  })
  styleHeader(wih)
  let wiRow = 4
  for (const doc of workInstructions) {
    if (!doc.steps.length) {
      wi.getRow(wiRow++).values = [
        doc.documentNumber,
        doc.revLevel,
        doc.operationSequence,
        doc.operationDescription,
        '',
        '',
        '',
        '',
        doc.safetyNotes,
        doc.reactionRules,
        doc.equipment.join('; '),
      ]
      continue
    }
    for (const step of doc.steps) {
      wi.getRow(wiRow++).values = [
        doc.documentNumber,
        doc.revLevel,
        doc.operationSequence,
        doc.operationDescription,
        step.stepNo,
        step.instruction,
        step.tools,
        step.qualityCheck,
        doc.safetyNotes,
        doc.reactionRules,
        doc.equipment.join('; '),
      ]
    }
  }

  // --- Change log ---
  const ch = wb.addWorksheet('Change Log')
  ch.getCell('A1').value = 'Change management log (draft — approval workflow Phase 1A stub)'
  ch.getCell('A1').font = { bold: true }
  const chh = ch.getRow(2)
  ;['When', 'Who', 'Where', 'Field', 'Before', 'After', 'Approval'].forEach((h, i) => {
    chh.getCell(i + 1).value = h
  })
  styleHeader(chh)
  changeLog.forEach((e, idx) => {
    ch.getRow(3 + idx).values = [e.at, e.who, e.where, e.field, e.before, e.after, e.approvalStatus]
  })

  // --- Ranking criteria (from plant PFMEA Ranking sheet) ---
  const rk = wb.addWorksheet('PFMEA - Ranking')
  rk.getCell('A1').value = 'Suggested PFMEA Severity Evaluation Criteria'
  rk.getCell('G1').value = 'Suggested PFMEA Occurrence Evaluation Criteria'
  rk.getCell('K1').value = 'Suggested PFMEA Prevention / Detection Evaluation Criteria'
  rk.getCell('A1').font = { bold: true }
  rk.getCell('G1').font = { bold: true }
  rk.getCell('K1').font = { bold: true }
  rk.getRow(2).values = [
    'Rank',
    'Effect (Product)',
    'Severity criteria (product)',
    'Effect (Process)',
    'Severity criteria (process)',
    '',
    'Rank',
    'Likelihood of Failure',
    'Occurrence criteria',
    '',
    'Rank',
    'Likelihood of Detection',
    'Detection criteria',
  ]
  styleHeader(rk.getRow(2))
  const rankingRows: (string | number)[][] = [
    [10, 'Safety / regulatory', 'Affects safe vehicle operation / regulatory noncompliance', 'Operator safety', 'May endanger operator', '', 10, 'Very High', '≥ 100 per thousand', '', 10, 'Almost Impossible', 'No detection opportunity'],
    [9, 'Loss with warning', 'Loss with warning — loss of primary function', 'Major disruption', '100% of product may have to be scrapped', '', 9, 'Very High', '50 per thousand', '', 9, 'Very Remote', 'Detection method unreliable'],
    [8, 'Loss of primary function', 'Loss of primary function', 'Major disruption', 'Line stoppage / significant rework', '', 8, 'High', '20 per thousand', '', 8, 'Remote', 'Detection after process'],
    [7, 'Reduced primary function', 'Degraded primary function', 'Significant disruption', 'Portion may be scrapped', '', 7, 'High', '10 per thousand', '', 7, 'Very Low', 'Detection at source unlikely'],
    [6, 'Loss of secondary function', 'Comfort / convenience loss', 'Moderate disruption', 'Offline rework', '', 6, 'Moderate', '5 per thousand', '', 6, 'Low', 'Detection after process possible'],
    [5, 'Reduced secondary function', 'Degraded secondary function', 'Moderate disruption', 'Online rework portion', '', 5, 'Moderate', '2 per thousand', '', 5, 'Moderate', 'Detection at source possible'],
    [4, 'Minor fit/finish', 'Most customers notice', 'Moderate disruption', 'Online rework', '', 4, 'Moderate', '1 per thousand', '', 4, 'Moderately High', 'Detection likely'],
    [3, 'Minor fit/finish', 'Average customers notice', 'Moderate disruption', 'Online rework portion', '', 3, 'Low', '0.5 per thousand', '', 3, 'High', 'Detection highly likely'],
    [2, 'Minor fit/finish', 'Discriminating customers notice', 'Minor disruption', 'Slight inconvenience', '', 2, 'Low', '0.1 per thousand', '', 2, 'Very High', 'Detection almost certain'],
    [1, 'No discernible effect', 'No effect', 'No discernible effect', 'No effect', '', 1, 'Very Low', '≤ 0.01 per thousand', '', 1, 'Almost Certain', 'Error-proofed / cannot pass defect'],
  ]
  rankingRows.forEach((vals, idx) => {
    rk.getRow(4 + idx).values = vals
  })
  rk.getCell('A15').value =
    'Reference: plant PFMEA Ranking sheet (see samples/pfmea-ranking.xlsx). Use when setting SEV/OCC/DET.'
  ;[8, 22, 36, 18, 36, 3, 8, 18, 22, 3, 8, 18, 28].forEach((w, i) => {
    rk.getColumn(i + 1).width = w
  })

  // Document numbers note matching plant refs
  const meta = wb.addWorksheet('Document Control')
  meta.getCell('A1').value = 'Document control (aligned to AE VL package + AE-H-GB-WI-###)'
  meta.getCell('A1').font = { bold: true }
  meta.getRow(3).values = ['Document', 'Number pattern', 'Notes']
  styleHeader(meta.getRow(3))
  meta.getRow(4).values = ['PFMEA', 'AE / VL / PFMEA', 'Shared Operation Sequence No. + Description with CP / WI']
  meta.getRow(5).values = ['Control Plan', 'AE / VL / CP', 'WI Number column uses AE-H-GB-WI-###']
  meta.getRow(6).values = ['Work Instruction', 'AE-H-GB-WI-###', '### from station number (GA 10 → 010); plant/line digits per WI nomenclature']
  meta.getRow(7).values = ['Process map', 'from BOP/BOE', 'PFD skipped in MVP — same sequence feeds all docs']
  meta.getColumn(1).width = 18
  meta.getColumn(2).width = 22
  meta.getColumn(3).width = 70

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
