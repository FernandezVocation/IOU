import { describe, expect, it } from 'vitest'
import { buildSettlementModel, buildSettlementPdf, settlementFileName } from './settlement'
import { buildInvoiceModel, buildInvoicePdf } from './invoice'
import { computeLedger } from './ledger'
import type { Expense, GroupData, Payment, Traveler } from './types'

const T = (id: string, name: string): Traveler => ({ id, group_id: 'g', name, color: '#000', user_id: null, sort_order: 0 })
const travelers = [T('a', 'Alex'), T('b', 'Sam'), T('c', 'Jordan'), T('d', 'Riley')]
const E = (id: string, o: Partial<Expense> & { split: Record<string, number> }): Expense => ({
  id, group_id: 'g', spent_on: '2026-09-12', spent_at: '12:00:00', vendor: id, location: 'Lisbon', category: 'Food', notes: '',
  amount: 10, currency: 'CAD', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [],
  splits: Object.entries(o.split).map(([traveler_id, value]) => ({ traveler_id, value })), ...o,
})
const all4 = { a: 1, b: 1, c: 1, d: 1 }
const expenses: Expense[] = [
  E('Hotel', { amount: 400, currency: 'EUR', settled_amount: 600, payer_id: 'a', split: all4 }),
  E('Dinner', { amount: 80, payer_id: 'b', split: { a: 1, b: 1, c: 1 }, spent_on: '2026-09-13' }),
  E('Tour', { amount: 120, currency: 'EUR', settled_amount: 180, payer_id: 'c', split_mode: 'shares', split: { a: 2, b: 1, c: 1 }, spent_on: '2026-09-14' }),
  E('Taxi', { amount: 20, currency: 'EUR', payer_id: 'd', split: all4, spent_on: '2026-09-15' }), // estimated only
  E('Fees', { amount: 45, payer_id: 'a', split_mode: 'percent', split: { a: 50, b: 30, c: 20 }, spent_on: '2026-09-16' }),
]
const payments: Payment[] = [
  { id: 'p1', group_id: 'g', from_id: 'd', to_id: 'a', amount: 50, paid_on: '2026-09-20' },
  { id: 'p2', group_id: 'g', from_id: 'a', to_id: 'b', amount: 5, paid_on: '2026-09-21' }, // inside {a,b}
  { id: 'p3', group_id: 'g', from_id: 'b', to_id: 'c', amount: 12, paid_on: '2026-09-22' },
]
const data: GroupData = {
  group: { id: 'g', name: 'Lisbon, September', currency: 'CAD', invite_code: 'x', created_by: null, created_at: '' },
  members: [], travelers, expenses, payments, rates: { EUR: 1.5 }, me: null, isOwner: true,
}
const NOW = new Date('2026-10-03T12:00:00')
const pdfHead = async (b: Blob) => new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()).slice(0, 5))

describe('group settlement', () => {
  it('fewest payments leaves everyone square', () => {
    const m = buildSettlementModel({ data, mode: 'pending', settle: 'fewest', now: NOW })
    const R = computeLedger({ currency: 'CAD', travelers, expenses, payments, rates: data.rates, includeEstimates: true })
    const net: Record<string, number> = Object.fromEntries(travelers.map(t => [t.name, -R.balance[t.id]]))   // what each still owes
    for (const p of m.payments) { net[p.from] -= p.amount; net[p.to] += p.amount }
    for (const v of Object.values(net)) expect(v).toBe(0)
  })
  it('itemized lists each pair, and fewest never needs more payments', () => {
    const it = buildSettlementModel({ data, mode: 'pending', settle: 'itemized', now: NOW })
    const fw = buildSettlementModel({ data, mode: 'pending', settle: 'fewest', now: NOW })
    expect(it.payments.every(p => p.status !== '')).toBe(true)
    expect(fw.payments.length).toBeLessThanOrEqual(it.payments.length)
    expect(fw.payments.length).toBeLessThanOrEqual(travelers.length - 1)
  })
  it('balances add up to zero and are sorted owed first', () => {
    const m = buildSettlementModel({ data, mode: 'pending', settle: 'itemized', now: NOW })
    expect(m.balances.reduce((a, b) => a + b.balance, 0)).toBe(0)
    expect(m.balances[0].balance).toBeGreaterThanOrEqual(m.balances[m.balances.length - 1].balance)
  })
  it('names the file by method and mode', () => {
    expect(settlementFileName(buildSettlementModel({ data, mode: 'final', settle: 'fewest', now: NOW }))).toBe('lisbon-september-settlement-fewest-final-20261003.pdf')
  })
  it('makes real PDFs in both methods', async () => {
    for (const settle of ['itemized', 'fewest'] as const) expect(await pdfHead(await buildSettlementPdf(buildSettlementModel({ data, mode: 'pending', settle, now: NOW })))).toBe('%PDF-')
  })
})

describe('invoice with a chosen settle method', () => {
  it('records the method on the invoice and still builds the PDF', async () => {
    const f = buildInvoiceModel({ data, billTo: ['d'], mode: 'pending', settle: 'fewest', now: NOW })
    const i = buildInvoiceModel({ data, billTo: ['d'], mode: 'pending', now: NOW })
    expect([f.settle, i.settle]).toEqual(['fewest', 'itemized'])
    expect(f.totals).toEqual(i.totals)   // the method changes who is paid, never how much is owed overall
    expect(await pdfHead(await buildInvoicePdf(f))).toBe('%PDF-')
  })
})
