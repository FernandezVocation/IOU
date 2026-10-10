// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const rpc = vi.fn(async (..._a: unknown[]) => ({ data: { status: 'confirmed' }, error: null }))
const auth = vi.hoisted(() => ({ id: 'u1' }))
vi.mock('../lib/supabase', () => ({ configured: true, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: auth.id }, displayName: 'x' }) }))
import BalancesTab from './BalancesTab'
import { GroupContext } from './GroupShell'
import { ToastProvider } from '../components/ui'
import type { Expense, GroupData, Payment } from '../lib/types'

const trav = (id: string, name: string, user_id: string | null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0 })
const hotel: Expense = { id: 'e', group_id: 'g', spent_on: '2026-09-12', spent_at: null, vendor: 'Hotel', location: '', category: '', notes: '', amount: 300, currency: 'CAD', settled_amount: null, payer_id: 'alex', split_mode: 'equal', created_at: '', updated_at: '', receipts: [],
  splits: [{ traveler_id: 'alex', value: 1 }, { traveler_id: 'sam', value: 1 }, { traveler_id: 'jo', value: 1 }] }
const pay = (o: Partial<Payment> = {}): Payment => ({ id: 'p1', group_id: 'g', from_id: 'sam', to_id: 'alex', amount: 40, paid_on: '2026-09-20', method: 'E-transfer', note: '', status: 'pending', created_by: 'u2', created_at: '2026-09-20T10:00:00Z', ...o } as Payment)
const members = [{ user_id: 'u1', role: 'owner' as const, joined_at: '', display_name: 'Alex' }, { user_id: 'u2', role: 'member' as const, joined_at: '', display_name: 'Sam' }]
const data = (payments: Payment[], me: 'alex' | 'sam', owner: boolean): GroupData => ({
  group: { id: 'g', name: 'Lisbon', currency: 'CAD', invite_code: '', created_by: 'u1', created_at: '' }, members,
  travelers: [trav('alex', 'Alex', 'u1'), trav('sam', 'Sam', 'u2'), trav('jo', 'Jordan', null)], expenses: [hotel], payments, rates: {},
  me: me === 'alex' ? trav('alex', 'Alex', 'u1') : trav('sam', 'Sam', 'u2'), isOwner: owner,
})
const mount = (d: GroupData) => render(<ToastProvider><MemoryRouter><GroupContext.Provider value={{ data: d, reload: async () => {} }}><BalancesTab /></GroupContext.Provider></MemoryRouter></ToastProvider>)
beforeEach(() => { rpc.mockClear(); auth.id = 'u1' }); afterEach(cleanup)

describe('the "Received" tick box', () => {
  it('shows a Sent label and a tick box to the person who was paid', () => {
    mount(data([pay()], 'alex', true))
    const card = screen.getByText('Sam → You', { selector: 'b' }).closest('.pcard') as HTMLElement
    expect(within(card).getByText('Sent')).toBeTruthy()
    const box = within(card).getByLabelText('I received this') as HTMLInputElement
    expect(box.checked).toBe(false)
  })
  it('asks before marking received, and Cancel changes nothing', async () => {
    mount(data([pay()], 'alex', true))
    fireEvent.click(screen.getByLabelText('I received this'))
    expect(screen.getByText('Mark as received?')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    await new Promise(r => setTimeout(r, 30))
    expect(rpc).not.toHaveBeenCalled()
  })
  it('ticking and confirming calls confirm_payment', async () => {
    mount(data([pay()], 'alex', true))
    fireEvent.click(screen.getByLabelText('I received this'))
    fireEvent.click(screen.getByText('Yes, received'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('confirm_payment', { p_id: 'p1' }))
  })
  it('a received payment shows Received with the tick on, and unticking (after asking) undoes it', async () => {
    mount(data([pay({ status: 'confirmed', confirmed_by: 'u1', confirmed_at: '2026-09-21T10:00:00Z' })], 'alex', true))
    const card = screen.getByText('Sam → You', { selector: 'b' }).closest('.pcard') as HTMLElement
    expect(within(card).getByText('Received', { selector: '.tag' })).toBeTruthy()
    const box = within(card).getByLabelText('Received') as HTMLInputElement
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(screen.getByText('Mark as not received?')).toBeTruthy()
    fireEvent.click(screen.getByText('Yes, undo'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('unconfirm_payment', { p_id: 'p1' }))
  })
  it('tells the person who was paid that the ball is in their court', () => {
    mount(data([pay()], 'alex', true))
    expect(screen.getByText('Sent. Waiting for you to confirm you received it.')).toBeTruthy()
  })
  it('the payer gets no tick box on their own payment (the receiver confirms)', () => {
    auth.id = 'u2'
    mount(data([pay()], 'sam', false))
    expect(screen.queryByLabelText('I received this')).toBeNull()
    expect(screen.getByText(/Sent\. Waiting for Alex to confirm they received it/)).toBeTruthy()
  })
  it('for someone without an account, another member can tick on their behalf; the payer cannot', () => {
    auth.id = 'u1'
    const toJo = pay({ id: 'p2', from_id: 'sam', to_id: 'jo', created_by: 'u2' })
    mount(data([toJo], 'alex', true))
    expect(screen.getByLabelText('Jordan received this (confirm for them)')).toBeTruthy()
    cleanup(); auth.id = 'u2'
    mount(data([toJo], 'sam', false))
    expect(screen.queryByLabelText(/received this/)).toBeNull()
  })
  it('shows who entered it and who confirmed it', () => {
    mount(data([pay({ status: 'confirmed', confirmed_by: 'u1', confirmed_at: '2026-09-21T10:00:00Z' })], 'alex', true))
    expect(screen.getByText(/Entered by Sam on/)).toBeTruthy()
    expect(screen.getByText(/Confirmed by You on/)).toBeTruthy()
  })
})

describe('sorting who pays whom', () => {
  it('starts itemized and largest-first, with no group headings', () => {
    mount(data([], 'alex', true))
    expect(screen.getByText('Itemized').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Largest first').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelectorAll('.day').length).toBe(0)
  })
  it('by person owed: one heading per creditor with their total', () => {
    mount(data([], 'alex', true))
    fireEvent.click(screen.getByText('By person owed'))
    expect(screen.getByText(/You are owed CAD 200\.00/)).toBeTruthy()
    expect(screen.getByText('2 payments')).toBeTruthy()
  })
  it('by person owing: one heading per debtor, in either payment view', () => {
    mount(data([], 'alex', true))
    fireEvent.click(screen.getByText('By person owing'))
    expect(screen.getByText(/Sam owes CAD 100\.00/)).toBeTruthy(); expect(screen.getByText(/Jordan owes CAD 100\.00/)).toBeTruthy()
    fireEvent.click(screen.getByText('Fewest payments'))
    expect(screen.getByText(/Sam owes CAD 100\.00/)).toBeTruthy()
    fireEvent.click(screen.getByText('By person owed'))
    expect(screen.getByText(/You are owed CAD 200\.00/)).toBeTruthy()
  })
})
