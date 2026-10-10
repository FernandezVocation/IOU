// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'id', error: null }))
vi.mock('../lib/supabase', () => ({
  configured: true,
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ insert: async () => ({ error: null }), delete: () => ({ in: async () => ({ error: null }), eq: async () => ({ error: null }) }) }),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), upload: async () => ({ error: null }), remove: async () => ({}) }) },
  },
}))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Alex' }) }))
import ExpenseEditor from './ExpenseEditor'
import BreakdownTab from './BreakdownTab'
import NewGroupPage from './NewGroupPage'
import { GroupContext } from './GroupShell'
import { ToastProvider } from '../components/ui'
import ThemeToggle from '../components/ThemeToggle'
import type { Expense, GroupData } from '../lib/types'

const trav = (id: string, name: string, user_id: string | null = null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0 })
const E = (id: string, o: Partial<Expense>): Expense => ({
  id, group_id: 'g', spent_on: '2026-10-09', spent_at: '17:53:00', vendor: id, location: '', category: '', subcategory: '', notes: '', amount: 100, currency: 'CAD',
  settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [],
  splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }], ...o,
})
const base: GroupData = {
  group: { id: 'g', name: 'Italy 2026', currency: 'CAD', invite_code: 'x', created_by: 'u1', created_at: '', kind: 'Trip' },
  members: [], isOwner: true, rates: {}, payments: [],
  expenses: [
    E('Dolce', { vendor: 'Dolce Restaurant', amount: 700, category: 'Food', subcategory: 'Dinner' }),
    E('Gondola', { vendor: 'Gondola Serenissima', amount: 120, category: 'Activities', subcategory: 'Segway' }),
    E('Cash', { vendor: 'Cash', amount: 30, spent_on: '2026-10-10', splits: [{ traveler_id: 'b', value: 1 }] }),
  ],
  travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo')],
  me: trav('a', 'Ann', 'u1'),
}

function mountEditor(data: GroupData = base) {
  return render(
    <ToastProvider>
      <GroupContext.Provider value={{ data, reload: async () => {} }}>
        <MemoryRouter initialEntries={['/g/g/expense/new']}>
          <Routes><Route path="/g/:id/expense/:eid" element={<ExpenseEditor />} /><Route path="/g/:id" element={<div>group</div>} /></Routes>
        </MemoryRouter>
      </GroupContext.Provider>
    </ToastProvider>,
  )
}
const payload = () => (rpc.mock.calls.at(-1) as unknown as [string, { p: Record<string, unknown> }])[1].p
async function save() {
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25' } })
  fireEvent.change(screen.getByLabelText('Vendor'), { target: { value: 'Somewhere' } })
  fireEvent.click(screen.getByText('Save'))
  await waitFor(() => expect(rpc).toHaveBeenCalled())
}
const chip = (name: string) => screen.getByRole('button', { name })

beforeEach(() => { rpc.mockClear(); localStorage.clear(); document.documentElement.removeAttribute('data-theme') })
afterEach(cleanup)

