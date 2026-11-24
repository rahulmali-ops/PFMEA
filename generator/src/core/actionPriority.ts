/** AIAG-VDA style Action Priority (simplified, matches existing suite). */
export function calculateAP(s: number, o: number, d: number): 'H' | 'M' | 'L' {
  s = Math.min(10, Math.max(1, Math.round(s) || 1))
  o = Math.min(10, Math.max(1, Math.round(o) || 1))
  d = Math.min(10, Math.max(1, Math.round(d) || 1))

  if (s === 1) return 'L'
  if (s >= 9) {
    if (o >= 8) return 'H'
    if (o >= 4) return d >= 2 ? 'H' : 'M'
    return d >= 5 ? 'H' : d >= 2 ? 'M' : 'L'
  }
  if (s >= 7) {
    if (o >= 8) return 'H'
    if (o >= 4) return d >= 5 ? 'H' : 'M'
    return d >= 5 ? 'M' : 'L'
  }
  if (s >= 4) {
    if (o >= 6) return d >= 5 ? 'H' : 'M'
    return d >= 5 ? 'M' : 'L'
  }
  if (o >= 6) return d >= 5 ? 'M' : 'L'
  return 'L'
}

export function calcRpn(s: number, o: number, d: number): number {
  return (Math.round(s) || 1) * (Math.round(o) || 1) * (Math.round(d) || 1)
}
