import type { ProcessType } from './types'

/**
 * Expertise-based process-type mapping from BOP operation / characteristic text.
 * Requirement in PFMEA = the BOP characteristic itself; this only chooses the type.
 */
const RULES: { type: ProcessType; patterns: RegExp[] }[] = [
  {
    type: 'Torquing & Fastening',
    patterns: [
      /torqu/i,
      /tighten/i,
      /re-torqu/i,
      /pre-?thread/i,
      /pre-?fit.*bolt/i,
      /secure torque gun/i,
      /nut\b.*bolt|bolt\b.*nut/i,
      /torque mark/i,
    ],
  },
  {
    type: 'Press Fit',
    patterns: [
      /cylinder presses/i,
      /press(?:es|ing|-fit)?/i,
      /pressing mandrel/i,
      /press-fit/i,
      /bearing.*insert|insert.*bearing/i,
      /oil seal|shaft seal|radial shaft seal/i,
    ],
  },
  {
    type: 'Oil Fill',
    patterns: [/oil fill/i, /oil filling/i],
  },
  {
    type: 'Oil / Lubrication',
    patterns: [/apply oil/i, /oil brush/i, /apply.*grease/i, /grease/i, /lubric/i],
  },
  {
    type: 'Leak Test',
    patterns: [/leak test/i, /\bleak\b/i],
  },
  {
    type: 'Inspection / Test',
    patterns: [/backlash/i, /nvh/i, /visual inspection/i, /inspect/i, /\btest(?:ing|er)?\b/i],
  },
  {
    type: 'Scanning / Traceability',
    patterns: [/scan(?:ner|ning)?/i, /qr\b/i, /barcode/i, /\bmes\b/i],
  },
  {
    type: 'Loading / Placement',
    patterns: [
      /pick .+ (?:and )?(?:place|align|seat|position)/i,
      /place .+ (?:on|onto|into)/i,
      /position .+ (?:onto|on|into|with alignment)/i,
      /align and (?:place|seat)/i,
      /within reach align and place/i,
    ],
  },
  {
    type: 'Assembly / Insertion',
    patterns: [
      /assembl/i,
      /insert/i,
      /gasket/i,
      /dowel/i,
      /pre-assembl/i,
      /obtain .+(?:and |& )?(?:insert|seat|align|place|pre-)/i,
      /closing/i,
      /coupling/i,
      /o-?ring/i,
      /breather/i,
      /lock .+ cables/i,
    ],
  },
  {
    type: 'Handling / Transfer',
    patterns: [
      /movement of/i,
      /transfer/i,
      /move .+ from/i,
      /wpc (?:is )?(?:lifted|released|moves)/i,
      /lift(?:s|ed)? the wpc/i,
      /release wpc/i,
      /return(?:s)? to the home position/i,
      /cylinder (?:lifts|moves|releases)/i,
      /horizontal (?:support )?block moves/i,
      /push button/i,
      /walk two steps/i,
      /trolley/i,
      /unload/i,
    ],
  },
]

export function classifyProcessType(operationName: string, stationName = ''): ProcessType {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(operationName))) return rule.type
  }
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(stationName))) return rule.type
  }
  return 'General Process'
}

export function isLikelyMoveOnly(operationName: string): boolean {
  return /^(movement of|move .+ from|transfer .+ from|depress push button|actuate push button|tap push button|wpc (is )?(automatically )?lifted|wpc moves down|return to the home position|return home position)/i.test(
    operationName.trim(),
  )
}

/**
 * PFMEA Requirement = BOP process characteristic / operation text (as on the sheet).
 * Do not rephrase — analysts own wording; process type is separate.
 */
export function requirementFromOperation(opName: string, _processType?: ProcessType): string {
  return opName.replace(/\.$/, '').trim()
}
