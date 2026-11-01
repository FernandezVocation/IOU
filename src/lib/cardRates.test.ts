import { describe, expect, it } from 'vitest'
import { isPairKey, observedPairRate, pairKey, suggestPairs } from './cardRates'
import type { Expense, GroupData, Traveler } from './types'

const T = (id: string, card?: string): Traveler => ({ id, group_id: 'g', name: id, color: '#000', user_id: null, sort_order: 0, statement_currency: card ?? null })
const E = (o: Partial<Expense>): Expense => ({ id: 'e', group_id: 'g', spent_on: '2026-10-01', spent_at: null, vendor: '', location: '', category: '', notes: '', amount: 100, currency: 'EUR', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: [], ...o } as Expense)
const G = (expenses: Expense[], travelers: Traveler[], rates: Record<string, number> = {}): GroupData => ({
  group: { id: 'g', name: 'Italy', currency: 'CAD', invite_code: '', created_by: null, created_at: '' }, members: [], travelers, expenses, payments: [], rates, me: null, isOwner: true,
})

describe('card rate pairs', () => {
  it('keys a pair as bill>card', () => { expect(pairKey('EUR', 'QAR')).toBe('EUR>QAR'); expect(isPairKey('EUR>QAR')).toBe(true); expect(isPairKey('EUR')).toBe(false) })
  it('offers every foreign bill currency against every card currency in use, never the group currency or the same currency twice', () => {
    const d = G([E({ currency: 'EUR' }), E({ currency: 'USD' }), E({ currency: 'CAD' })], [T('a', 'QAR'), T('b', 'INR'), T('c')])
    expect(suggestPairs(d)).toEqual([['EUR', 'INR'], ['EUR', 'QAR'], ['USD', 'INR'], ['USD', 'QAR']])
    expect(suggestPairs(G([E({ currency: 'QAR' })], [T('a', 'QAR')]))).toEqual([])
  })
  it('keeps a pair that was already set even with no expense behind it', () => {
    expect(suggestPairs(G([], [T('a')], { 'GBP>JPY': 190 }))).toEqual([['GBP', 'JPY']])
  })
  it('works out the rate people actually got from typed card amounts', () => {
    const d = G([E({ amount: 100, currency: 'EUR', charged_amount: 400, charged_currency: 'QAR' }), E({ amount: 50, currency: 'EUR', charged_amount: 210, charged_currency: 'QAR' }), E({ currency: 'EUR' })], [T('a')])
    expect(observedPairRate(d, 'EUR', 'QAR')).toEqual({ rate: 610 / 150, count: 2 })
    expect(observedPairRate(d, 'EUR', 'INR')).toBeNull()
  })
})
