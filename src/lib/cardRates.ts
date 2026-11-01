import type { GroupData } from './types'

/** The key a bill > card rate is stored under in the group's rates: 1 EUR = x QAR is 'EUR>QAR'. */
export const pairKey = (bill: string, card: string): string => bill + '>' + card
export const isPairKey = (k: string): boolean => k.includes('>')

/** Bill > card pairs worth showing: every foreign bill currency against every card currency the group uses, plus any already set. */
export function suggestPairs(d: GroupData): Array<[string, string]> {
  const base = d.group.currency
  const bills = new Set<string>(), cards = new Set<string>()
  for (const e of d.expenses) { if (e.currency !== base) bills.add(e.currency); for (const c of [e.card_currency, e.charged_currency]) if (c && c !== base) cards.add(c) }
  if (d.group.spending_currency && d.group.spending_currency !== base) bills.add(d.group.spending_currency)
  for (const t of d.travelers) if (t.statement_currency && t.statement_currency !== base) cards.add(t.statement_currency)
  const out = new Map<string, [string, string]>()
  for (const b of bills) for (const c of cards) if (b !== c) out.set(pairKey(b, c), [b, c])
  for (const k of Object.keys(d.rates)) if (isPairKey(k)) { const [b, c] = k.split('>'); out.set(k, [b, c]) }
  return [...out.values()].sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]))
}

/** The rate people actually got: card amount charged / bill amount, over expenses that have both typed. Null if none. */
export function observedPairRate(d: GroupData, bill: string, card: string): { rate: number; count: number } | null {
  let a = 0, b = 0, count = 0
  for (const e of d.expenses) {
    if (e.currency === bill && e.charged_currency === card && e.charged_amount != null && e.charged_amount > 0 && e.amount > 0) { a += e.amount; b += e.charged_amount; count++ }
  }
  return a > 0 ? { rate: b / a, count } : null
}
