// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const rpc = vi.fn()
vi.mock('../lib/supabase', () => ({ configured: true, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
import SharedPage from './SharedPage'
import type { SharedTrip } from '../lib/shared'

const trip: SharedTrip = {
  label: 'Bo', group: { name: 'Lisbon', currency: 'CAD' }, linked: ['b'],
  travelers: [{ id: 'a', name: 'Ann', color: '#2B44FF' }, { id: 'b', name: 'Bo', color: '#0E7C61' }, { id: 'c', name: 'Cy', color: '#C23B22' }],
  expenses: [
    { id: 'e1', spent_on: '2026-09-12', spent_at: null, vendor: 'Hotel', location: '', category: '', amount: 400, currency: 'EUR', settled_amount: 600, payer_id: 'a', split_mode: 'equal', splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }, { traveler_id: 'c', value: 1 }] },
    { id: 'e2', spent_on: '2026-09-13', spent_at: null, vendor: 'Taxi', location: '', category: '', amount: 20, currency: 'EUR', settled_amount: null, payer_id: 'a', split_mode: 'equal', splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }] },
  ],
  payments: [], rates: { EUR: 1.5 }, generated_at: '',
}
const mount = (token = 'a'.repeat(48)) => render(<MemoryRouter initialEntries={['/b/' + token]}><Routes><Route path="/b/:token" element={<SharedPage />} /></Routes></MemoryRouter>)
beforeEach(() => rpc.mockReset()); afterEach(cleanup)

describe('shared balance page', () => {
  it('shows what the linked person owes, item by item, and how to pay', async () => {
    rpc.mockResolvedValue({ data: trip, error: null })
    mount()
    await screen.findByText('YOU OWE')
    // Hotel share 200.00 + Taxi est. 15.00 = 215.00 ; paid nothing
    expect(screen.getAllByText(/CAD 215\.00/).length).toBeGreaterThan(0)
    expect(screen.getByText('Pay Ann')).toBeTruthy()
    expect(screen.getByText('Hotel')).toBeTruthy()
    expect(screen.getByText(/Includes 1 estimated amount/)).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('get_shared_trip', { p_token: 'a'.repeat(48) })
  })
  it('can leave out estimated amounts', async () => {
    rpc.mockResolvedValue({ data: trip, error: null })
    mount()
    await screen.findByText('YOU OWE')
    fireEvent.click(screen.getByLabelText('Include estimated amounts'))
    await waitFor(() => expect(screen.getAllByText(/CAD 200\.00/).length).toBeGreaterThan(0))
    expect(screen.queryByText(/Includes 1 estimated/)).toBeNull()
  })
  it('shows a credit when the person is owed money', async () => {
    rpc.mockResolvedValue({ data: { ...trip, linked: ['a'] }, error: null })
    mount()
    await screen.findByText('YOU ARE OWED')
    expect(screen.getByText('Who will pay you')).toBeTruthy()
  })
  it('says the link is unavailable (without saying why) for invalid, expired or turned-off links', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    mount('f'.repeat(48))
    await screen.findByText('Link not available')
    expect(screen.queryByText('Lisbon')).toBeNull()
  })
  it('offers a retry when the network fails, and only ever reads (no writes)', async () => {
    rpc.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValue({ data: trip, error: null })
    mount()
    await screen.findByText('Couldn’t load')
    fireEvent.click(screen.getByText('Try again'))
    await screen.findByText('YOU OWE')
    expect(rpc.mock.calls.every(c => c[0] === 'get_shared_trip')).toBe(true)
  })
  it('has no edit controls', async () => {
    rpc.mockResolvedValue({ data: trip, error: null })
    mount()
    await screen.findByText('YOU OWE')
    expect(screen.queryByText(/Save|Delete|Add expense|Record payment/)).toBeNull()
  })
})
