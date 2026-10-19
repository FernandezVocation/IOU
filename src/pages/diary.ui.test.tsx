// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { tables, writes } = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, writes: [] as Array<{ t: string; op: string; row: unknown }> }))
vi.mock('../lib/supabase', () => {
  const q = (table: string): any => {
    const res = () => Promise.resolve({ data: tables[table] ?? [], error: null })
    const one = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null })
    const o: any = {
      select: () => o, order: () => o, in: () => o, eq: () => o,
      maybeSingle: one, single: () => Promise.resolve({ data: { id: 'new1' }, error: null }),
      insert: (row: unknown) => { writes.push({ t: table, op: 'insert', row }); return o },
      update: (row: unknown) => { writes.push({ t: table, op: 'update', row }); return o },
      delete: () => { writes.push({ t: table, op: 'delete', row: null }); return o },
      then: (a: any, b: any) => res().then(a, b),
    }
    return o
  }
  return { supabase: { from: (t: string) => q(t), storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), upload: async () => ({ error: null }), remove: async () => ({}) }) } }, configured: true, supabaseUrl: 'x', supabaseKey: 'y' }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Ann', signOut: () => {} }) }))

import DiaryPage from './DiaryPage'
import DiaryEditor from './DiaryEditor'
import DiaryEntryPage from './DiaryEntryPage'
import { ToastProvider } from '../components/ui'

beforeEach(() => { writes.length = 0; for (const k of Object.keys(tables)) delete tables[k] })
afterEach(cleanup)

const entry = (o: Record<string, unknown> = {}) => ({ id: 'd1', itinerary_id: null, title: 'Day one', description: 'It rained.', place: 'Venice', entry_on: '2026-05-01', entry_at: null, people: ['Ann'], notes: '', shared: false, created_by: 'u1', created_at: '', ...o })
const wrap = (path: string, el: JSX.Element, route: string) => render(<ToastProvider><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /><Route path="*" element={<div>elsewhere</div>} /></Routes></MemoryRouter></ToastProvider>)

describe('diary', () => {
  it('lists entries marked Only me, with a way to write one', async () => {
    tables.diary_entries = [entry()]
    wrap('/diary', <DiaryPage />, '/diary')
    expect(await screen.findByText('Day one')).toBeTruthy()
    expect(screen.getByText('Only me')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Write an entry' })).toBeTruthy()
  })
  it('shows an entry and offers Edit to its author only', async () => {
    tables.diary_entries = [entry()]
    wrap('/diary/d1', <DiaryEntryPage />, '/diary/:id')
    expect(await screen.findByText('It rained.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
    cleanup()
    tables.diary_entries = [entry({ created_by: 'other', shared: true })]
    wrap('/diary/d1', <DiaryEntryPage />, '/diary/:id')
    await screen.findByText('It rained.')
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })
  it('requires a title, then saves private by default', async () => {
    wrap('/diary/new', <DiaryEditor />, '/diary/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('Give the entry a title.')).toBeTruthy()
    expect(writes).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Gondola' } })
    fireEvent.change(screen.getByLabelText('People'), { target: { value: 'Ann, Ed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }))
    await waitFor(() => expect(writes.some(w => w.t === 'diary_entries' && w.op === 'insert')).toBe(true))
    const row = writes.find(w => w.op === 'insert')!.row as Record<string, unknown>
    expect(row).toMatchObject({ title: 'Gondola', shared: false, itinerary_id: null, people: ['Ann', 'Ed'], created_by: 'u1' })
  })
  it('offers sharing only once a trip is chosen', async () => {
    tables.itineraries = [{ id: 'i1', name: 'Italy' }]
    wrap('/diary/new', <DiaryEditor />, '/diary/new')
    await screen.findByRole('option', { name: 'Italy' })
    expect(screen.queryByLabelText(/Share this entry/)).toBeNull()
    fireEvent.change(screen.getByLabelText('Trip'), { target: { value: 'i1' } })
    expect(screen.getByLabelText(/Share this entry/)).toBeTruthy()
  })
})
