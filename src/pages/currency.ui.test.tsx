// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const h = vi.hoisted(() => ({ calls: [] as Array<{ table: string; op: string; arg: unknown; eq: unknown[] }> }))
const calls = h.calls
vi.mock('../lib/supabase', () => {
  const calls = h.calls
  const from = (table: string) => ({
    update: (arg: unknown) => ({ eq: async (...eq: unknown[]) => { calls.push({ table, op: 'update', arg, eq }); return { error: null } } }),
    upsert: async (arg: unknown) => { calls.push({ table, op: 'upsert', arg, eq: [] }); return { error: null } },
    insert: async (arg: unknown) => { calls.push({ table, op: 'insert', arg, eq: [] }); return { error: null } },
    delete: () => ({ eq: async () => ({ error: null }) }),
    select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }), order: async () => ({ data: [], error: null }) }),
  })
  return { configured: true, supabaseUrl: 'http://x', supabaseKey: 'k', supabase: { rpc: async () => ({ data: null, error: null }), from } }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Alex' }) }))
import TripTab from './TripTab'
import { GroupContext } from './GroupShell'
import { ToastProvider } from '../components/ui'
import type { GroupData } from '../lib/types'

const trav = (id: string, name: string, user_id: string | null = null, statement_currency: string | null = null) => ({ id, group_id: 'g', name, color: '#2B44FF', user_id, sort_order: 0, statement_currency })
const data = (o: Partial<GroupData> = {}): GroupData => ({
  group: { id: 'g', name: 'Venice', currency: 'CAD', invite_code: 'abc', created_by: 'u1', created_at: '', kind: 'Trip' },
  members: [{ user_id: 'u1', role: 'owner', joined_at: '', display_name: 'Ann' }],
  travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo')], expenses: [], payments: [], rates: {},
  me: trav('a', 'Ann', 'u1'), isOwner: true, isPrimaryOwner: true, canEdit: true, ...o,
})
const mount = (d: GroupData) => render(<ToastProvider><GroupContext.Provider value={{ data: d, reload: async () => {} }}><MemoryRouter><TripTab /></MemoryRouter></GroupContext.Provider></ToastProvider>)
beforeEach(() => { calls.length = 0 }); afterEach(cleanup)

describe('currency settings in Group settings', () => {
  it('a local group shows no per-person card currency', () => {
    mount(data())
    expect(screen.queryByLabelText(/Statement currency for/)).toBeNull()
    expect((screen.getByLabelText('Spending currency') as HTMLSelectElement).value).toBe('CAD')
  })
  it('choosing a spending currency saves it, and "same as settle" clears it', async () => {
    mount(data())
    fireEvent.change(screen.getByLabelText('Spending currency'), { target: { value: 'EUR' } })
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ table: 'groups', op: 'update', arg: { spending_currency: 'EUR' }, eq: ['id', 'g'] }))
    cleanup()
    mount(data({ group: { ...data().group, spending_currency: 'EUR' } }))
    fireEvent.change(screen.getByLabelText('Spending currency'), { target: { value: 'CAD' } })
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ arg: { spending_currency: null } }))
  })
  it('once the group spends in another currency, each person gets a card currency and the rate table lists it', async () => {
    mount(data({ group: { ...data().group, spending_currency: 'EUR' }, travelers: [trav('a', 'Ann', 'u1'), trav('b', 'Bo', null, 'QAR')] }))
    expect((screen.getByLabelText('Statement currency for Bo') as HTMLSelectElement).value).toBe('QAR')
    expect(screen.getByLabelText('Rate for EUR')).toBeTruthy()
    expect(screen.getByLabelText('Rate for QAR')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Statement currency for Ann'), { target: { value: 'USD' } })
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ table: 'travelers', arg: { statement_currency: 'USD' }, eq: ['id', 'a'] }))
    fireEvent.change(screen.getByLabelText('Statement currency for Bo'), { target: { value: 'CAD' } })
    await waitFor(() => expect(calls.at(-1)).toMatchObject({ arg: { statement_currency: null }, eq: ['id', 'b'] }))
  })
  it('offers the average real rate from settled statement amounts', () => {
    const e = { id: 'e', group_id: 'g', spent_on: '2026-10-01', spent_at: null, vendor: '', location: '', category: '', notes: '', amount: 100, currency: 'EUR', settled_amount: 222, charged_amount: 600, charged_currency: 'QAR', payer_id: 'b', split_mode: 'equal' as const, created_at: '', updated_at: '', receipts: [], splits: [{ traveler_id: 'a', value: 1 }] }
    mount(data({ expenses: [e], rates: { EUR: 1.5, QAR: 0.3 } }))
    expect(screen.getByText(/Average of 1 settled: 0.3700/)).toBeTruthy()   // 222 / 600 for QAR
    expect(screen.getByText(/Average of 1 settled: 2.2200/)).toBeTruthy()   // 222 / 100 for EUR
  })
})
