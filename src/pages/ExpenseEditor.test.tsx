// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'id', error: null }))
const updEq = vi.fn(async (..._a: unknown[]) => ({ error: null }))
const delEq = vi.fn(async (..._a: unknown[]) => ({ error: null }))
vi.mock('../lib/supabase', () => ({
  configured: true,
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ update: () => ({ eq: async (...a: unknown[]) => updEq(...a) }), insert: async () => ({ error: null }), delete: () => ({ in: async () => ({ error: null }), eq: (...a: unknown[]) => delEq(...a) }) }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), upload: async () => ({ error: null }), remove: async () => ({}) }) },
  },
}))

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Alex' }) }))
import ExpenseEditor from './ExpenseEditor'
import { GroupContext } from './GroupShell'
import { ToastProvider } from '../components/ui'
import type { Expense, GroupData } from '../lib/types'

const trav = (id: string, name: string, user_id: string | null = null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0 })
const base: GroupData = {
  group: { id: 'g', name: 'Lisbon', currency: 'CAD', invite_code: 'x', created_by: 'u1', created_at: '' },
  members: [], isOwner: true, rates: {}, payments: [], expenses: [],
  travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo'), trav('c', 'Cy')],
  me: trav('a', 'Ann', 'u1'),
}
const foreign: Expense = {
  id: 'e9', group_id: 'g', spent_on: '2026-10-02', spent_at: '19:10:00', vendor: 'Hotel', location: '', category: '', notes: '',
  amount: 200, currency: 'EUR', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [],
  splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }],
}

function mount(eid: string, data: GroupData = base) {
  return render(
    <ToastProvider>
      <GroupContext.Provider value={{ data, reload: async () => {} }}>
        <MemoryRouter initialEntries={['/g/g/expense/' + eid]}>
          <Routes><Route path="/g/:id/expense/:eid" element={<ExpenseEditor />} /><Route path="/g/:id" element={<div>trip</div>} /></Routes>
        </MemoryRouter>
      </GroupContext.Provider>
    </ToastProvider>,
  )
}
const lastCall = () => (rpc.mock.calls.at(-1) as unknown as [string, { p: Record<string, unknown>; p_splits: Array<{ traveler_id: string; value: number }> }])[1]

beforeEach(() => { rpc.mockClear(); delEq.mockClear(); localStorage.clear() })
afterEach(cleanup)

