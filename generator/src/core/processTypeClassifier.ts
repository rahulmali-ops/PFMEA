import type { ProcessType } from './types'

const RULES: { type: ProcessType; patterns: RegExp[] }[] = [
  {
    type: 'Torquing & Fastening',
    patterns: [/torqu/i, /tighten/i, /bolt/i, /fasten/i, /nut\b/i, /screw/i],
  },
  {
    type: 'Press Fit',
    patterns: [/press/i, /bearing/i, /oil seal/i, /seal press/i, /cylinder press/i],
  },
  {
    type: 'Oil / Lubrication',
    patterns: [/apply oil/i, /oil brush/i, /lubric/i, /grease/i],
  },
  {
    type: 'Oil Fill',
    patterns: [/oil fill/i, /filling/i, /drain plug/i],
  },
  {
    type: 'Leak Test',
    patterns: [/leak/i],
  },
  {
    type: 'Inspection / Test',
    patterns: [/test/i, /inspect/i, /backlash/i, /nvh/i, /check/i, /measure/i],
  },
  {
    type: 'Scanning / Traceability',
    patterns: [/scan/i, /qr\b/i, /barcode/i, /mes\b/i],
  },
  {
    type: 'Handling / Transfer',
    patterns: [/movement of/i, /transfer/i, /move\b/i, /lift/i, /wpc/i, /pallet/i, /push button/i, /unload/i],
  },
  {
    type: 'Loading / Placement',
    patterns: [/pick\b/i, /place\b/i, /load/i, /align/i, /orient/i],
  },
  {
    type: 'Assembly / Insertion',
    patterns: [/assembl/i, /insert/i, /gasket/i, /dowel/i, /pre-assembl/i, /obtain\b/i, /closing/i],
  },
]

export function classifyProcessType(operationName: string, stationName = ''): ProcessType {
  const text = `${operationName} ${stationName}`
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.type
  }
  return 'General Process'
}

export function isLikelyMoveOnly(operationName: string): boolean {
  return /movement of|move .+ from|transfer .+ from|depress push button|actuate push button|cycle completion/i.test(
    operationName,
  )
}

export function requirementFromOperation(opName: string, processType: ProcessType): string {
  const clean = opName.replace(/\.$/, '').trim()
  switch (processType) {
    case 'Torquing & Fastening':
      return `Correct torque / fastening: ${clean}`
    case 'Press Fit':
      return `Correct press fit / seating: ${clean}`
    case 'Oil / Lubrication':
      return `Correct oil / lubricant application: ${clean}`
    case 'Scanning / Traceability':
      return `Correct part identification / scan: ${clean}`
    case 'Leak Test':
      return `Leak test within specification: ${clean}`
    case 'Inspection / Test':
      return `Inspection / test within specification: ${clean}`
    case 'Oil Fill':
      return `Correct oil fill quantity: ${clean}`
    case 'Loading / Placement':
      return `Correct loading / orientation: ${clean}`
    case 'Assembly / Insertion':
      return `Correct assembly / insertion: ${clean}`
    case 'Handling / Transfer':
      return `Correct handling without damage: ${clean}`
    default:
      return `Process requirement: ${clean}`
  }
}
