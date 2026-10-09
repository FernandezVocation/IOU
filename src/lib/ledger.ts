import type { Expense, Payment, Traveler } from './types'
import { allocate, currencyDigits, toMinor } from './money'

export type CalcStatus = 'confirmed' | 'estimated' | 'norate'
export interface Calc { minor: number | null; status: CalcStatus }

/**
 * An expense's value in the group (settle) currency.
 *  - already in the group currency            -> confirmed
 *  - foreign with a settled (statement) amount -> confirmed
 *  - foreign, no settled amount, rate known    -> estimated
 *  - foreign, nothing to go on                 -> norate (left out of balances)
 */
export function expenseInGroupCurrency(e: Expense, groupCurrency: string, rates: Record<string, number>): Calc {
  if (e.currency === groupCurrency) return { minor: toMinor(e.amount, groupCurrency), status: 'confirmed' }
  if (e.settled_amount != null && e.settled_amount > 0) return { minor: toMinor(e.settled_amount, groupCurrency), status: 'confirmed' }
  const r = rates[e.currency]
  if (r > 0) return { minor: Math.round(e.amount * r * 10 ** currencyDigits(groupCurrency)), status: 'estimated' }
  return { minor: null, status: 'norate' }
}

export interface Line {
  kind: 'share' | 'payment'
  date: string
  amount: number
  /** share: who owes this slice, and who paid the expense */
  debtor?: string
  payer?: string
  vendor?: string
  expenseId?: string
  /** payment: who paid whom */
  from?: string
  to?: string
}
export interface PairLine { sign: 1 | -1; line: Line }
/** unpaid: nothing paid yet. partial: some paid, some left. pending: a payment awaits the receiver's confirmation. paid: nothing left. */
export type PairStatus = 'unpaid' | 'partial' | 'pending' | 'paid'
export interface Pair { debtor: string; creditor: string; net: number; lines: PairLine[]; pending: number; status: PairStatus }
export interface PendingPayment { id: string; from: string; to: string; amount: number }
export interface Transfer { from: string; to: string; amount: number }
export interface PersonRow { expenseId: string; date: string; time: string | null; vendor: string; paid: number; share: number; estimated: boolean }

export interface LedgerResult {
  balance: Record<string, number>
  paid: Record<string, number>
  share: Record<string, number>
  sent: Record<string, number>
  received: Record<string, number>
  rows: Record<string, PersonRow[]>
  pairs: Pair[]
  /** Pairs that had costs but are now fully paid (net zero). */
  settledPairs: Pair[]
  /** Recorded but not yet confirmed by the receiver. Not counted in balances. */
  pendingPayments: PendingPayment[]
  transfers: Transfer[]
  calc: Record<string, Calc>
  counts: { used: number; estimated: number; missing: number; excluded: number }
  total: number
  estimatedTotal: number
}

export interface LedgerInput {
  currency: string
  travelers: Traveler[]
  expenses: Expense[]
  payments: Payment[]
  rates: Record<string, number>
  /** include estimated (not yet statement-confirmed) amounts */
  includeEstimates: boolean
}

