// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { tables, writes, rpcs } = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, writes: [] as Array<{ t: string; op: string; row: unknown }>, rpcs: [] as Array<{ fn: string; args: Record<string, unknown> }> }))
vi.mock('../lib/supabase', () => {
  const q = (table: string): any => {
    const res = () => Promise.resolve({ data: tables[table] ?? [], error: null })
    const o: any = {
      select: () => o, order: () => o, in: () => o, eq: () => o, limit: () => o,
      maybeSingle: () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: { id: 'new1' }, error: null }),
      insert: (row: unknown) => { writes.push({ t: table, op: 'insert', row }); return o },
      update: (row: unknown) => { writes.push({ t: table, op: 'update', row }); return o },
      delete: () => { writes.push({ t: table, op: 'delete', row: null }); return o },
      then: (a: any, b: any) => res().then(a, b),
    }
    return o
  }
  const rpc = (fn: string, args: Record<string, unknown>) => {
    rpcs.push({ fn, args })
    return Promise.resolve({ data: fn === 'checklist_people' ? tables.people ?? [] : null, error: null })
  }
  return { supabase: { from: (t: string) => q(t), rpc }, configured: true, supabaseUrl: 'x', supabaseKey: 'y' }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Ann', signOut: () => {} }) }))

import ChecklistPage from './ChecklistPage'
import ChecklistsPage from './ChecklistsPage'
import { ToastProvider } from '../components/ui'

beforeEach(() => { writes.length = 0; rpcs.length = 0; for (const k of Object.keys(tables)) delete tables[k]; try { localStorage.clear() } catch { /* */ } })
afterEach(cleanup)

const list = (o = {}) => ({ id: 'c1', name: 'Packing', icon: null, color: null, default_type: 'packing', default_label: '', group_id: null, invite_code: 'abc', created_by: 'u1', created_at: '', ...o })
const item = (o: Record<string, unknown> = {}) => ({
  id: 'i1', checklist_id: 'c1', type: 'todo', type_label: '', type_icon: '', title: 'Passport', notes: '', status: 'todo', due_on: null, assigned_name: '', assigned_user: null,
  completed_by_name: '', completed_by_user: null, completed_at: null, est_amount: null, est_currency: null, qty: 1, packed_in: '', booking_ref: '', expense_id: null,
  itinerary_item_id: null, vault_item_id: null, created_by: 'u1', created_at: '2026-10-01T00:00:00Z', ...o,
})
const wrap = (path: string, el: JSX.Element, route: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /><Route path="*" element={<div>elsewhere</div>} /></Routes></MemoryRouter></ToastProvider>)
const setup = () => { tables.checklists = [list()]; tables.people = [{ user_id: 'u1', role: 'owner', name: 'Ann' }] }

describe('checklist page', () => {
  it('shows the progress and each item with its type', async () => {
    setup()
    tables.checklist_items = [item(), item({ id: 'i2', title: 'Taxi', type: 'booking', status: 'completed' }), item({ id: 'i3', title: 'Gift', type: 'custom', type_label: 'Present' })]
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    expect(await screen.findByText('Passport')).toBeTruthy()
    expect(screen.getByText('1 of 3 done')).toBeTruthy()
    expect(screen.getByText('To book')).toBeTruthy()
    expect(screen.getByText('Present')).toBeTruthy()
  })
  it('quick-adds an item using the list’s starting type', async () => {
    setup()
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    fireEvent.change(await screen.findByLabelText('Add an item'), { target: { value: 'Socks' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(writes.some(w => w.t === 'checklist_items' && w.op === 'insert')).toBe(true))
    expect(writes.find(w => w.op === 'insert')!.row).toMatchObject({ title: 'Socks', type: 'packing', checklist_id: 'c1', created_by: 'u1' })
  })
  it('ticking an item completes it and names me as the person who did it', async () => {
    setup()
    tables.checklist_items = [item()]
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    fireEvent.click(await screen.findByRole('button', { name: 'Mark Passport completed' }))
    await waitFor(() => expect(rpcs.some(r => r.fn === 'set_checklist_item_progress')).toBe(true))
    expect(rpcs.find(r => r.fn === 'set_checklist_item_progress')!.args).toMatchObject({ p_item: 'i1', p_status: 'completed', p_completed_by_user: 'u1' })
  })
  it('filters by type', async () => {
    setup()
    tables.checklist_items = [item(), item({ id: 'i2', title: 'Adapter', type: 'purchase' })]
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    await screen.findByText('Passport')
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter by type' })).getByRole('button', { name: 'Purchase' }))
    expect(screen.queryByText('Passport')).toBeNull()
    expect(screen.getByText('Adapter')).toBeTruthy()
  })
  it('lets someone who did not add an item change its status but not its title', async () => {
    setup()
    tables.people = [{ user_id: 'u1', role: 'member', name: 'Ann' }]
    tables.checklist_items = [item({ created_by: 'someone-else' })]
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    fireEvent.click(await screen.findByRole('button', { name: 'Open Passport' }))
    expect((await screen.findByLabelText('Title')).matches(':disabled')).toBe(true)
    expect(screen.getByLabelText('Status').matches(':disabled')).toBe(false)
  })
  it('asks for a name when the type is custom', async () => {
    setup()
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Visa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(await screen.findByText('Name your custom type.')).toBeTruthy()
    expect(writes).toHaveLength(0)
  })
})

describe('custom icon and export', () => {
  it('saves the chosen icon with a custom item', async () => {
    setup()
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('Name of this type'), { target: { value: 'Gift' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gift' }))   // the icon named Gift
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Mug' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    await waitFor(() => expect(writes.some(w => w.op === 'insert')).toBe(true))
    expect(writes.find(w => w.op === 'insert')!.row).toMatchObject({ type: 'custom', type_label: 'Gift', type_icon: 'gift', title: 'Mug' })
  })
  it('the export sheet counts what the choices will include', async () => {
    setup()
    tables.checklist_items = [item(), item({ id: 'i2', title: 'Adapter', type: 'purchase' })]
    wrap('/checklist/c1', <ChecklistPage />, '/checklist/:id')
    fireEvent.click(await screen.findByRole('button', { name: 'Export' }))
    expect(await screen.findByText('2 of 2 items will be exported.')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Export' })).getByRole('button', { name: /Purchase/ }))
    expect(await screen.findByText('1 of 2 items will be exported.')).toBeTruthy()
  })
})

describe('checklists home', () => {
  it('shows lists with counts, and all items across lists', async () => {
    tables.checklists = [list(), list({ id: 'c2', name: 'Chores' })]
    tables.checklist_items = [item(), item({ id: 'i2', checklist_id: 'c2', title: 'Mop', status: 'completed' })]
    wrap('/checklists', <ChecklistsPage />, '/checklists')
    expect(await screen.findByText('Chores')).toBeTruthy()
    expect(screen.getByText('1/1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All items' }))
    expect(await screen.findByText('Passport')).toBeTruthy()
    expect(screen.queryByText('Mop')).toBeNull()   // completed items are hidden by the default "not done" filter
  })
})
