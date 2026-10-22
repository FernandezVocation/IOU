import { describe, expect, it } from 'vitest'
import { autoConfirms, paymentHistory, paymentPerms, statusLabel, userName } from './payments'
import { computeLedger } from './ledger'
import type { Expense, GroupData, Payment, Traveler } from './types'

const T = (id: string, name: string, user_id: string | null): Traveler => ({ id, group_id: 'g', name, color: '#000', user_id, sort_order: 0 })
const travelers = [T('ann', 'Ann', 'uA'), T('bo', 'Bo', 'uB'), T('jo', 'Jordan', null), T('kim', 'Kim', null)]
const data = (isOwner = false): GroupData => ({
  group: { id: 'g', name: 'Trip', currency: 'CAD', invite_code: '', created_by: null, created_at: '' },
  members: [{ user_id: 'uA', role: 'owner', joined_at: '', display_name: 'Ann' }, { user_id: 'uB', role: 'member', joined_at: '', display_name: 'Bo' }, { user_id: 'uC', role: 'member', joined_at: '', display_name: 'Cy' }],
  travelers, expenses: [], payments: [], rates: {}, me: null, isOwner,
})
const P = (o: Partial<Payment>): Payment => ({ id: 'p', group_id: 'g', from_id: 'jo', to_id: 'ann', amount: 50, paid_on: '2026-09-20', status: 'pending', created_by: 'uB', ...o })

describe('who may do what with a payment (mirrors the database)', () => {
  it('pending payment to an account holder: only the receiver can confirm', () => {
    const p = P({})
    expect(paymentPerms(data(), p, 'uA').canConfirm).toBe(true)     // receiver
    expect(paymentPerms(data(), p, 'uB').canConfirm).toBe(false)    // creator
    expect(paymentPerms(data(), p, 'uC').canConfirm).toBe(false)    // unrelated
    expect(paymentPerms(data(), p, 'uOwner').canConfirm).toBe(false) // a plain member, even with an account
  })
  it('an owner or co-admin can mark a payment received for the receiver, but not one they sent themselves', () => {
    const p = P({})
    expect(paymentPerms(data(true), p, 'uOwner').canConfirm).toBe(true)
    expect(paymentPerms(data(true), p, 'uOwner').confirmHint).toMatch(/as an admin/)
    expect(paymentPerms(data(true), P({ from_id: 'bo' }), 'uB').canConfirm).toBe(false)   // admin who is the payer
  })
  it('pending payment to someone WITHOUT an account: another member (not the payer) or the owner can confirm', () => {
    const p = P({ from_id: 'bo', to_id: 'jo' })
    expect(paymentPerms(data(), p, 'uB').canConfirm).toBe(false)    // the payer
    expect(paymentPerms(data(), p, 'uC').canConfirm).toBe(true)     // someone else
    expect(paymentPerms(data(true), p, 'uB').canConfirm).toBe(true) // owner may, even as payer
  })
  it('both parties without accounts: any member can confirm', () => {
    expect(paymentPerms(data(), P({ from_id: 'jo', to_id: 'kim' }), 'uC').canConfirm).toBe(true)
  })
  it('editing / deleting a pending payment: creator, either party, or owner', () => {
    const p = P({})
    for (const [u, expected] of [['uB', true], ['uA', true], ['uC', false]] as const) expect(paymentPerms(data(), p, u).canEdit).toBe(expected)
    expect(paymentPerms(data(true), p, 'uC').canEdit).toBe(true)
    expect(paymentPerms(data(), P({ from_id: 'bo', to_id: 'ann', created_by: 'uC' }), 'uB').canDelete).toBe(true) // the payer
  })
  it('a confirmed payment is locked to the receiver and the owner', () => {
    const p = P({ status: 'confirmed', confirmed_by: 'uA' })
    expect(paymentPerms(data(), p, 'uB').canEdit).toBe(false)
    expect(paymentPerms(data(), p, 'uB').canDelete).toBe(false)
    expect(paymentPerms(data(), p, 'uA').canEdit).toBe(true)
    expect(paymentPerms(data(true), p, 'uX').canDelete).toBe(true)
    expect(paymentPerms(data(), p, 'uA').canConfirm).toBe(false)    // nothing left to confirm
  })
  it('a payment is confirmed instantly only when the receiver records it', () => {
    expect(autoConfirms(data(), 'ann', 'uA')).toBe(true)
    expect(autoConfirms(data(), 'ann', 'uB')).toBe(false)
    expect(autoConfirms(data(), 'jo', 'uA')).toBe(false)            // receiver has no account
  })
})

