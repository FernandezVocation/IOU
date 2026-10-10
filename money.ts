const digitCache = new Map<string, number>()

/** Decimal places a currency uses (JPY 0, CAD 2, KWD 3). */
export function currencyDigits(cur: string): number {
  const hit = digitCache.get(cur)
  if (hit !== undefined) return hit
  let d = 2
  try {
    d = new Intl.NumberFormat('en', { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits ?? 2
  } catch { /* unknown code: keep 2 */ }
  digitCache.set(cur, d)
  return d
}

export function isValidCurrency(c: string): boolean {
  if (!/^[A-Z]{3}$/.test(c)) return false
  try { new Intl.NumberFormat('en', { style: 'currency', currency: c }); return true } catch { return false }
}

/** Decimal amount -> integer minor units (cents). Guards float noise like 1.005 * 100. */
export function toMinor(amount: number, cur: string): number {
  return Math.round(Number((amount * 10 ** currencyDigits(cur)).toPrecision(15)))
}
export function fromMinor(minor: number, cur: string): number {
  return minor / 10 ** currencyDigits(cur)
}

const fmtCache = new Map<string, Intl.NumberFormat>()
/** "CAD 1,234.50" */
export function fmtMoney(minor: number, cur: string): string {
  let f = fmtCache.get(cur)
  if (!f) { f = new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, currencyDisplay: 'code' }); fmtCache.set(cur, f) }
  return f.format(fromMinor(minor, cur)).replace(/\u00a0/g, ' ')
}
/** "1,234.50" without the code */
export function fmtPlain(minor: number, cur: string): string {
  const d = currencyDigits(cur)
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(fromMinor(minor, cur))
}

/** Lenient number parsing for phone keyboards: "12,50", "1,234.50", "1 234". NaN when invalid. */
export function parseNum(input: string): number {
  let s = String(input ?? '').trim().replace(/\s/g, '')
  if (!s) return NaN
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else if (s.includes(',') && !s.includes('.')) s = s.replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Split an integer total across weights. The parts always add up to exactly `total`;
 * leftover units go to the largest fractional remainders (ties: first listed).
 */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (!(sum > 0)) return weights.map(() => 0)
  const raw = weights.map(w => (total * w) / sum)
  const out = raw.map(Math.floor)
  let rem = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ frac: r - out[i], i })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (let k = 0; rem > 0; k++, rem--) out[order[k % order.length].i]++
  return out
}
