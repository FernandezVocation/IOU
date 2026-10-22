// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const rpc = vi.fn(async (..._a: unknown[]) => ({ data: { status: 'pending' }, error: null }))
const auth = vi.hoisted(() => ({ id: 'u1' }))
vi.mock('../lib/supabase', () => ({ configured: true, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: auth.id }, displayName: 'x' }) }))
import PaymentSheet from './PaymentSheet'
import { GroupContext } from '../pages/GroupShell'
import { ToastProvider } from './ui'
import type { Expense, GroupData, Payment } from '../lib/types'

const trav = (id: string, name: string, user_id: string | null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0 })
const hotel: Expense = { id: 'e', group_id: 'g', spent_on: '2026-09-12', spent_at: null, vendor: 'Hotel', location: '', category: '', notes: '', amount: 300, currency: 'CAD', settled_amount: null, payer_id: 'alex', split_mode: 'equal', created_at: '', updated_at: '', receipts: [],
  splits: [{ traveler_id: 'alex', value: 1 }, { traveler_id: 'sam', value: 1 }, { traveler_id: 'jo', value: 1 }] }
const members = [{ user_id: 'u1', role: 'owner' as const, joined_at: '', display_name: 'Alex' }, { user_id: 'u2', role: 'member' as const, joined_at: '', display_name: 'Sam' }]
const base = (extra: Partial<GroupData> = {}, userId = 'u1'): GroupData => ({
  group: { id: 'g', name: 'Lisbon', currency: 'CAD', invite_code: '', created_by: 'u1', created_at: '' }, members,
  travelers: [trav('alex', 'Alex', 'u1'), trav('sam', 'Sam', 'u2'), trav('jo', 'Jordan', null)], expenses: [hotel], payments: [], rates: {},
  me: { ...trav('alex', 'Alex', 'u1') }, isOwner: userId === 'u1', ...extra,
})
const mount = (props: Parameters<typeof PaymentSheet>[0], data = base()) =>
  render(<ToastProvider><GroupContext.Provider value={{ data, reload: async () => {} }}><PaymentSheet {...props} onClose={props.onClose} /></GroupContext.Provider></ToastProvider>)
const last = () => rpc.mock.calls.at(-1) as unknown as [string, { p_id: string; p_group: string; p: Record<string, unknown> }]
beforeEach(() => { rpc.mockClear(); auth.id = 'u1' }); afterEach(cleanup)