describe('labels and history', () => {
  it('sent / received', () => { expect(statusLabel(P({}))).toBe('Sent'); expect(statusLabel(P({ status: 'confirmed' }))).toBe('Received'); expect(statusLabel(P({ status: undefined }))).toBe('Received') })
  it('a mistaken "received" tick can be undone by whoever confirmed it, the receiver, or the owner', () => {
    const p = P({ status: 'confirmed', confirmed_by: 'uC', confirmed_at: '2026-09-19T10:00:00Z' })
    expect(paymentPerms(data(), p, 'uC').canUnconfirm).toBe(true)   // confirmed it
    expect(paymentPerms(data(), p, 'uA').canUnconfirm).toBe(true)   // the receiver
    expect(paymentPerms({ ...data(), isOwner: true }, p, 'uZ').canUnconfirm).toBe(true)
    expect(paymentPerms(data(), p, 'uB').canUnconfirm).toBe(false)  // the payer
    expect(paymentPerms(data(), P({}), 'uA').canUnconfirm).toBe(false) // nothing to undo
  })
  it('says who entered, edited and confirmed it, including on behalf of someone without an account', () => {
    const d = data()
    const h = paymentHistory(d, P({ from_id: 'bo', to_id: 'jo', status: 'confirmed', created_by: 'uB', created_at: '2026-09-18T10:00:00Z', confirmed_by: 'uC', confirmed_at: '2026-09-19T10:00:00Z' }), 'uB')
    expect(h[0]).toMatch(/^Entered by You on /)
    expect(h[h.length - 1]).toMatch(/^Confirmed on behalf of Jordan by Cy on /)
    expect(paymentHistory(d, P({ status: 'confirmed', confirmed_by: 'uA', confirmed_at: '2026-09-19T10:00:00Z' }), 'uC').pop()).toMatch(/^Confirmed by Ann on /)
    expect(userName(d, 'uZ')).toBe('a former member'); expect(userName(d, null)).toBe('someone')
  })
})

describe('payment status in the ledger', () => {
  const E = (id: string, o: Partial<Expense>): Expense => ({ id, group_id: 'g', spent_on: '2026-09-12', spent_at: null, vendor: id, location: '', category: '', notes: '', amount: 100, currency: 'CAD', settled_amount: null, payer_id: 'ann', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: [{ traveler_id: 'ann', value: 1 }, { traveler_id: 'jo', value: 1 }], ...o })
  const run = (payments: Payment[]) => computeLedger({ currency: 'CAD', travelers, expenses: [E('e', {})], payments, rates: {}, includeEstimates: true })

  it('Jordan owes Ann 50, unpaid', () => {
    const R = run([]); expect(R.pairs[0]).toMatchObject({ debtor: 'jo', creditor: 'ann', net: 5000, status: 'unpaid', pending: 0 })
  })
  it('a pending payment is shown but not counted', () => {
    const R = run([P({ amount: 20 })])
    expect(R.balance.jo).toBe(-5000); expect(R.pendingPayments).toEqual([{ id: 'p', from: 'jo', to: 'ann', amount: 2000 }])
    expect(R.pairs[0]).toMatchObject({ net: 5000, pending: 2000, status: 'pending' })
  })
  it('a confirmed partial payment leaves the rest owed, labelled partly paid', () => {
    const R = run([P({ amount: 20, status: 'confirmed' })])
    expect(R.balance.jo).toBe(-3000); expect(R.pairs[0]).toMatchObject({ net: 3000, status: 'partial', pending: 0 })
  })
  it('paying it all moves the pair to "paid up"', () => {
    const R = run([P({ amount: 20, status: 'confirmed' }), P({ id: 'q', amount: 30, status: 'confirmed' })])
    expect(R.pairs).toHaveLength(0); expect(R.settledPairs).toHaveLength(1); expect(R.settledPairs[0].status).toBe('paid'); expect(R.balance.jo).toBe(0)
  })
  it('a pending payment on top of a partial one reads as pending', () => {
    expect(run([P({ amount: 20, status: 'confirmed' }), P({ id: 'q', amount: 10 })]).pairs[0].status).toBe('pending')
  })
  it('older data with no status still counts as confirmed', () => {
    const legacy = { ...P({ amount: 20 }) } as Payment; delete (legacy as { status?: string }).status
    expect(run([legacy]).balance.jo).toBe(-3000)
  })
  it('balances still net to zero with pending payments around', () => {
    const R = run([P({ amount: 20 }), P({ id: 'q', amount: 10, status: 'confirmed' })])
    expect(Object.values(R.balance).reduce((a, b) => a + b, 0)).toBe(0)
  })
})
