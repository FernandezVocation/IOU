import { describe, expect, it } from 'vitest'
import { allocate, currencyDigits, fmtMoney, parseNum, toMinor } from './money'
import { computeLedger, expenseInGroupCurrency } from './ledger'
import type { Expense, Payment, SplitMode, Traveler } from './types'

const T = (id: string): Traveler => ({ id, group_id: 'g', name: id.toUpperCase(), color: '#000', user_id: null, sort_order: 0 })
const travelers = [T('a'), T('b'), T('c')]
function exp(id: string, o: Partial<Expense> & { split: Record<string, number>; mode?: SplitMode }): Expense {
  return {
    id, group_id: 'g', spent_on: '2026-10-01', spent_at: null, vendor: id, location: '', category: '', notes: '',
    amount: 0, currency: 'CAD', settled_amount: null, payer_id: 'a', split_mode: o.mode ?? 'equal',
    created_at: '', updated_at: '', receipts: [],
    splits: Object.entries(o.split).map(([traveler_id, value]) => ({ traveler_id, value })),
    ...o,
  } as Expense
}
const sum = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0)

describe('money', () => {
  it('knows currency decimals', () => {
    expect(currencyDigits('CAD')).toBe(2); expect(currencyDigits('JPY')).toBe(0); expect(currencyDigits('KWD')).toBe(3)
  })
  it('converts to minor units without float drift', () => {
    expect(toMinor(1.005, 'CAD')).toBe(101); expect(toMinor(0.1 + 0.2, 'CAD')).toBe(30); expect(toMinor(1234, 'JPY')).toBe(1234)
  })
  it('parses phone-keyboard numbers', () => {
    expect(parseNum('12,50')).toBe(12.5); expect(parseNum('1,234.50')).toBe(1234.5); expect(parseNum('1,234')).toBe(1234)
    expect(parseNum('1 234,5')).toBe(1234.5); expect(parseNum('abc')).toBeNaN(); expect(parseNum('')).toBeNaN()
  })
  it('formats with the currency code', () => { expect(fmtMoney(123456, 'CAD')).toMatch(/CAD\s?1,234\.56/) })
  it('allocates cent-exactly', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(1, [1, 1, 1])).toEqual([1, 0, 0])
    expect(allocate(10000, [33.3333, 33.3333, 33.3334]).reduce((a, b) => a + b)).toBe(10000)
    expect(allocate(5, [0, 0])).toEqual([0, 0])
  })
  it('allocation always sums to the total (fuzz)', () => {
    for (let n = 0; n < 2000; n++) {
      const total = Math.floor(Math.random() * 100000)
      const w = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, () => Math.random() * 100 + 0.01)
      expect(allocate(total, w).reduce((a, b) => a + b, 0)).toBe(total)
    }
  })
})

describe('expense value in group currency', () => {
  it('local amount is confirmed as-is', () => {
    expect(expenseInGroupCurrency(exp('x', { amount: 12.34, split: { a: 1 } }), 'CAD', {})).toEqual({ minor: 1234, status: 'confirmed' })
  })
  it('foreign with statement amount is confirmed and ignores any estimate', () => {
    const e = exp('x', { amount: 100, currency: 'EUR', settled_amount: 151.2, split: { a: 1 } })
    expect(expenseInGroupCurrency(e, 'CAD', { EUR: 1.5 })).toEqual({ minor: 15120, status: 'confirmed' })
  })
  it('foreign without statement amount is estimated from the rate, else not counted', () => {
    const e = exp('x', { amount: 100, currency: 'EUR', split: { a: 1 } })
    expect(expenseInGroupCurrency(e, 'CAD', { EUR: 1.5 })).toEqual({ minor: 15000, status: 'estimated' })
    expect(expenseInGroupCurrency(e, 'CAD', {})).toEqual({ minor: null, status: 'norate' })
  })
})

