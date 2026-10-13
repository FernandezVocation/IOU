// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'id', error: null }))
const items = vi.hoisted(() => ({ list: [] as Array<{ id: string; title: string; description: string; type: string; starts_on: string | null }> }))
vi.mock('../lib/supabase', () => ({
  configured: true,
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (t: string) => t === 'vaults'
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'v1' } }) }) }) }
      : t === 'vault_items'
        ? { select: () => ({ eq: () => ({ order: async () => ({ data: items.list }) }) }) }
        : { update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }), delete: () => ({ in: async () => ({ error: null }), eq: async () => ({ error: null }) }) },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), upload: async () => ({ error: null }), remove: async () => ({}) }) },
  },
}))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Alex' }) }))
import ExpenseEditor from './ExpenseEditor'
import ExpensesTab from './ExpensesTab'
import { GroupContext } from './GroupShell'
import { ToastProvider } from '../components/ui'
import type { Expense, GroupData } from '../lib/types'

const trav = (id: string, name: string, user_id: string | null = null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0 })
const exp = (o: Partial<Expense>): Expense => ({
  id: 'e1', group_id: 'g', spent_on: '2026-10-10', spent_at: null, vendor: 'Hotel', location: '', category: '', notes: '', amount: 100, currency: 'CAD',
  settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }], ...o,
})
const data = (expenses: Expense[]): GroupData => ({
  group: { id: 'g', name: 'Italy', currency: 'CAD', invite_code: 'x', created_by: 'u1', created_at: '' },
  members: [], isOwner: true, rates: {}, payments: [], expenses, travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo')], me: trav('a', 'Ann', 'u1'),
})
const wrap = (d: GroupData, at: string, el: JSX.Element) => render(
  <ToastProvider><GroupContext.Provider value={{ data: d, reload: async () => {} }}>
    <MemoryRouter initialEntries={[at]}><Routes><Route path="/g/:id/expense/:eid" element={el} /><Route path="/g/:id" element={el} /></Routes></MemoryRouter>
  </GroupContext.Provider></ToastProvider>)
const lastP = () => (rpc.mock.calls.at(-1) as unknown as [string, { p: Record<string, unknown> }])[1].p

beforeEach(() => { rpc.mockClear(); items.list = [] })
afterEach(cleanup)

describe('expense editor: status and vault item', () => {
  it('saves as Final with no link by default', async () => {
    wrap(data([]), '/g/g/expense/new', <ExpenseEditor />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastP()).toMatchObject({ status: 'final', vault_item_id: null })
  })
  it('saves the chosen status', async () => {
    wrap(data([]), '/g/g/expense/new', <ExpenseEditor />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Needs info' }))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastP().status).toBe('needs_info')
  })
  it('offers the vault items it can see, and saves the one chosen', async () => {
    items.list = [{ id: 'i1', title: 'Italo', description: 'Venice to Florence', type: 'ticket', starts_on: '2026-10-10' }]
    wrap(data([]), '/g/g/expense/new', <ExpenseEditor />)
    const pick = await screen.findByLabelText('Vault item')
    fireEvent.change(pick, { target: { value: 'i1' } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '10' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastP().vault_item_id).toBe('i1')
  })
  it('has no vault picker when the group has no vault items', () => {
    wrap(data([]), '/g/g/expense/new', <ExpenseEditor />)
    expect(screen.queryByLabelText('Vault item')).toBeNull()
  })
  it('pre-selects the item when it comes from Add as expense', async () => {
    items.list = [{ id: 'i1', title: 'Italo', description: '', type: 'ticket', starts_on: null }]
    wrap(data([]), '/g/g/expense/new?item=i1&vendor=Italo', <ExpenseEditor />)
    expect(((await screen.findByLabelText('Vault item')) as HTMLSelectElement).value).toBe('i1')
  })
})

describe('expense list: status label and vault icon', () => {
  it('shows a label for anything not Final, and nothing for Final', () => {
    wrap(data([exp({ id: 'a1', vendor: 'Hotel', status: 'estimate' }), exp({ id: 'a2', vendor: 'Taxi', status: 'final' }), exp({ id: 'a3', vendor: 'Dinner', status: 'pending' })]), '/g/g', <ExpensesTab />)
    expect(screen.getByText('Estimate')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.queryByText('Final')).toBeNull()
  })
  it('shows the vault icon only when the person can see the linked item', async () => {
    items.list = [{ id: 'i1', title: 'Italo', description: '', type: 'ticket', starts_on: null }]
    wrap(data([exp({ id: 'a1', vendor: 'Train', vault_item_id: 'i1' }), exp({ id: 'a2', vendor: 'Secret', vault_item_id: 'hidden' })]), '/g/g', <ExpensesTab />)
    expect(await screen.findByLabelText('Linked to vault item: Italo')).toBeTruthy()
    expect(screen.getAllByLabelText(/Linked to vault item/)).toHaveLength(1)
  })
})
