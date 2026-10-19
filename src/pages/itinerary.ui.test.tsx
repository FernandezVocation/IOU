// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../lib/supabase', () => {
  const chain: any = new Proxy({}, { get: (_t, p: string) => {
    if (p === 'then') return undefined
    return (...a: unknown[]) => { calls.push(p + ':' + JSON.stringify(a)); return p === 'single' ? Promise.resolve({ data: { id: 'new1' }, error: null }) : p === 'order' ? Promise.resolve({ data: [], error: null }) : chain }
  } })
  return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), storage: { from: () => chain } }, configured: true, supabaseUrl: 'x', supabaseKey: 'y' }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Ann', signOut: () => {} }) }))

import { ItineraryContext } from './ItineraryShell'
import ItineraryHome from './ItineraryHome'
import ItineraryItemPage from './ItineraryItemPage'
import ItineraryItemEditor from './ItineraryItemEditor'
import { ToastProvider } from '../components/ui'
import type { ItineraryData } from '../lib/useItinerary'
import type { ItineraryItem } from '../lib/itinerary'

afterEach(() => { cleanup(); calls.length = 0 })

const item = (o: Partial<ItineraryItem>): ItineraryItem => ({
  id: 'i1', itinerary_id: 'it', category: 'transport', category_label: '', subtype: 'Train', title: 'Italo', description: 'Venice to Florence', vendor: 'Italo (NTV)',
  starts_on: '2026-10-10', starts_at: '09:10:00', ends_on: '2026-10-10', ends_at: '11:40:00', place: '', address: '', from_place: 'Venezia Santa Lucia', to_place: 'Firenze SMN',
  website: 'italotreno.it', notes: 'Coach 4 seat 12A', people: ['Ann', 'Ed'], private: false, vault_item_id: null, created_by: 'u2', ...o,
})
const data = (items: ItineraryItem[], o: Partial<ItineraryData> = {}): ItineraryData => ({
  itinerary: { id: 'it', name: 'Italy 2026', icon: null, color: null, group_id: 'g1', vault_id: 'v1', invite_code: 'abc', created_at: '' },
  items, people: [{ user_id: 'u1', role: 'owner', name: 'Ann' }, { user_id: 'u2', role: 'member', name: 'Ed' }], groupNames: ['Nonna'], groupName: 'Italy', vaultName: 'Italy docs', spend: null,
  myRole: 'member', userId: 'u1', isAdmin: false, isOwner: false, canChange: i => i.created_by === 'u1', ...o,
})
function mount(d: ItineraryData, at: string) {
  return render(<ToastProvider><MemoryRouter initialEntries={[at]}><ItineraryContext.Provider value={{ data: d, reload: async () => {} }}>
    <Routes><Route path="/itinerary/:id" element={<ItineraryHome />} /><Route path="/itinerary/:id/item/new" element={<ItineraryItemEditor />} /><Route path="/itinerary/:id/item/:iid" element={<ItineraryItemPage />} /><Route path="/itinerary/:id/item/:iid/edit" element={<ItineraryItemEditor />} /></Routes>
  </ItineraryContext.Provider></MemoryRouter></ToastProvider>)
}