export function computeLedger(input: LedgerInput): LedgerResult {
  const { currency, travelers, expenses, payments, rates, includeEstimates } = input
  const ids = new Set(travelers.map(t => t.id))
  const zero = () => Object.fromEntries(travelers.map(t => [t.id, 0])) as Record<string, number>
  const R: LedgerResult = {
    balance: zero(), paid: zero(), share: zero(), sent: zero(), received: zero(),
    rows: Object.fromEntries(travelers.map(t => [t.id, [] as PersonRow[]])),
    pairs: [], settledPairs: [], pendingPayments: [], transfers: [], calc: {},
    counts: { used: 0, estimated: 0, missing: 0, excluded: 0 }, total: 0, estimatedTotal: 0,
  }
  const items = new Map<string, Line[]>()
  const addItem = (debtor: string, creditor: string, line: Line) => {
    const k = debtor + '>' + creditor
    const arr = items.get(k)
    if (arr) arr.push(line); else items.set(k, [line])
  }

  for (const e of expenses) {
    const c = expenseInGroupCurrency(e, currency, rates)
    R.calc[e.id] = c
    if (c.status === 'norate') { R.counts.missing++; continue }
    if (c.status === 'estimated') {
      R.counts.estimated++
      if (!includeEstimates) { R.counts.excluded++; continue }
    }
    if (!ids.has(e.payer_id)) continue
    const parts = e.splits.filter(s => ids.has(s.traveler_id)).map(s => ({ id: s.traveler_id, w: e.split_mode === 'equal' ? 1 : s.value })).filter(p => p.w > 0)
    if (!parts.length) continue
    const minor = c.minor as number
    const shares = allocate(minor, parts.map(p => p.w))
    R.counts.used++
    R.total += minor
    if (c.status === 'estimated') R.estimatedTotal += minor
    R.paid[e.payer_id] += minor
    R.balance[e.payer_id] += minor
    const rowFor = (pid: string): PersonRow => {
      let r = R.rows[pid].find(x => x.expenseId === e.id)
      if (!r) { r = { expenseId: e.id, date: e.spent_on, time: e.spent_at, vendor: e.vendor, paid: 0, share: 0, estimated: c.status === 'estimated' }; R.rows[pid].push(r) }
      return r
    }
    rowFor(e.payer_id).paid = minor
    parts.forEach((p, i) => {
      const s = shares[i]
      R.share[p.id] += s
      R.balance[p.id] -= s
      rowFor(p.id).share = s
      if (p.id !== e.payer_id && s > 0) {
        addItem(p.id, e.payer_id, { kind: 'share', date: e.spent_on, amount: s, debtor: p.id, payer: e.payer_id, vendor: e.vendor, expenseId: e.id })
      }
    })
  }

  for (const p of payments) {
    if (!ids.has(p.from_id) || !ids.has(p.to_id)) continue
    const m = toMinor(p.amount, currency)
    // A payment counts only once the receiver confirms it (missing status = older data = confirmed).
    if (p.status === 'pending') { R.pendingPayments.push({ id: p.id, from: p.from_id, to: p.to_id, amount: m }); continue }
    R.sent[p.from_id] += m
    R.received[p.to_id] += m
    R.balance[p.from_id] += m
    R.balance[p.to_id] -= m
    // A payment from X to Y cancels what X owes Y, so it sits on the opposite side of the pair.
    addItem(p.to_id, p.from_id, { kind: 'payment', date: p.paid_on, amount: m, from: p.from_id, to: p.to_id })
  }

  for (let i = 0; i < travelers.length; i++) {
    for (let j = i + 1; j < travelers.length; j++) {
      const a = travelers[i].id, b = travelers[j].id
      const ab = items.get(a + '>' + b) ?? [], ba = items.get(b + '>' + a) ?? []
      if (!ab.length && !ba.length) continue
      const net = ab.reduce((s, x) => s + x.amount, 0) - ba.reduce((s, x) => s + x.amount, 0)
      const debtor = net > 0 ? a : b, creditor = net > 0 ? b : a
      const pos = net > 0 ? ab : ba, neg = net > 0 ? ba : ab
      const lines: PairLine[] = [
        ...pos.map(line => ({ sign: 1 as const, line })),
        ...neg.map(line => ({ sign: -1 as const, line })),
      ].sort((x, y) => x.line.date.localeCompare(y.line.date))
      if (net === 0) { R.settledPairs.push({ debtor: a, creditor: b, net: 0, lines, pending: 0, status: 'paid' }); continue }
      const pending = R.pendingPayments.filter(x => x.from === debtor && x.to === creditor).reduce((s, x) => s + x.amount, 0)
      const hasPayment = lines.some(l => l.line.kind === 'payment')
      R.pairs.push({ debtor, creditor, net: Math.abs(net), lines, pending, status: pending > 0 ? 'pending' : hasPayment ? 'partial' : 'unpaid' })
    }
  }
  R.pairs.sort((x, y) => y.net - x.net)

  R.transfers = planTransfers(R.balance, travelers.map(t => t.id))
  return R
}

/**
 * Fewest-payments settle-up: biggest debtor pays biggest creditor until everyone is square.
 * `order` breaks ties deterministically (traveler order).
 */
export function planTransfers(balance: Record<string, number>, order: string[]): Transfer[] {
  const creditors = order.filter(id => balance[id] > 0).map(id => ({ id, v: balance[id] })).sort((x, y) => y.v - x.v)
  const debtors = order.filter(id => balance[id] < 0).map(id => ({ id, v: -balance[id] })).sort((x, y) => y.v - x.v)
  const out: Transfer[] = []
  let i = 0, j = 0
  while (i < debtors.length && j < creditors.length) {
    const m = Math.min(debtors[i].v, creditors[j].v)
    if (m > 0) out.push({ from: debtors[i].id, to: creditors[j].id, amount: m })
    debtors[i].v -= m; creditors[j].v -= m
    if (debtors[i].v === 0) i++
    if (creditors[j].v === 0) j++
  }
  return out
}
