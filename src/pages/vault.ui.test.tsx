// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { calls } = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../lib/supabase', () => {
  const chain: any = new Proxy({}, { get: (_t, p: string) => {
    if (p === 'then') return undefined
    return (...a: unknown[]) => { calls.push(p + ':' + JSON.stringify(a)); return p === 'createSignedUrls' ? Promise.resolve({ data: [{ path: 'v/i1/qr.png', signedUrl: 'https://signed/qr.png' }] }) : chain }
  } })
  return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), storage: { from: () => chain } }, configured: true, supabaseUrl: 'x', supabaseKey: 'y' }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Ann', signOut: () => {} }) }))

import { VaultContext } from './VaultShell'
import VaultHome from './VaultHome'
import VaultItemPage from './VaultItemPage'
import VaultItemEditor from './VaultItemEditor'
import { ToastProvider } from '../components/ui'
import type { VaultData } from '../lib/useVault'
import type { VaultItem } from '../lib/vault'

afterEach(cleanup)

const item = (o: Partial<VaultItem>): VaultItem => ({
  id: 'i1', vault_id: 'v', type: 'ticket', title: 'Italo', description: 'Venice to Florence', starts_on: '2026-10-10', starts_at: '09:10:00', ends_on: null, ends_at: null,
  place: 'Florence', address: 'Piazza della Stazione', website: 'italotreno.it', notes: '', private: false, created_by: 'u2',
  files: [{ id: 'f1', item_id: 'i1', path: 'v/i1/qr.png', name: 'qr.png', mime: 'image/png', label: 'Adult 1' }], ...o,
})
const data = (items: VaultItem[], o: Partial<VaultData> = {}): VaultData => ({
  vault: { id: 'v', name: 'Italy 2026', icon: null, color: null, group_id: 'g1', invite_code: 'abc', created_at: '' },
  items, people: [{ user_id: 'u1', role: 'owner', name: 'Ann' }, { user_id: 'u2', role: 'member', name: 'Ed' }],
  myRole: 'member', userId: 'u1', isAdmin: false, isOwner: false, canChange: i => i.created_by === 'u1', ...o,
})
function mount(d: VaultData, at: string) {
  return render(<ToastProvider><MemoryRouter initialEntries={[at]}><VaultContext.Provider value={{ data: d, reload: async () => {} }}>
    <Routes><Route path="/vault/:id" element={<VaultHome />} /><Route path="/vault/:id/item/new" element={<VaultItemEditor />} /><Route path="/vault/:id/item/:iid" element={<VaultItemPage />} /><Route path="/vault/:id/item/:iid/edit" element={<VaultItemEditor />} /></Routes>
  </VaultContext.Provider></MemoryRouter></ToastProvider>)
}

describe('vault list', () => {
  const items = [item({}), item({ id: 'i2', title: 'Hotel Roma', type: 'stay', starts_on: '2026-10-10', starts_at: '14:00:00', place: 'Rome', files: [] }), item({ id: 'i3', title: 'Passport', type: 'document', starts_on: null, starts_at: null, place: '', address: '', files: [] })]
  it('groups by day with the time shown, and an undated section', () => {
    mount(data(items), '/vault/v')
    expect(screen.getAllByText(/Venice to Florence/).length).toBeGreaterThan(0)
    expect(screen.getByRole('region', { name: /Oct 10/ })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'No date' })).toBeTruthy()
    expect(screen.getByText(/9:10/)).toBeTruthy()
  })
  it('switches to places and to types, and filters by type', () => {
    mount(data(items), '/vault/v')
    fireEvent.click(screen.getByRole('button', { name: 'Places' }))
    expect(screen.getByRole('region', { name: 'Florence' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'No place' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Type' }))
    expect(screen.getByRole('region', { name: 'Stays' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(screen.queryByText('Hotel Roma')).toBeNull()
    expect(screen.getByText('Passport')).toBeTruthy()
  })
  it('offers Directions on rows that have a place, and only owners and co-admins get Share', () => {
    mount(data(items), '/vault/v')
    expect((screen.getByLabelText('Directions to Italo') as HTMLAnchorElement).href).toContain('google.com/maps/dir')
    expect(screen.queryByLabelText('Directions to Passport')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Read-only links' })).toBeNull()
    cleanup()
    mount(data(items, { isAdmin: true, myRole: 'admin' }), '/vault/v')
    expect(screen.getByRole('button', { name: 'Read-only links' })).toBeTruthy()
  })
  it('shows a way back to the linked group', () => {
    mount(data(items), '/vault/v')
    expect((screen.getByText('Group') as HTMLAnchorElement).getAttribute('href')).toBe('/g/g1')
  })
})

describe('vault item', () => {
  it('shows Map, Directions, Website, the local time, and full-screen once files load', async () => {
    mount(data([item({})]), '/vault/v/item/i1')
    expect(screen.getByRole('link', { name: 'Map' })).toBeTruthy()
    expect((screen.getByRole('link', { name: 'Directions' }) as HTMLAnchorElement).href).toContain('destination=')
    expect((screen.getByRole('link', { name: 'Website' }) as HTMLAnchorElement).href).toBe('https://italotreno.it/')
    expect(screen.getByText(/local time at the place/)).toBeTruthy()
    const btn = await screen.findByRole('button', { name: /full screen/ })
    fireEvent.click(btn)
    const dlg = screen.getByRole('dialog', { name: /full screen/ })
    expect(within(dlg).getByRole('img').getAttribute('src')).toBe('https://signed/qr.png')
    fireEvent.click(within(dlg).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('offers Add as expense for a linked group, prefilled, but not for a private item', () => {
    mount(data([item({})]), '/vault/v/item/i1')
    const a = screen.getByRole('link', { name: 'Add as expense' }) as HTMLAnchorElement
    expect(a.getAttribute('href')).toContain('/g/g1/expense/new?')
    expect(a.getAttribute('href')).toContain('vendor=Italo')
    expect(a.getAttribute('href')).toContain('description=Venice+to+Florence')
    cleanup()
    mount(data([item({ private: true, created_by: 'u1' })]), '/vault/v/item/i1')
    expect(screen.queryByRole('link', { name: 'Add as expense' })).toBeNull()
  })
  it('only shows Edit and Remove to the person who added it, or an admin', () => {
    mount(data([item({})]), '/vault/v/item/i1')
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove from the vault/ })).toBeNull()
    cleanup()
    mount(data([item({})], { isAdmin: true, myRole: 'admin', canChange: () => true }), '/vault/v/item/i1')
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remove from the vault/ })).toBeTruthy()
  })
})

describe('vault item editor', () => {
  it('has a Description field, saved with the item', () => {
    mount(data([]), '/vault/v/item/new')
    expect(screen.getByLabelText('Description')).toBeTruthy()
  })
  it('opens a blank form at /item/new (not "Item not found")', () => {
    mount(data([]), '/vault/v/item/new')
    expect(screen.queryByText('Item not found')).toBeNull()
    expect(screen.getByLabelText(/Title/i)).toBeTruthy()
  })
  it('edits an existing item, and says not found for an unknown one', () => {
    mount(data([item({ created_by: 'u1' })], {}), '/vault/v/item/i1/edit')
    expect((screen.getByLabelText(/Title/i) as HTMLInputElement).value).toBe('Italo')
    cleanup()
    mount(data([]), '/vault/v/item/zzz/edit')
    expect(screen.getByText('Item not found')).toBeTruthy()
  })
})
