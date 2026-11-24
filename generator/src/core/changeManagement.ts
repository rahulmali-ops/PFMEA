/**
 * Change-management hooks (stub for Phase 2).
 *
 * When MPP/API becomes the live source of truth, the generator should:
 * 1. Diff ProcessPlan revisions by station/op IDs
 * 2. Propagate adds/removes/renames into PFMEA rows (keep analyst edits where IDs match)
 * 3. Flag orphaned PFMEA rows and new ops needing analysis
 * 4. Keep sequence number + operation description consistent across PFMEA / CP / WI
 *
 * Core generator stays source-agnostic via ProcessInputAdapter → ProcessPlan.
 */

export type ChangeKind = 'added' | 'removed' | 'renamed' | 'unchanged'

export interface ProcessDelta {
  stationId: string
  operationId: string
  kind: ChangeKind
  beforeName?: string
  afterName?: string
}

export function diffOperationNames(
  previous: { id: string; name: string }[],
  next: { id: string; name: string }[],
): ProcessDelta[] {
  const prevMap = new Map(previous.map((o) => [o.id, o.name]))
  const nextMap = new Map(next.map((o) => [o.id, o.name]))
  const ids = new Set([...prevMap.keys(), ...nextMap.keys()])
  const out: ProcessDelta[] = []
  for (const id of ids) {
    const before = prevMap.get(id)
    const after = nextMap.get(id)
    if (before == null && after != null) {
      out.push({ stationId: '', operationId: id, kind: 'added', afterName: after })
    } else if (before != null && after == null) {
      out.push({ stationId: '', operationId: id, kind: 'removed', beforeName: before })
    } else if (before !== after) {
      out.push({
        stationId: '',
        operationId: id,
        kind: 'renamed',
        beforeName: before,
        afterName: after,
      })
    } else {
      out.push({ stationId: '', operationId: id, kind: 'unchanged', beforeName: before, afterName: after })
    }
  }
  return out
}
