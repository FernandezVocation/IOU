import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { sharedToGroupData, type SharedTrip } from './shared'
import { buildInvoiceModel } from './invoice'
import { computeLedger } from './ledger'

const fixture: SharedTrip = {
  label: 'Bo', group: { name: 'Lisbon', currency: 'CAD' }, linked: ['b', 'ghost'],
  travelers: [{ id: 'a', name: 'Ann', color: '#2B44FF' }, { id: 'b', name: 'Bo', color: '#0E7C61' }, { id: 'c', name: 'Cy', color: '#C23B22' }],
  expenses: [
    { id: 'e1', spent_on: '2026-09-12', spent_at: '15:20:00', vendor: 'Hotel', location: '', category: '', amount: '400.0000', currency: 'EUR', settled_amount: '600.0000', payer_id: 'a', split_mode: 'equal', splits: [{ traveler_id: 'a', value: '1.0000' }, { traveler_id: 'b', value: 1 }, { traveler_id: 'c', value: 1 }] },
    { id: 'e2', spent_on: '2026-09-13', spent_at: null, vendor: 'Dinner', location: '', category: '', amount: 90, currency: 'CAD', settled_amount: null, payer_id: 'b', split_mode: 'percent', splits: [{ traveler_id: 'a', value: 50 }, { traveler_id: 'b', value: 50 }] },
  ],
  payments: [{ id: 'p', from_id: 'c', to_id: 'a', amount: '25.0000', paid_on: '2026-09-20' }],
  rates: { EUR: '1.50000000' }, generated_at: '2026-10-03T00:00:00Z',
}

describe('shared link -> in-app data', () => {
  it('turns strings into numbers and drops links to people who no longer exist', () => {
    const { data, linked } = sharedToGroupData(fixture)
    expect(linked).toEqual(['b'])
    expect(data.expenses[0].amount).toBe(400); expect(data.expenses[0].settled_amount).toBe(600); expect(data.expenses[1].settled_amount).toBeNull()
    expect(data.expenses[0].splits[0].value).toBe(1); expect(data.rates.EUR).toBe(1.5); expect(data.payments[0].amount).toBe(25)
    expect(data.expenses.every(e => e.notes === '' && e.receipts.length === 0)).toBe(true)
  })
  it('gives the linked person exactly the numbers an invoice would', () => {
    const { data, linked } = sharedToGroupData(fixture)
    const m = buildInvoiceModel({ data, billTo: linked, mode: 'pending' })
    expect(m.totals).toEqual({ share: 24500, paid: 9000, made: 0, received: 0, due: 15500 })
    expect(m.payOut).toEqual([{ name: 'Ann', amount: 15500 }])
  })
})

// Cross-language check: run supabase/tests/share_links_test.sql, then
//   SHARED_SHAPE_JSON=/tmp/shared_shape.json npx vitest run src/lib/shared.test.ts
describe.skipIf(!process.env.SHARED_SHAPE_JSON || !existsSync(process.env.SHARED_SHAPE_JSON as string))('JSON produced by the real database function', () => {
  it('feeds the ledger cleanly and reconciles for every traveler', () => {
    const raw = JSON.parse(readFileSync(process.env.SHARED_SHAPE_JSON as string, 'utf8')) as SharedTrip
    const { data, linked } = sharedToGroupData(raw)
    expect(linked).toHaveLength(1)
    expect(data.travelers).toHaveLength(3)
    const R = computeLedger({ currency: data.group.currency, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: true })
    expect(Object.values(R.balance).reduce((a, b) => a + b, 0)).toBe(0)
    const dues = data.travelers.map(t => buildInvoiceModel({ data, billTo: [t.id], mode: 'pending' }).totals.due)
    expect(dues.reduce((a, b) => a + b, 0)).toBe(0)
    const mine = buildInvoiceModel({ data, billTo: linked, mode: 'pending' })
    expect(mine.totals.due).toBe(-R.balance[linked[0]])
    // seeded data: Hotel 400 EUR settled 600 CAD split 3 ways; Dinner 90 CAD paid by Bo, 50/50 with Ann; Cy paid Ann 25
    expect(mine.totals).toEqual({ share: 24500, paid: 9000, made: 0, received: 0, due: 15500 })
  })
})