describe('recording a payment', () => {
  it('suggests the full amount, then accepts a partial payment with date, method and note', async () => {
    mount({ from: 'jo', to: 'alex', onClose: () => {} })
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('100')
    expect(screen.getByText(/settles what is owed in full/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '40' } })
    expect(screen.getByText('Partial payment: CAD 60.00 will still be owed after this.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Date paid'), { target: { value: '2026-09-20' } })
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'E-transfer' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'sent after dinner' } })
    fireEvent.click(screen.getByText('Record payment', { selector: 'button.primary' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(last()[0]).toBe('save_payment')
    expect(last()[1].p).toEqual({ from_id: 'jo', to_id: 'alex', amount: 40, paid_on: '2026-09-20', method: 'E-transfer', note: 'sent after dinner' })
    expect(last()[1].p_group).toBe('g')
  })
  it('warns when paying more than is owed, and supports a custom method', async () => {
    mount({ from: 'jo', to: 'alex', onClose: () => {} })
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '150' } })
    expect(screen.getByText(/CAD 50.00 more than is owed/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: '__other' } })
    fireEvent.change(screen.getByLabelText('Other method'), { target: { value: 'Wise' } })
    fireEvent.click(screen.getByText('Record payment', { selector: 'button.primary' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(last()[1].p).toMatchObject({ amount: 150, method: 'Wise' })
  })
  it('says it is marked Received right away when you are the receiver', () => {
    mount({ from: 'jo', to: 'alex', onClose: () => {} })
    expect(screen.getByText(/marked Received right away/)).toBeTruthy()
  })
  it('says it will show as Sent until the receiver confirms when someone else records it', () => {
    auth.id = 'u2'
    mount({ from: 'jo', to: 'alex', onClose: () => {} }, { ...base({}, 'u2'), me: trav('sam', 'Sam', 'u2'), isOwner: false })
    expect(screen.getByText(/Sent until Alex confirms/)).toBeTruthy()
  })
  it('explains who can confirm when the receiver has no account', () => {
    mount({ from: 'alex', to: 'jo', onClose: () => {} })
    expect(screen.getByText(/Sent until Jordan confirms.*they have no account.*another member/)).toBeTruthy()
  })
  it('refuses a zero amount before calling the server', async () => {
    mount({ from: 'sam', to: 'jo', onClose: () => {} })
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '0' } })
    fireEvent.click(screen.getByText('Record payment', { selector: 'button.primary' }))
    await new Promise(r => setTimeout(r, 30))
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('editing and deleting a payment', () => {
  const pay = (o: Partial<Payment> = {}): Payment => ({ id: 'p1', group_id: 'g', from_id: 'jo', to_id: 'alex', amount: 30, paid_on: '2026-09-18', status: 'pending', method: 'Cash', note: 'half', created_by: 'u2', created_at: '2026-09-18T10:00:00Z', ...o })

  it('shows the history and lets the receiver correct the amount', async () => {
    const d = base({ payments: [pay()] })
    mount({ payment: d.payments[0], onClose: () => {} }, d)
    expect(screen.getByText(/Entered by Sam on/)).toBeTruthy()
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('30')
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '25' } })
    fireEvent.click(screen.getByText('Save changes'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(last()[1].p_id).toBe('p1'); expect(last()[1].p).toMatchObject({ amount: 25, method: 'Cash', note: 'half' })
  })
  it('locks a confirmed payment for people who are not the receiver or owner', () => {
    auth.id = 'u2'
    const d = { ...base({ payments: [pay({ status: 'confirmed', confirmed_by: 'u1', confirmed_at: '2026-09-19T10:00:00Z' })] }, 'u2'), me: trav('sam', 'Sam', 'u2'), isOwner: false }
    mount({ payment: d.payments[0], onClose: () => {} }, d)
    expect(screen.getByText(/This payment is confirmed\. Only the person who received it/)).toBeTruthy()
    expect(screen.queryByText('Save changes')).toBeNull(); expect(screen.queryByText('Delete payment')).toBeNull()
  })
  it('deleting needs a confirmation step, and Cancel does nothing', async () => {
    const d = base({ payments: [pay()] })
    mount({ payment: d.payments[0], onClose: () => {} }, d)
    fireEvent.click(screen.getByText('Delete payment'))
    const dlg = await screen.findByRole('alertdialog')
    expect(dlg.textContent).toMatch(/can’t be undone/)
    expect(rpc).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(rpc).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Delete payment'))
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getAllByText('Delete').find(el => el.closest('[role=alertdialog]'))!)
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('delete_payment', { p_id: 'p1' }))
  })
  it('warns that deleting a confirmed payment raises balances again', async () => {
    const d = base({ payments: [pay({ status: 'confirmed', confirmed_by: 'u1', confirmed_at: '2026-09-19T10:00:00Z' })] })
    mount({ payment: d.payments[0], onClose: () => {} }, d)
    fireEvent.click(screen.getByText('Delete payment'))
    expect((await screen.findByRole('alertdialog')).textContent).toMatch(/balances go back up/)
  })
})

describe('fewest payments', () => {
  // Itemized, Jordan owes Alex 100 and Sam 20; the fewest plan has Jordan pay Alex 120 in one go.
  const sam: Expense = { ...hotel, id: 'e2', vendor: 'Taxi', amount: 60, payer_id: 'sam' }
  it('suggests the full amount from the plan, including what is routed through the receiver', () => {
    mount({ from: 'jo', to: 'alex', mode: 'fewest', onClose: () => {} }, base({ expenses: [hotel, sam] }))
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('120')
    expect(screen.getByText(/Jordan owes Alex CAD 120.00/)).toBeTruthy()
  })
  it('itemized still suggests only the direct amount', () => {
    mount({ from: 'jo', to: 'alex', onClose: () => {} }, base({ expenses: [hotel, sam] }))
    expect((screen.getByLabelText(/Amount/) as HTMLInputElement).value).toBe('100')
  })
})