describe('picking a category and sub-category', () => {
  it('offers the suggested categories and their sub-categories, and saves both', async () => {
    mountEditor()
    for (const c of ['Food', 'Drinks', 'Grocery', 'Transportation', 'Housing', 'Attractions', 'Activities', 'Entertainment', 'Shopping', 'Souvenirs', 'Fees', 'Fines']) expect(chip(c)).toBeTruthy()
    fireEvent.click(chip('Transportation'))
    for (const s of ['Flights', 'Train', 'Taxi', 'Car rental', 'Gas', 'Boat', 'Transit']) expect(chip(s)).toBeTruthy()
    fireEvent.click(chip('Train'))
    await save()
    expect(payload()).toMatchObject({ category: 'Transportation', subcategory: 'Train' })
  })
  it('puts a gondola ride under Activities', () => {
    mountEditor(); fireEvent.click(chip('Activities')); expect(chip('Gondola ride')).toBeTruthy()
  })
  it('clears the sub-category when the category changes', async () => {
    mountEditor()
    fireEvent.click(chip('Food')); fireEvent.click(chip('Dinner'))
    fireEvent.click(chip('Drinks'))
    await save()
    expect(payload()).toMatchObject({ category: 'Drinks', subcategory: '' })
  })
  it('lets you tap a selected sub-category again to leave it empty', async () => {
    mountEditor(); fireEvent.click(chip('Food')); fireEvent.click(chip('Lunch')); fireEvent.click(chip('Lunch'))
    await save(); expect(payload()).toMatchObject({ category: 'Food', subcategory: '' })
  })
  it('takes any typed custom category and sub-category', async () => {
    mountEditor()
    fireEvent.click(chip('Custom…'))
    fireEvent.change(screen.getByLabelText(/Custom category/), { target: { value: 'Pets' } })
    fireEvent.change(screen.getByLabelText(/^Sub-category/), { target: { value: 'Vet visit' } })
    await save()
    expect(payload()).toMatchObject({ category: 'Pets', subcategory: 'Vet visit' })
  })
  it('takes any typed custom sub-category under a suggested category', async () => {
    mountEditor()
    fireEvent.click(chip('Entertainment'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Custom…' })[1])
    fireEvent.change(screen.getByLabelText('Custom sub-category'), { target: { value: 'Opera' } })
    await save()
    expect(payload()).toMatchObject({ category: 'Entertainment', subcategory: 'Opera' })
  })
  it('offers back custom sub-categories typed earlier in this group', () => {
    mountEditor(); fireEvent.click(chip('Activities')); expect(chip('Segway')).toBeTruthy()
  })
  it('saves no sub-category when there is no category', async () => {
    mountEditor(); await save(); expect(payload()).toMatchObject({ category: '', subcategory: '' })
  })
})

describe('Breakdown tab', () => {
  function mountBreakdown() {
    return render(
      <GroupContext.Provider value={{ data: base, reload: async () => {} }}>
        <MemoryRouter><BreakdownTab /></MemoryRouter>
      </GroupContext.Provider>,
    )
  }
  it('shows every expense, by category first, biggest at the top', () => {
    mountBreakdown()
    expect(screen.getByText('CAD 850.00')).toBeTruthy()
    const names = screen.getAllByRole('button', { expanded: false }).map(b => b.textContent)
    expect(names[0]).toContain('Food'); expect(names[1]).toContain('Activities'); expect(names[2]).toContain('Uncategorized')
  })
  it('opens a row to show its sub-categories and then the expenses', () => {
    mountBreakdown()
    fireEvent.click(screen.getByRole('button', { name: /Food/ }))
    fireEvent.click(screen.getByRole('button', { name: /Dinner/ }))
    expect(screen.getByRole('link', { name: /Dolce Restaurant/ }).getAttribute('href')).toBe('/g/g/expense/Dolce')
  })
  it('regroups by sub-category, date and vendor', () => {
    mountBreakdown()
    fireEvent.click(screen.getByText('Sub-category')); expect(screen.getByText('Segway')).toBeTruthy()
    fireEvent.click(screen.getByText('Date')); expect(screen.getByText('Fri, Oct 9')).toBeTruthy(); expect(screen.getByText('Sat, Oct 10')).toBeTruthy()
    fireEvent.click(screen.getByText('Vendor')); expect(screen.getByText('Gondola Serenissima')).toBeTruthy()
  })
  it('switches to My share and says what it left out', () => {
    mountBreakdown()
    fireEvent.click(screen.getByText('My share'))
    expect(screen.getByText('CAD 410.00')).toBeTruthy()                    // 350 + 60
    expect(screen.getByText(/1 expense doesn’t include you/)).toBeTruthy() // the cash expense is only Bo's
  })
})

describe('group type and theme', () => {
  it('creates a group with a suggested type, or a typed one', async () => {
    render(<ToastProvider><MemoryRouter><NewGroupPage /></MemoryRouter></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Flat 12B' } })
    fireEvent.click(chip('Household'))
    fireEvent.click(screen.getByText('Create group'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls.at(-1)).toEqual(['create_group', expect.objectContaining({ p_name: 'Flat 12B', p_kind: 'Household' })])
    cleanup(); rpc.mockClear()
    render(<ToastProvider><MemoryRouter><NewGroupPage /></MemoryRouter></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Book club' } })
    fireEvent.click(chip('Custom…'))
    fireEvent.change(screen.getByLabelText('Custom group type'), { target: { value: 'Book club night' } })
    fireEvent.click(screen.getByText('Create group'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls.at(-1)).toEqual(['create_group', expect.objectContaining({ p_kind: 'Book club night' })])
  })
  it('defaults the type to Trip', async () => {
    render(<ToastProvider><MemoryRouter><NewGroupPage /></MemoryRouter></ToastProvider>)
    fireEvent.change(screen.getByLabelText('Group name'), { target: { value: 'Lisbon' } })
    fireEvent.click(screen.getByText('Create group'))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(rpc.mock.calls.at(-1)).toEqual(['create_group', expect.objectContaining({ p_kind: 'Trip' })])
  })
  it('theme: Light and Dark override the device, Auto goes back, and the choice is remembered', () => {
    render(<ThemeToggle />)
    const root = document.documentElement
    expect(root.getAttribute('data-theme')).toBeNull()
    fireEvent.click(within(screen.getByRole('group', { name: 'Appearance' })).getByText('Light'))
    expect(root.getAttribute('data-theme')).toBe('light'); expect(localStorage.getItem('iou_theme')).toBe('light')
    fireEvent.click(screen.getByText('Dark')); expect(root.getAttribute('data-theme')).toBe('dark')
    fireEvent.click(screen.getByText('Auto')); expect(root.getAttribute('data-theme')).toBeNull(); expect(localStorage.getItem('iou_theme')).toBeNull()
  })
})
