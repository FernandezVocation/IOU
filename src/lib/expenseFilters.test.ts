import { describe, expect, it } from 'vitest'
import { NO_FILTERS, activeCount, cardOf, describeFilters, filterExpenses, filterOptions, type ExpenseFilters } from './expenseFilters'
import { computeLedger } from './ledger'
import type { Expense, GroupData, Traveler } from './types'

const T = (id: string, card?: string): Traveler => ({ id, group_id: 'g', name: id.toUpperCase(), color: '#000', user_id: null, sort_order: 0, statement_currency: card ?? null })
let n = 0
const E = (o: Partial<Expense>): Expense => ({ id: 'e' + ++n, group_id: 'g', spent_on: '2026-10-05', spent_at: null, vendor: 'v', location: '', category: '', notes: '', amount: 100, currency: 'CAD', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }], ...o } as Expense)

const ex = {
  cad: E({ vendor: 'cad', category: 'Food', subcategory: 'Dinner', pay_type: 'Cash' }),
  confirmed: E({ vendor: 'conf', currency: 'EUR', settled_amount: 150, payer_id: 'b', spent_on: '2026-10-08', pay_type: 'Credit card', pay_subtype: 'Visa' }),
  estimated: E({ vendor: 'est', currency: 'EUR', category: 'Food', spent_on: '2026-10-10', splits: [{ traveler_id: 'b', value: 1 }], pay_type: 'Credit card', pay_subtype: 'Amex' }),
  norate: E({ vendor: 'none', currency: 'JPY', spent_on: '2026-10-12', receipts: [{ id: 'r' } as never] }),
}
const d: GroupData = {
  group: { id: 'g', name: 'Italy', currency: 'CAD', invite_code: '', created_by: null, created_at: '' }, members: [],
  travelers: [T('a', 'QAR'), T('b')], expenses: Object.values(ex), payments: [], rates: { EUR: 1.5 }, me: null, isOwner: true,
}
const calc = computeLedger({ currency: 'CAD', travelers: d.travelers, expenses: d.expenses, payments: [], rates: d.rates, includeEstimates: true }).calc
const run = (f: Partial<ExpenseFilters>) => filterExpenses(d, d.expenses, calc, { ...NO_FILTERS, ...f }).map(e => e.vendor).sort()

describe('expense filters', () => {
  it('shows everything when nothing is on', () => { expect(run({})).toEqual(['cad', 'conf', 'est', 'none']); expect(activeCount(NO_FILTERS)).toBe(0) })
  it('filters by amount status: no rate, estimated, confirmed, or several', () => {
    expect(run({ rate: ['norate'] })).toEqual(['none'])
    expect(run({ rate: ['estimated'] })).toEqual(['est'])
    expect(run({ rate: ['confirmed'] })).toEqual(['cad', 'conf'])
    expect(run({ rate: ['norate', 'estimated'] })).toEqual(['est', 'none'])
  })
  it('filters by who paid and who it is split with', () => {
    expect(run({ paidBy: ['b'] })).toEqual(['conf'])
    expect(run({ paidBy: ['a', 'b'] })).toHaveLength(4)
    expect(run({ splitWith: ['b'] })).toEqual(['cad', 'conf', 'est', 'none'])
    expect(run({ splitWith: ['a'] })).toEqual(['cad', 'conf', 'none'])
  })
  it('filters by category and sub-category, including uncategorized', () => {
    expect(run({ category: 'Food' })).toEqual(['cad', 'est'])
    expect(run({ category: 'Food', subcategory: 'Dinner' })).toEqual(['cad'])
    expect(run({ category: 'Uncategorized' })).toEqual(['conf', 'none'])
  })
  it('filters by payment type and subtype, including not specified', () => {
    expect(run({ payType: 'Credit card' })).toEqual(['conf', 'est'])
    expect(run({ payType: 'Credit card', paySub: 'Visa' })).toEqual(['conf'])
    expect(run({ payType: 'Not specified' })).toEqual(['none'])
  })
  it('filters by bill currency and by the card it was paid on', () => {
    expect(run({ currency: 'EUR' })).toEqual(['conf', 'est'])
    expect(cardOf(d, ex.cad)).toBe('QAR')                       // payer a's usual card
    expect(cardOf(d, ex.confirmed)).toBe('CAD')                 // payer b has none: the group currency
    expect(cardOf(d, E({ card_currency: 'INR' }))).toBe('INR')
    expect(run({ card: 'QAR' })).toEqual(['cad', 'est', 'none'])
  })
  it('filters by date range and by receipts', () => {
    expect(run({ from: '2026-10-08', to: '2026-10-10' })).toEqual(['conf', 'est'])
    expect(run({ from: '2026-10-10' })).toEqual(['est', 'none'])
    expect(run({ to: '2026-10-05' })).toEqual(['cad'])
    expect(run({ receipt: 'has' })).toEqual(['none'])
    expect(run({ receipt: 'none' })).toEqual(['cad', 'conf', 'est'])
  })
  it('combines filters, counts them and describes them', () => {
    const f = { ...NO_FILTERS, rate: ['estimated' as const], category: 'Food', from: '2026-10-01' }
    expect(run(f)).toEqual(['est'])
    expect(activeCount(f)).toBe(3)
    expect(describeFilters(d, { ...f, paidBy: ['a'] })).toBe('Estimated · Paid by A · Food · from 2026-10-01')
  })
  it('only offers choices the group has', () => {
    const o = filterOptions(d)
    expect(o.cats).toEqual(['Food', 'Uncategorized'])
    expect(o.types).toEqual(['Cash', 'Credit card', 'Not specified'])
    expect(o.paySubsOf('Credit card')).toEqual(['Amex', 'Visa'])
    expect(o.currencies).toEqual(['CAD', 'EUR', 'JPY'])
    expect(o.anyReceipts).toBe(true)
  })
})
