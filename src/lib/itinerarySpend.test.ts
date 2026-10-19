import { describe, expect, it } from 'vitest'
import { spendByItem, spendLabel, type SpendExpense } from './itinerarySpend'

const E = (o: Partial<SpendExpense>): SpendExpense => ({ id: 'e', vendor: 'V', spent_on: '2026-10-10', amount: 100, currency: 'CAD', settled_amount: null, charged_amount: null, charged_currency: null, itinerary_item_id: 'a', ...o })

describe('itinerary spend', () => {
  it('adds up the expenses linked to each item in the group currency', () => {
    const s = spendByItem([E({ id: '1', amount: 100 }), E({ id: '2', amount: 20.5 }), E({ id: '3', amount: 7, itinerary_item_id: 'b' }), E({ id: '4', itinerary_item_id: null })], 'CAD', {})
    expect(s.byItem.a.minor).toBe(12050)
    expect(s.byItem.a.count).toBe(2)
    expect(s.byItem.b.minor).toBe(700)
    expect(Object.keys(s.byItem)).toEqual(['a', 'b'])
    expect(spendLabel(s.byItem.a, 'CAD')).toBe('CAD 120.50')
  })
  it('uses the statement amount when there is one, and marks rate conversions as approximate', () => {
    const sure = spendByItem([E({ amount: 80, currency: 'EUR', settled_amount: 120 })], 'CAD', {})
    expect(sure.byItem.a.minor).toBe(12000)
    expect(sure.byItem.a.estimated).toBe(false)
    const rough = spendByItem([E({ amount: 80, currency: 'EUR' })], 'CAD', { EUR: 1.5 })
    expect(rough.byItem.a.minor).toBe(12000)
    expect(spendLabel(rough.byItem.a, 'CAD')).toMatch(/^≈ /)
  })
  it('says so when an expense cannot be converted instead of guessing', () => {
    const s = spendByItem([E({ id: '1', amount: 50 }), E({ id: '2', amount: 80, currency: 'EUR' })], 'CAD', {})
    expect(s.byItem.a.minor).toBe(5000)
    expect(s.byItem.a.missing).toBe(1)
    expect(spendLabel(s.byItem.a, 'CAD')).toBe('CAD 50.00 + 1 without a rate')
    expect(spendLabel(spendByItem([E({ amount: 80, currency: 'EUR' })], 'CAD', {}).byItem.a, 'CAD')).toBe('1 without a rate')
  })
})
