// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/supabase', () => ({ configured: true, supabase: { from: () => ({}), rpc: async () => ({ data: null, error: null }) } }))
import ExpensesTab from './ExpensesTab'
import { GroupContext } from './GroupShell'
import type { Expense, GroupData } from '../lib/types'

const T = (id: string, name: string) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id: null, sort_order: 0 })
let n = 0
const E = (o: Partial<Expense>): Expense => ({ id: 'e' + ++n, group_id: 'g', spent_on: '2026-10-05', spent_at: null, vendor: 'v', location: '', category: '', notes: '', amount: 100, currency: 'CAD', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '2026-10-05', updated_at: '', receipts: [], splits: [{ traveler_id: 'a', value: 1 }], ...o } as Expense)
const data = {
  group: { id: 'g', name: 'Italy', currency: 'CAD', invite_code: '', created_by: null, created_at: '' }, members: [], travelers: [T('a', 'Ann'), T('b', 'Bo')],
  expenses: [E({ vendor: 'Pizza' }), E({ vendor: 'Gondola', currency: 'EUR', settled_amount: 150, payer_id: 'b' }), E({ vendor: 'Mystery', currency: 'JPY' })],
  payments: [], rates: {}, me: null, isOwner: true,
} as unknown as GroupData
const mount = () => render(<MemoryRouter><GroupContext.Provider value={{ data, reload: async () => {} }}><ExpensesTab /></GroupContext.Provider></MemoryRouter>)
afterEach(cleanup)

describe('filters on the expense list', () => {
  it('are hidden until asked for, and show how many are on', () => {
    mount()
    expect(screen.queryByRole('group', { name: 'Amount' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Amount' })).getByRole('button', { name: 'No rate set' }))
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeTruthy()
    expect(screen.getByText('Mystery')).toBeTruthy()
    expect(screen.queryByText('Pizza')).toBeNull()
    expect(screen.getByText(/No rate set · 1 of 3/)).toBeTruthy()
  })
  it('filter by who paid, and clear brings everything back', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Paid by' })).getByRole('button', { name: 'Bo' }))
    expect(screen.getByText('Gondola')).toBeTruthy()
    expect(screen.queryByText('Pizza')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByText('Pizza')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
  })
  it('start empty on every visit', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Amount' })).getByRole('button', { name: 'Estimated' }))
    cleanup()
    mount()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    expect(screen.getByText('Pizza')).toBeTruthy()
  })
  it('keeps the existing Needs amount chip', () => {
    mount()
    expect(screen.getByRole('button', { name: /Needs CAD amount \(1\)/ })).toBeTruthy()
  })
})
