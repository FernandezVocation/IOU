// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const rpc = vi.fn(async (..._a: unknown[]): Promise<{ data: unknown; error: null }> => ({ data: 'tok', error: null }))
const chain: Record<string, unknown> = {}
chain.select = () => chain; chain.eq = () => chain; chain.order = async () => ({ data: [], error: null })
vi.mock('../lib/supabase', () => ({
  configured: true, supabaseUrl: 'http://x', supabaseKey: 'k',
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: () => chain, storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), upload: async () => ({ error: null }), remove: async () => ({}) }) } },
}))
const receiptSession = vi.hoisted(() => ({ ok: true }))
vi.mock('../lib/shared', async () => {
  const real = await vi.importActual<typeof import('../lib/shared')>('../lib/shared')
  return {
    ...real,
    openReceiptSession: async () => (receiptSession.ok ? ({} as never) : null),
    signedReceiptUrls: async (_c: unknown, paths: string[]) => Object.fromEntries(paths.map(p => [p, 'https://signed.example/' + p])),
  }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Alex' }) }))
import ExpenseEditor from './ExpenseEditor'
import BalancesTab from './BalancesTab'
import TripTab from './TripTab'
import SharedPage from './SharedPage'
import { GroupContext, TabsShell } from './GroupShell'
import { ToastProvider } from '../components/ui'
import type { Expense, GroupData } from '../lib/types'
import type { SharedTrip } from '../lib/shared'

const trav = (id: string, name: string, user_id: string | null = null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0 })
const exp = (created_by: string): Expense => ({
  id: 'e1', group_id: 'g', spent_on: '2026-10-02', spent_at: null, vendor: 'Trevi', location: '', category: '', notes: '', amount: 1400, currency: 'CAD', settled_amount: null,
  payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', created_by, receipts: [], splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }],
})
const members = [
  { user_id: 'u1', role: 'owner' as const, joined_at: '', display_name: 'Alex' },
  { user_id: 'u2', role: 'viewer' as const, joined_at: '', display_name: 'Vic' },
  { user_id: 'u3', role: 'editor' as const, joined_at: '', display_name: 'Ed' },
]
const data = (o: Partial<GroupData>): GroupData => ({
  group: { id: 'g', name: 'Italy', currency: 'CAD', invite_code: 'abc', created_by: 'u1', created_at: '' },
  members, travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo')], expenses: [exp('u1')], payments: [], rates: {},
  me: trav('a', 'Ann', 'u1'), isOwner: false, canEdit: true, ...o,
})
const withCtx = (d: GroupData, ui: React.ReactNode, path = '/') =>
  render(<ToastProvider><GroupContext.Provider value={{ data: d, reload: async () => {} }}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></GroupContext.Provider></ToastProvider>)
const editor = (d: GroupData) => withCtx(d, <Routes><Route path="/g/:id/expense/:eid" element={<ExpenseEditor />} /></Routes>, '/g/g/expense/e1')
beforeEach(() => { rpc.mockClear(); receiptSession.ok = true }); afterEach(cleanup)

describe('who can change an expense', () => {
  it('the owner can save and delete anyone’s expense', async () => {
    editor(data({ isOwner: true, expenses: [exp('someone-else')] }))
    expect(await screen.findByText('Save')).toBeTruthy(); expect(screen.getByText('Delete expense')).toBeTruthy()
  })
  it('an editor can change one they added', async () => {
    editor(data({ expenses: [exp('u1')] }))
    expect(await screen.findByText('Save')).toBeTruthy(); expect(screen.getByText('Delete expense')).toBeTruthy()
  })
  it('an editor sees someone else’s expense as read-only, with a reason', async () => {
    editor(data({ expenses: [exp('u3')] }))
    expect(await screen.findByText('View only')).toBeTruthy()
    expect(screen.queryByText('Save')).toBeNull(); expect(screen.queryByText('Delete expense')).toBeNull()
    expect(screen.getByText(/only change expenses you added/)).toBeTruthy()
    expect((document.querySelector('fieldset') as HTMLFieldSetElement).disabled).toBe(true)
  })
  it('a viewer cannot save or delete anything, and cannot start a new expense', async () => {
    editor(data({ canEdit: false }))
    expect(await screen.findByText('View only')).toBeTruthy()
    expect(screen.queryByText('Save')).toBeNull(); expect(screen.queryByText('Delete expense')).toBeNull()
    expect(screen.getByText(/view-only access/)).toBeTruthy()
  })
})

describe('what a viewer sees in the group', () => {
  const shell = (d: GroupData) => withCtx(d, <Routes><Route path="/" element={<TabsShell />}><Route index element={<div>list</div>} /></Route></Routes>)
  it('has no add-expense button, and is told why', () => {
    shell(data({ canEdit: false }))
    expect(screen.queryByLabelText('Add expense')).toBeNull(); expect(screen.getByText(/view-only access/)).toBeTruthy()
  })
  it('an editor has the add button and no warning', () => {
    shell(data({}))
    expect(screen.getByLabelText('Add expense')).toBeTruthy(); expect(screen.queryByText(/view-only access/)).toBeNull()
  })
  it('cannot record payments from the Balances tab', () => {
    const d = data({ canEdit: false, travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo', 'u9')] })
    withCtx(d, <BalancesTab />)
    expect(screen.queryByText('Record a payment')).toBeNull()
  })
})

describe('the owner’s controls', () => {
  it('can make a member an editor, or back to view-only', async () => {
    withCtx(data({ isOwner: true, canEdit: true }), <TripTab />)
    const sel = await screen.findByLabelText('Access for Vic') as HTMLSelectElement
    expect(sel.value).toBe('viewer')
    fireEvent.change(sel, { target: { value: 'editor' } })
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('set_member_role', { p_group: 'g', p_user: 'u2', p_role: 'editor' }))
    expect(screen.queryByLabelText('Access for Alex')).toBeNull()   // the owner's own access is not editable
  })
  it('non-owners see roles but no controls, and no link maker', () => {
    withCtx(data({ isOwner: false }), <TripTab />)
    expect(screen.queryByLabelText('Access for Vic')).toBeNull()
    expect(screen.getByText('View only')).toBeTruthy()
    expect(screen.queryByText('Read-only links')).toBeNull()
  })
  it('creates a link for the entire group', async () => {
    withCtx(data({ isOwner: true }), <TripTab />)
    fireEvent.click(await screen.findByText('Entire group', { selector: 'button' }))
    expect(screen.getByText(/receipt photos/)).toBeTruthy()
    fireEvent.click(screen.getByText('Create link for the entire group'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('create_share_link', expect.objectContaining({ p_scope: 'group', p_traveler_ids: [], p_group: 'g' })))
  })
  it('creates a link for specific people', async () => {
    withCtx(data({ isOwner: true }), <TripTab />)
    const box = (await screen.findAllByRole('checkbox'))[0]
    expect((screen.getByText('Create link') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(box)
    fireEvent.click(screen.getByText('Create link'))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('create_share_link', expect.objectContaining({ p_scope: 'person', p_traveler_ids: ['a'] })))
  })
})

describe('the read-only page for a whole-group link', () => {
  const trip: SharedTrip = {
    scope: 'group', label: 'Whole group', group: { name: 'Italy 2026', currency: 'CAD' }, linked: [],
    travelers: ['Steve', 'ShirleyFerrao', 'Lavi'].map((n, i) => ({ id: 't' + i, name: n, color: '#2B44FF' })),
    expenses: [
      { id: 'v', spent_on: '2026-10-09', spent_at: null, vendor: 'Vatican', location: '', category: 'Attractions', subcategory: 'Museum', amount: 300, currency: 'CAD', settled_amount: null, payer_id: 't1', split_mode: 'equal',
        splits: [{ traveler_id: 't0', value: 1 }, { traveler_id: 't1', value: 1 }, { traveler_id: 't2', value: 1 }], receipts: [{ id: 'r1', path: 'g/v/r.jpg', name: 'r.jpg', mime: 'image/jpeg' }] },
    ],
    payments: [], rates: {}, generated_at: '',
  }
  const mount = () => render(<MemoryRouter initialEntries={['/b/' + 'a'.repeat(48)]}><Routes><Route path="/b/:token" element={<SharedPage />} /></Routes></MemoryRouter>)
  beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: trip, error: null }) })

  it('shows the whole group read-only, with no editing controls', async () => {
    mount()
    expect(await screen.findByText('Read-only view of the whole group')).toBeTruthy()
    expect(screen.getByText('Italy 2026')).toBeTruthy()
    expect(screen.getByText('Vatican')).toBeTruthy()
    expect(screen.queryByText('Record a payment')).toBeNull(); expect(screen.queryByLabelText('Add expense')).toBeNull(); expect(screen.queryByText('Save')).toBeNull()
  })
  it('lists each person’s share of an expense when it is opened', async () => {
    mount(); fireEvent.click(await screen.findByText('Vatican'))
    expect(screen.getByText('Steve’s share')).toBeTruthy(); expect(screen.getAllByText('CAD 100.00').length).toBeGreaterThan(0)
  })
  it('shows who owes whom, itemized or fewest', async () => {
    mount(); await screen.findByText('Vatican'); fireEvent.click(screen.getByText('Balances', { selector: 'button' }))
    expect(screen.getByText('Steve owes ShirleyFerrao')).toBeTruthy(); expect(screen.getByText('Lavi owes ShirleyFerrao')).toBeTruthy()
    fireEvent.click(screen.getByText('Fewest payments')); expect(screen.getByText('Steve owes ShirleyFerrao')).toBeTruthy()
  })
  it('shows receipt photos using the visitor’s signed links', async () => {
    mount(); await screen.findByText('Vatican'); fireEvent.click(screen.getByText('Receipts', { selector: 'button' }))
    await waitFor(() => expect((screen.getByAltText('r.jpg') as HTMLImageElement).src).toBe('https://signed.example/g/v/r.jpg'))
  })
  it('says so, instead of breaking, when receipts cannot be opened', async () => {
    receiptSession.ok = false
    mount(); await screen.findByText('Vatican'); fireEvent.click(screen.getByText('Receipts', { selector: 'button' }))
    expect(await screen.findByText(/can’t be shown right now/)).toBeTruthy()
    fireEvent.click(screen.getByText('Expenses', { selector: 'button' })); expect(screen.getByText('Vatican')).toBeTruthy()
  })
  it('a person link still opens the personal balance page', async () => {
    rpc.mockResolvedValue({ data: { ...trip, scope: 'person', linked: ['t2'], expenses: trip.expenses.map(e => ({ ...e, receipts: undefined })) }, error: null })
    mount(); expect(await screen.findByText('YOU OWE')).toBeTruthy()
  })
})