describe('itinerary timeline', () => {
  const items = [item({}), item({ id: 'i2', title: 'Hotel Roma', category: 'stay', subtype: 'Hotel', from_place: '', to_place: '', place: 'Rome', starts_at: '14:00:00', people: ['Ann'] }), item({ id: 'i3', title: 'Packing', category: 'custom', category_label: 'Chores', starts_on: null, starts_at: null, from_place: '', to_place: '', people: [] })]
  it('groups by day with times, and an undated section', () => {
    mount(data(items), '/itinerary/it')
    expect(screen.getByRole('region', { name: /Oct 10/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'No date' })).toBeTruthy()
    expect(screen.getByText(/9:10/)).toBeTruthy()
  })
  it('filters by category and by person, and shows a ticket icon for linked items', () => {
    mount(data([...items, item({ id: 'i4', title: 'Ticketed', vault_item_id: 'vi' })]), '/itinerary/it')
    expect(screen.getAllByLabelText('Has a vault ticket').length).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Stays' }))
    expect(screen.queryByText('Italo')).toBeNull()
    expect(screen.getByText('Hotel Roma')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ed' }))
    expect(screen.queryByText('Hotel Roma')).toBeNull()
    expect(screen.getByText('Italo')).toBeTruthy()
  })
  it('shows the description (a flight or train number) as a highlighted badge', () => {
    mount(data(items), '/itinerary/it')
    const badge = screen.getAllByText('Venice to Florence').find(el => el.className.includes('vdesc'))
    expect(badge).toBeTruthy()
  })
  it('arranges by type and names a custom category', () => {
    mount(data(items), '/itinerary/it')
    fireEvent.click(screen.getByRole('button', { name: 'Type' }))
    expect(screen.getByRole('region', { name: 'Chores' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Stays' })).toBeTruthy()
  })
  it('only the owner or co-admin sees Share', () => {
    mount(data(items), '/itinerary/it')
    expect(screen.queryByRole('button', { name: 'Read-only links' })).toBeNull()
    cleanup()
    mount(data(items, { isAdmin: true, isOwner: true }), '/itinerary/it')
    expect(screen.getByRole('button', { name: 'Read-only links' })).toBeTruthy()
  })
})

describe('item page', () => {
  it('shows vendor, route, people and notes, with a route-based Directions link', () => {
    mount(data([item({})]), '/itinerary/it/item/i1')
    expect(screen.getByText('Italo (NTV)')).toBeTruthy()
    expect(screen.getByText('Coach 4 seat 12A')).toBeTruthy()
    expect(screen.getByText('Ann, Ed')).toBeTruthy()
    const dir = screen.getByRole('link', { name: 'Directions' }) as HTMLAnchorElement
    expect(decodeURIComponent(dir.href)).toContain('origin=Venezia Santa Lucia')
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
  })
  it('lets the author edit and remove', () => {
    mount(data([item({ created_by: 'u1' })]), '/itinerary/it/item/i1')
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remove from the itinerary/ })).toBeTruthy()
  })
})

describe('export sheet', () => {
  it('lets you pick what to export by dates, places or types', () => {
    mount(data([item({}), item({ id: 'i2', title: 'Gelato', category: 'food', subtype: '', from_place: '', to_place: '', place: 'Rome', starts_on: '2026-10-11' })]), '/itinerary/it')
    fireEvent.click(screen.getByRole('button', { name: 'Export the plan' }))
    const which = within(screen.getByRole('group', { name: 'Which items' }))
    fireEvent.click(which.getByRole('button', { name: 'Places' }))
    expect(screen.getByLabelText(/Rome/)).toBeTruthy()
    expect((screen.getByLabelText(/Rome/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(which.getByRole('button', { name: 'Types' }))
    expect(screen.getByLabelText(/Food/)).toBeTruthy()
    fireEvent.click(which.getByRole('button', { name: 'All' }))
    expect(screen.queryByLabelText(/Food/)).toBeNull()
  })
})

describe('amounts', () => {
  const spend = { currency: 'CAD', byItem: { i1: { minor: 12050, estimated: false, count: 1, missing: 0, expenses: [{ id: 'x1', vendor: 'Italo tickets', spent_on: '2026-10-09', amount: 120.5, currency: 'CAD', settled_amount: null, charged_amount: null, charged_currency: null, itinerary_item_id: 'i1' }] } } }
  it('hides the option for people without access to the group’s expenses', () => {
    mount(data([item({})]), '/itinerary/it')
    expect(screen.queryByText(/Show what each item cost/)).toBeNull()
    expect(screen.queryByText('CAD 120.50')).toBeNull()
  })
  it('shows the total on the timeline only once switched on', () => {
    mount(data([item({})], { spend }), '/itinerary/it')
    expect(screen.queryByText('CAD 120.50')).toBeNull()
    fireEvent.click(screen.getByLabelText(/Show what each item cost/))
    expect(screen.getByText('CAD 120.50')).toBeTruthy()
    try { localStorage.removeItem('iou.itinAmounts') } catch { /* ignore */ }
  })
  it('lists the linked expenses on the item page with an Add expense shortcut', () => {
    mount(data([item({})], { spend }), '/itinerary/it/item/i1')
    expect(screen.getByText('Italo tickets')).toBeTruthy()
    const add = screen.getByRole('link', { name: 'Add expense' }) as HTMLAnchorElement
    expect(add.getAttribute('href')).toContain('plan=i1')
  })
})

describe('editor', () => {
  it('opens empty for a new item, and prefilled from a vault item', () => {
    mount(data([]), '/itinerary/it/item/new?from=vi&title=Italo&description=Venice%20to%20Florence&category=transport&date=2026-10-10&time=09:10')
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Italo')
    expect((screen.getByLabelText('Description') as HTMLInputElement).value).toBe('Venice to Florence')
    expect(screen.getByText(/Filled in from the vault item/)).toBeTruthy()
    expect((screen.getByLabelText('From') as HTMLInputElement)).toBeTruthy()
  })
  it('asks for a name when the category is Custom, and saves it with the link', async () => {
    mount(data([]), '/itinerary/it/item/new?from=vi&title=Gift')
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/Type a name for your custom category/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name of your category'), { target: { value: 'Family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(calls.some(c => c.startsWith('insert:') && c.includes('"category_label":"Family"') && c.includes('"vault_item_id":"vi"'))).toBe(true))
  })
  it('offers the itinerary members and the group’s travelers as people', () => {
    mount(data([]), '/itinerary/it/item/new')
    expect(screen.getByRole('button', { name: 'Nonna' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ed' }))
    fireEvent.change(screen.getByLabelText('Add a name'), { target: { value: 'Uncle Joe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('button', { name: 'Uncle Joe' })).toBeTruthy()
  })
  it('blocks someone who did not add the item and is not an admin', () => {
    mount(data([item({})]), '/itinerary/it/item/i1/edit')
    expect(screen.getByRole('alert').textContent).toMatch(/Only the person who added this/)
  })
})
