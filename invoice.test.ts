import { describe, expect, it } from 'vitest'
import { buildInvoiceModel, buildInvoicePdf, joinNames } from './invoice'
import { computeLedger, planTransfers } from './ledger'
import type { Expense, GroupData, Payment, Traveler } from './types'

const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABaADwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD029vRZiECCWd5pPLRItuSdpb+IgdFPeof7Quv+gNe/wDfcH/xyjUP+P3S/wDr6b/0TLV+sSyh/aF1/wBAa9/77g/+OUf2hdf9Aa9/77g/+OVfooAof2hdf9Aa9/77g/8AjlH9oXX/AEBr3/vuD/45V+igDOfVZIihn0u8iR5Ej3s0RALMFGcOT1I7Vo1Q1j/jyj/6+rf/ANHJV+gChqH/AB+6X/19N/6JlpLzXdPsLpre5lkV441lkKwSMsaMWAZmClVGVbqR0pdQ/wCP3S/+vpv/AETLWRrmi6hfX2pzwPKIpdPhiEKmPbdFXmLRtkZAIYDIK/e68cAGvBrWn3N2LWKZjIWZVJicI5X7wVyNrEYPAJ6H0NQ2/iXS7qFZYHuXV4xKgFnNukQ4+ZV25YcjkZxketVtFg1C0ttP0ybTlCWK7HunZCrhVKqyAHcGORnIGAWHNHhnQ5dO0zTXvpp5Ly3sUt9khTbB8q71XaBnlF5JP3RzQBp6bqdrq1qt1ZmVoXUMjyQPHuBGQRuAyMdxVus7w9azWPhvTLO5TZPb2cUciZB2sqAEZHB5FaNAFDWP+PKP/r6t/wD0clX6oax/x5R/9fVv/wCjkq/QBQ1D/j90v/r6b/0TLV+qGof8ful/9fTf+iZav0AFFFFABRRRQBQ1j/jyj/6+rf8A9HJV+qGsf8eUf/X1b/8Ao5Kv0AUNQ/4/dL/6+m/9Ey1fqhqH/H7pf/X03/omWr9ABRRRQAUUUUAUNY/48o/+vq3/APRyVfqhrH/HlH/19W//AKOSr9AFDUP+P3S/+vpv/RMtX6oah/x+6X/19N/6Jlq/QAUUUUAFFFFAFDWP+PKP/r6t/wD0clX6oax/x5R/9fVv/wCjkq/QBS1GC5le0ltVid7eYyFZXKAgo69QD/e9Kb52sf8APjZf+Bj/APxqr9FAFDztY/58bL/wMf8A+NUedrH/AD42X/gY/wD8aq/RQBQ87WP+fGy/8DH/APjVHnax/wA+Nl/4GP8A/Gqv0UAZdzHqt4kcUlrZxIJopGZbpmICurHA8sZ+761qUUUAf//Z'
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
const ledger = (inc: boolean) => computeLedger({ currency: 'CAD', travelers, expenses, payments, rates: data.rates, includeEstimates: inc })
const NOW = new Date('2026-10-03T12:00:00')
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('invoice maths', () => {
  it('amount due equals minus the traveler\'s group balance, for everyone', () => {
    for (const mode of ['pending', 'final'] as const) {
      const R = ledger(mode === 'pending')
      for (const t of travelers) {
        const m = buildInvoiceModel({ data, billTo: [t.id], mode, now: NOW })
        expect(m.totals.due).toBe(-R.balance[t.id])
        expect(m.totals.due).toBe(m.totals.share - m.totals.paid - m.totals.made + m.totals.received)
      }
    }
  })
  it('everyone\'s individual invoices net to zero', () => {
    const dues = travelers.map(t => buildInvoiceModel({ data, billTo: [t.id], mode: 'pending', now: NOW }).totals.due)
    expect(sum(dues)).toBe(0)
  })
  it('credits what the billed person paid themselves, line by line', () => {
    const m = buildInvoiceModel({ data, billTo: ['a'], mode: 'final', now: NOW })
    expect(m.paidLines.map(l => l.vendor)).toEqual(['Hotel', 'Fees'])
    expect(m.totals.paid).toBe(60000 + 4500)
    expect(m.shareLines.map(l => l.vendor)).toEqual(['Hotel', 'Dinner', 'Tour', 'Fees'])
  })
  it('itemizes only the billed person\'s slice of each transaction', () => {
    const m = buildInvoiceModel({ data, billTo: ['b'], mode: 'final', now: NOW })
    const byVendor = Object.fromEntries(m.shareLines.map(l => [l.vendor, l]))
    expect(byVendor.Hotel.share).toBe(15000)         // 600 / 4
    expect(byVendor.Tour.share).toBe(4500)           // 180 * 1/4 shares
    expect(byVendor.Tour.basis).toBe('1 of 4 shares')
    expect(byVendor.Fees.share).toBe(1350)           // 30% of 45
    expect(byVendor.Fees.basis).toBe('30%')
    expect(byVendor.Dinner.basis).toBe('1 of 3')
    expect(byVendor.Hotel.original).toBe('400.00 EUR')
  })
  it('bills several people together: internal payments and expenses cancel', () => {
    const R = ledger(true)
    const m = buildInvoiceModel({ data, billTo: ['a', 'b'], mode: 'pending', now: NOW })
    expect(m.totals.due).toBe(-(R.balance.a + R.balance.b))
    expect(m.paymentLines.map(p => p.text)).toEqual(['Payment received from Riley', 'Payment made to Jordan'])
    expect(m.billToLabel).toBe('Alex & Sam')
  })
  it('final mode leaves out unsettled foreign amounts and says how many', () => {
    const p = buildInvoiceModel({ data, billTo: ['a'], mode: 'pending', now: NOW })
    const f = buildInvoiceModel({ data, billTo: ['a'], mode: 'final', now: NOW })
    expect(p.shareLines.some(l => l.vendor === 'Taxi' && l.estimated)).toBe(true)
    expect(f.shareLines.some(l => l.vendor === 'Taxi')).toBe(false)
    expect(f.counts.excluded).toBe(1)
  })
  it('payment instructions net to what is due, in both settle modes', () => {
    for (const settle of ['itemized', 'fewest'] as const) {
      for (const ids of [...travelers.map(t => [t.id]), ['a', 'b']]) {
        const m = buildInvoiceModel({ data, billTo: ids, mode: 'pending', now: NOW, settle })
        expect(sum(m.payOut.map(x => x.amount)) - sum(m.payIn.map(x => x.amount))).toBe(m.totals.due)
      }
    }
  })
  it('itemized: pays each person the amount tied to their expenses, and lists who owes the billed person', () => {
    const tv = ['shirley', 'steven', 'lavi', 'cy'].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })) as unknown as GroupData['travelers']
    const mk = (id: string, paidBy: string, amount: number, who: string[]) => ({
      id, group_id: 'g', spent_on: '2026-01-01', spent_at: null, vendor: id, category: '', subcategory: '', location: '', notes: '',
      amount, currency: 'USD', settled_amount: null, payer_id: paidBy, split_mode: 'equal', receipts: [],
      splits: who.map(w => ({ traveler_id: w, value: 1 })),
    }) as unknown as GroupData['expenses'][number]
    const d = { ...data, group: { ...data.group, currency: 'USD' }, travelers: tv, payments: [], rates: {}, me: null,
      expenses: [mk('e1', 'steven', 200, ['shirley', 'steven']), mk('e2', 'lavi', 100, ['shirley', 'lavi']), mk('e3', 'shirley', 60, ['shirley', 'cy'])] } as GroupData
    const m = buildInvoiceModel({ data: d, billTo: ['shirley'], mode: 'pending', now: NOW })
    expect(m.payOut).toEqual([{ name: 'Steven', amount: 10000 }, { name: 'Lavi', amount: 5000 }])
    expect(m.payIn).toEqual([{ name: 'Cy', amount: 3000 }])
    expect(m.totals.due).toBe(12000)
    const c = buildInvoiceModel({ data: d, billTo: ['cy'], mode: 'pending', now: NOW })
    expect(c.payOut).toEqual([{ name: 'Shirley', amount: 3000 }]); expect(c.payIn).toEqual([])
  })
  it('rejects an empty selection and builds readable names', () => {
    expect(() => buildInvoiceModel({ data, billTo: [], mode: 'final' })).toThrow()
    expect(joinNames(['A'])).toBe('A'); expect(joinNames(['A', 'B'])).toBe('A & B'); expect(joinNames(['A', 'B', 'C'])).toBe('A, B & C')
  })
  it('planTransfers settles any balance set', () => {
    const t = planTransfers({ x: 500, y: -200, z: -300 }, ['x', 'y', 'z'])
    expect(t).toEqual([{ from: 'z', to: 'x', amount: 300 }, { from: 'y', to: 'x', amount: 200 }])
  })
})

