// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const { rows } = vi.hoisted(() => ({ rows: [] as unknown[] }))
vi.mock('../lib/supabase', () => {
  const o: any = { select: () => o, eq: () => o, order: () => o, then: (a: any, b: any) => Promise.resolve({ data: rows, error: null }).then(a, b) }
  return { supabase: { from: () => o }, configured: true, supabaseUrl: 'x', supabaseKey: 'y' }
})
import AddExpenseToItinerary from './AddExpenseToItinerary'
import { ToastProvider } from './ui'
import type { Expense } from '../lib/types'

afterEach(() => { cleanup(); rows.length = 0 })
const exp = { id: 'e1', vendor: 'Italo', description: 'Train 9405', spent_on: '2026-10-10', spent_at: '09:30:00', category: 'Transportation', subcategory: 'Train', location: 'Venice', notes: '', booking_ref: 'XK92LM' } as unknown as Expense
const Where = () => { const l = useLocation(); return <div data-testid="at">{l.pathname + l.search}</div> }
const mount = () => render(<ToastProvider><MemoryRouter><Routes><Route path="/" element={<AddExpenseToItinerary expense={exp} groupId="g1" onClose={() => {}} />} /><Route path="*" element={<Where />} /></Routes></MemoryRouter></ToastProvider>)

describe('Add an expense to an itinerary', () => {
  it('explains when no itinerary is linked to the group', async () => {
    mount()
    expect(await screen.findByText('No itinerary linked to this group')).toBeTruthy()
  })
  it('opens the item form filled in from the expense, carrying the expense id so it gets linked', async () => {
    rows.push({ id: 'it1', name: 'Italy 2026' })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    const at = (await screen.findByTestId('at')).textContent!
    expect(at.startsWith('/itinerary/it1/item/new?')).toBe(true)
    const q = new URLSearchParams(at.split('?')[1])
    expect(Object.fromEntries(q)).toMatchObject({ expense: 'e1', category: 'transport', subtype: 'Train', title: 'Italo', description: 'Train 9405', ref: 'XK92LM', date: '2026-10-10', time: '09:30', place: 'Venice' })
  })
})