describe('ledger', () => {
  const expenses = [
    exp('e1', { amount: 100, payer_id: 'a', split: { a: 1, b: 1, c: 1 } }),
    exp('e2', { amount: 200, currency: 'EUR', settled_amount: 310, payer_id: 'b', mode: 'percent', split: { a: 50, b: 25, c: 25 } }),
    exp('e3', { amount: 20, currency: 'EUR', payer_id: 'c', mode: 'exact', split: { a: 5, c: 15 } }),
    exp('e4', { amount: 20, currency: 'USD', payer_id: 'c', split: { a: 1, c: 1 } }),
  ]
  const payments: Payment[] = [{ id: 'p', group_id: 'g', from_id: 'c', to_id: 'a', amount: 10, paid_on: '2026-10-04' }]
  const base = { currency: 'CAD', travelers, expenses, payments, rates: { EUR: 1.5 } }

  it('balances always net to zero', () => {
    for (const inc of [true, false]) expect(sum(computeLedger({ ...base, includeEstimates: inc }).balance)).toBe(0)
  })
  it('counts estimates only when asked, and never counts a missing rate', () => {
    const p = computeLedger({ ...base, includeEstimates: true }), f = computeLedger({ ...base, includeEstimates: false })
    expect(p.counts).toEqual({ used: 3, estimated: 1, missing: 1, excluded: 0 })
    expect(f.counts).toEqual({ used: 2, estimated: 1, missing: 1, excluded: 1 })
    expect(p.total).toBe(10000 + 31000 + 3000); expect(f.total).toBe(10000 + 31000)
  })
  it('settled amounts override estimates', () => {
    const r = computeLedger({ ...base, includeEstimates: true })
    expect(r.calc.e2).toEqual({ minor: 31000, status: 'confirmed' })
  })
  it('percent and exact splits are honoured', () => {
    const r = computeLedger({ ...base, includeEstimates: true })
    // e2: 310.00 split 50/25/25 -> a 155, b 77.50, c 77.50 ; e3 est 30.00 split 5:15 -> a 7.50, c 22.50
    expect(r.share.a).toBe(3334 + 15500 + 750)
    expect(r.share.b).toBe(3333 + 7750)
    expect(r.share.c).toBe(3333 + 7750 + 2250)
  })
  it('itemized pairs reproduce every balance, and lines add up to the net', () => {
    const r = computeLedger({ ...base, includeEstimates: true })
    const net: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (const p of r.pairs) {
      net[p.debtor] -= p.net; net[p.creditor] += p.net
      expect(p.lines.reduce((s, l) => s + l.sign * l.line.amount, 0)).toBe(p.net)
    }
    expect(net).toEqual(r.balance)
  })
  it('fewest-payments transfers settle everyone to zero', () => {
    const r = computeLedger({ ...base, includeEstimates: true })
    const after = { ...r.balance }
    for (const t of r.transfers) { after[t.from] += t.amount; after[t.to] -= t.amount }
    expect(Object.values(after).every(v => v === 0)).toBe(true)
  })
  it('a recorded payment reduces what is owed', () => {
    const none = computeLedger({ ...base, payments: [], includeEstimates: true })
    const some = computeLedger({ ...base, includeEstimates: true })
    expect(some.balance.c - none.balance.c).toBe(1000); expect(some.balance.a - none.balance.a).toBe(-1000)
  })
  it('ignores people who are not on the trip and unpayable rows safely', () => {
    const r = computeLedger({ ...base, expenses: [exp('z', { amount: 10, payer_id: 'ghost', split: { a: 1 } }), exp('y', { amount: 10, split: {} })], includeEstimates: true })
    expect(r.total).toBe(0); expect(sum(r.balance)).toBe(0)
  })
  it('works for zero-decimal and 3-decimal settle currencies', () => {
    const jp = computeLedger({ currency: 'JPY', travelers, expenses: [exp('j', { amount: 1000, currency: 'JPY', split: { a: 1, b: 1, c: 1 } })], payments: [], rates: {}, includeEstimates: true })
    expect(jp.share).toEqual({ a: 334, b: 333, c: 333 })
    const kw = computeLedger({ currency: 'KWD', travelers, expenses: [exp('k', { amount: 1, currency: 'KWD', split: { a: 1, b: 1, c: 1 } })], payments: [], rates: {}, includeEstimates: true })
    expect(sum(kw.share)).toBe(1000)
  })
})

describe('Italy 2026: two expenses split seven ways', () => {
  const ids = ['steve', 'shirley', 'lavi', 'sf', 'nitin', 'massy', 'sabina']
  const tv = ids.map(T)
  const split = Object.fromEntries(ids.map(i => [i, 1]))
  const R = computeLedger({
    currency: 'CAD', travelers: tv, payments: [], rates: {}, includeEstimates: true,
    expenses: [exp('vatican', { amount: 700, payer_id: 'shirley', split }), exp('trevi', { amount: 1400, payer_id: 'steve', split })],
  })
  const pair = (d: string, c: string) => R.pairs.find(p => p.debtor === d && p.creditor === c)?.net
  it('itemized: everyone owes Steve 200 and Shirley 100, and Shirley owes Steve 100 net', () => {
    for (const p of ['lavi', 'sf', 'nitin', 'massy', 'sabina']) { expect(pair(p, 'steve')).toBe(20000); expect(pair(p, 'shirley')).toBe(10000) }
    expect(pair('shirley', 'steve')).toBe(10000)
    expect(pair('steve', 'shirley')).toBeUndefined()
    expect(R.pairs).toHaveLength(11)
  })
  it('fewest payments: 6 transfers that still square everyone', () => {
    expect(R.balance.steve).toBe(110000); expect(R.balance.shirley).toBe(40000)
    expect(R.transfers).toHaveLength(6)
    const net: Record<string, number> = { ...R.balance }
    for (const t of R.transfers) { net[t.from] += t.amount; net[t.to] -= t.amount }
    expect(Object.values(net).every(v => v === 0)).toBe(true)
  })
})