describe('invoice pdf', () => {
  it('renders with and without a receipt appendix, including odd characters', async () => {
    const m = buildInvoiceModel({ data, billTo: ['a', 'c'], mode: 'pending', note: 'Interac e-transfer to jo@example.com – thanks! 日本', preparedBy: 'Alex', now: NOW })
    const plain = await buildInvoicePdf(m)
    const withImgs = await buildInvoicePdf(m, [{ expenseId: 'Hotel', label: '2026-09-12  Hotel', dataUrl: TINY_JPEG, width: 60, height: 90 }, { expenseId: 'Tour', label: 'Tour', dataUrl: TINY_JPEG, width: 60, height: 90 }], 1)
    for (const b of [plain, withImgs]) expect(new TextDecoder().decode((await b.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
    expect(withImgs.size).toBeGreaterThan(plain.size)
  })
  it('handles a credit balance and an all-square balance', async () => {
    const credit = buildInvoiceModel({ data, billTo: ['c'], mode: 'pending', now: NOW })
    const square = buildInvoiceModel({ data: { ...data, expenses: [], payments: [] }, billTo: ['c'], mode: 'final', now: NOW })
    expect(square.totals.due).toBe(0)
    for (const m of [credit, square]) expect((await buildInvoicePdf(m)).size).toBeGreaterThan(2000)
  })
})

import { writeFileSync } from 'node:fs'
describe.skipIf(!process.env.DUMP_DIR)('dump sample PDFs for eyeballing', () => {
  it('writes them', async () => {
    const dir = process.env.DUMP_DIR as string
    const imgs = [{ expenseId: 'Hotel', label: '2026-09-12  Hotel  (EUR 400.00)', dataUrl: TINY_JPEG, width: 60, height: 90 }]
    const one = buildInvoiceModel({ data, billTo: ['b'], mode: 'pending', note: 'Interac e-transfer to alex@example.com within 14 days. Thanks for a great trip!', preparedBy: 'Alex', now: NOW })
    const two = buildInvoiceModel({ data, billTo: ['a', 'b'], mode: 'final', preparedBy: 'Alex', now: NOW })
    const cr = buildInvoiceModel({ data, billTo: ['c'], mode: 'pending', preparedBy: 'Alex', now: NOW })
    writeFileSync(dir + '/inv-one.pdf', Buffer.from(await (await buildInvoicePdf(one, imgs)).arrayBuffer()))
    writeFileSync(dir + '/inv-two.pdf', Buffer.from(await (await buildInvoicePdf(two)).arrayBuffer()))
    writeFileSync(dir + '/inv-credit.pdf', Buffer.from(await (await buildInvoicePdf(cr)).arrayBuffer()))
  })
})