describe('expense entry: settle currency by default, foreign on demand', () => {
  it('local entry has no currency picker and no statement field, and saves in the settle currency', async () => {
    mount('new')
    expect(screen.queryByLabelText('Currency')).toBeNull()
    expect(screen.queryByLabelText(/Charged in CAD/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25.50' } })
    fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'Taxi' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const c = lastCall()
    expect(rpc.mock.calls[0][0]).toBe('save_expense')
    expect(c.p).toMatchObject({ currency: 'CAD', amount: 25.5, settled_amount: null, vendor: 'Taxi', payer_id: 'a', split_mode: 'equal' })
    expect(c.p_splits).toHaveLength(3)
  })

  it('toggle reveals currency + statement field; saving without the statement amount leaves it pending', async () => {
    mount('new')
    fireEvent.click(screen.getByLabelText('Paid in a different currency'))
    expect(screen.getByLabelText('Currency')).toBeTruthy()
    expect(screen.getByLabelText(/Charged in CAD/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '85' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ currency: 'EUR', amount: 85, settled_amount: null })
  })

  it('can enter the statement amount up front', async () => {
    mount('new')
    fireEvent.click(screen.getByLabelText('Paid in a different currency'))
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '85' } })
    fireEvent.change(screen.getByLabelText(/Charged in CAD/), { target: { value: '128,40' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ currency: 'EUR', amount: 85, settled_amount: 128.4 })
  })

  it('turning the toggle off again falls back to the settle currency and drops the statement amount', async () => {
    mount('new')
    const t = screen.getByLabelText('Paid in a different currency')
    fireEvent.click(t)
    fireEvent.change(screen.getByLabelText(/Charged in CAD/), { target: { value: '99' } })
    fireEvent.click(t)
    expect(screen.queryByLabelText(/Charged in CAD/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ currency: 'CAD', amount: 12, settled_amount: null })
  })

  it('later: open a foreign expense and add the real CAD amount from the statement', async () => {
    mount('e9', { ...base, expenses: [foreign] })
    expect((screen.getByLabelText('Paid in a different currency') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('EUR')
    fireEvent.change(screen.getByLabelText(/Charged in CAD/), { target: { value: '311.75' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const c = lastCall()
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_id: 'e9' })
    expect(c.p).toMatchObject({ currency: 'EUR', amount: 200, settled_amount: 311.75 })
    expect(c.p_splits.map(s => s.traveler_id).sort()).toEqual(['a', 'b'])
  })

  it('blocks saving when the split does not add up', async () => {
    mount('new')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Percent'))
    fireEvent.change(screen.getByLabelText('Ann percent'), { target: { value: '60' } })
    expect(screen.getByText(/still to assign|over/)).toBeTruthy()
    fireEvent.click(screen.getByText('Save'))
    await new Promise(r => setTimeout(r, 50))
    expect(rpc).not.toHaveBeenCalled()
  })

  it('percent split saves the entered percentages', async () => {
    mount('new')
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.click(screen.getByText('Percent'))
    fireEvent.change(screen.getByLabelText('Ann percent'), { target: { value: '50' } })
    fireEvent.change(screen.getByLabelText('Bo percent'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Cy percent'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const c = lastCall()
    expect(c.p.split_mode).toBe('percent')
    expect(Object.fromEntries(c.p_splits.map(s => [s.traveler_id, s.value]))).toEqual({ a: 50, b: 30, c: 20 })
  })

  it('deleting an expense asks for confirmation first, and Cancel keeps it', async () => {
    mount('e9', { ...base, expenses: [{ ...foreign, created_by: 'u1', created_at: '2026-09-02T10:00:00Z', updated_by: 'u2', updated_at: '2026-09-03T10:00:00Z' }], members: [{ user_id: 'u1', role: 'owner', joined_at: '', display_name: 'Alex' }, { user_id: 'u2', role: 'member', joined_at: '', display_name: 'Sam' }] })
    expect(screen.getByText(/Added by You on/)).toBeTruthy()
    expect(screen.getByText(/Last edited by Sam on/)).toBeTruthy()
    fireEvent.click(screen.getByText('Delete expense'))
    const dlg = await screen.findByRole('alertdialog')
    expect(dlg.textContent).toMatch(/Hotel/); expect(dlg.textContent).toMatch(/can’t be undone/)
    expect(delEq).not.toHaveBeenCalled()
    fireEvent.click(within(dlg).getByText('Cancel'))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(delEq).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Delete expense'))
    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getAllByText('Delete').find(el => el.closest('[role=alertdialog]'))!)
    await waitFor(() => expect(delEq).toHaveBeenCalledWith('id', 'e9'))
  })
})

describe('a group that spends in another currency than it settles in', () => {
  const venice: GroupData = {
    ...base, group: { ...base.group, spending_currency: 'EUR' }, rates: { EUR: 1.5, QAR: 0.37 },
    travelers: [{ ...trav('a', 'Ann', 'u1') }, { ...trav('b', 'Bo'), statement_currency: 'QAR' }, trav('c', 'Cy')],
  }
  it('opens in the spending currency with no toggle, and the statement field already showing', () => {
    mount('new', venice)
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('EUR')
    expect(screen.queryByLabelText('Paid in a different currency')).toBeNull()
    expect(screen.getByLabelText(/Charged in CAD/)).toBeTruthy()
  })
  it('a CAD-card payer types the exact CAD amount and it is saved as the settle amount', async () => {
    mount('new', venice)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Charged in CAD/), { target: { value: '152' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ currency: 'EUR', amount: 100, settled_amount: 152, charged_amount: null, charged_currency: null })
  })
  it('a QAR-card payer enters the QAR charge, sees the converted figure, and can leave the exact CAD blank', async () => {
    mount('new', venice)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Paid by/), { target: { value: 'b' } })
    expect(screen.queryByLabelText(/Charged in CAD/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Charged to the card, in QAR'), { target: { value: '600' } })
    expect(screen.getByText(/counts as ≈/).textContent).toContain('222.00')   // 600 × 0.37
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ currency: 'EUR', amount: 100, settled_amount: null, charged_amount: 600, charged_currency: 'QAR' })
  })
  it('typing the exact CAD amount overrides the rate', async () => {
    mount('new', venice)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Paid by/), { target: { value: 'b' } })
    fireEvent.change(screen.getByLabelText('Charged to the card, in QAR'), { target: { value: '600' } })
    fireEvent.change(screen.getByLabelText(/Exact CAD amount/), { target: { value: '219.40' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ settled_amount: 219.4, charged_amount: 600, charged_currency: 'QAR' })
  })
  it('says so when there is no rate for the statement currency', () => {
    mount('new', { ...venice, rates: { EUR: 1.5 } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Paid by/), { target: { value: 'b' } })
    fireEvent.change(screen.getByLabelText('Charged to the card, in QAR'), { target: { value: '600' } })
    expect(screen.getByText(/No QAR rate is set/)).toBeTruthy()
  })
  it('can still be switched to the settle currency for a local purchase', async () => {
    mount('new', venice)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'CAD' } })
    expect(screen.queryByLabelText(/Charged in CAD/)).toBeNull()
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastCall().p).toMatchObject({ currency: 'CAD', amount: 12, settled_amount: null, charged_amount: null })
  })
  it('remembers a person’s card currency when they change it', async () => {
    mount('new', venice)
    fireEvent.change(screen.getByLabelText(/card statement is in/), { target: { value: 'USD' } })
    await waitFor(() => expect(updEq).toHaveBeenCalledWith('id', 'a'))
  })
})
