import ExcelJS from 'exceljs'
import type { PfmeaRow } from '../core/types'
import type { ProcessPlan } from '../adapters/types'

export async function exportPfmeaWorkbook(
  rows: PfmeaRow[],
  plan: ProcessPlan,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PFMEA Generator'
  wb.created = new Date()

  const ws = wb.addWorksheet('PFMEA', {
    views: [{ state: 'frozen', ySplit: 6 }],
  })

  ws.mergeCells('A1', 'U1')
  ws.getCell('A1').value = 'Process Failure Mode and Effects Analysis'
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF0F1419' } }

  ws.getCell('A2').value = 'Company name'
  ws.getCell('B2').value = ''
  ws.getCell('F2').value = 'PFMEA No'
  ws.getCell('H2').value = ''
  ws.getCell('J2').value = 'Source'
  ws.getCell('L2').value = plan.sourceLabel

  ws.getCell('A3').value = 'Model / Year'
  ws.getCell('B3').value = plan.line.name
  ws.getCell('F3').value = 'PFMEA Created on'
  ws.getCell('H3').value = new Date().toISOString().slice(0, 10)
  ws.getCell('J3').value = 'Area'
  ws.getCell('L3').value = plan.line.areaName || ''

  ws.getCell('A4').value = 'Part Number / Rev No'
  ws.getCell('B4').value = ''
  ws.getCell('F4').value = 'PFMEA rev no'
  ws.getCell('H4').value = '0.1'
  ws.getCell('J4').value = 'Prepared By'
  ws.getCell('L4').value = ''

  ws.getCell('A5').value = 'Part Description'
  ws.getCell('B5').value = ''
  ws.getCell('F5').value = 'Stations'
  ws.getCell('H5').value = plan.line.stations.length
  ws.getCell('J5').value = 'Generated rows'
  ws.getCell('L5').value = rows.length

  const headers = [
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

  const headerRow = ws.getRow(6)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F1419' },
    }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  })
  headerRow.height = 36

  rows.forEach((r, idx) => {
    const row = ws.getRow(7 + idx)
    const values = [
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
    values.forEach((v, i) => {
      row.getCell(i + 1).value = v as ExcelJS.CellValue
      row.getCell(i + 1).alignment = { wrapText: true, vertical: 'top' }
    })
    if (r.actionPriority === 'H') {
      row.getCell(15).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFECACA' },
      }
    } else if (r.actionPriority === 'M') {
      row.getCell(15).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFDE68A' },
      }
    }
  })

  const widths = [14, 36, 8, 40, 28, 32, 6, 8, 28, 6, 28, 28, 6, 8, 8, 28, 22, 22, 6, 6, 6, 8, 18, 10]
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  // Process map sheet (BOP/BOE derived — PFD skipped)
  const map = wb.addWorksheet('Process from BOP-BOE')
  map.getCell('A1').value = 'Stations & operations extracted from MPP BOP/BOE (PFD skipped)'
  map.getCell('A1').font = { bold: true }
  map.getRow(2).values = ['Station Code', 'Station', 'Station ID', 'Equipment', 'Op ID', 'Operation', 'Parts']
  map.getRow(2).font = { bold: true }
  let rIdx = 3
  for (const st of plan.line.stations) {
    const equip = st.equipment.map((e) => e.name).join('; ')
    if (!st.operations.length) {
      map.getRow(rIdx).values = [st.code, st.name, st.id, equip, '', '', '']
      rIdx++
      continue
    }
    for (const op of st.operations) {
      map.getRow(rIdx).values = [
        st.code,
        st.name,
        st.id,
        equip,
        op.id,
        op.name,
        op.parts.map((p) => p.name).join('; '),
      ]
      rIdx++
    }
  }
  ;[12, 40, 14, 28, 14, 50, 40].forEach((w, i) => {
    map.getColumn(i + 1).width = w
  })

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
