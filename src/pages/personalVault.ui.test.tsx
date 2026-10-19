// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { tables, rpcs } = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, rpcs: [] as string[] }))
vi.mock('../lib/supabase', () => {
  const q = (table: string): any => {
    const res = () => Promise.resolve({ data: tables[table] ?? [], error: null })
    const o: any = { select: () => o, order: () => o, in: () => o, not: () => o, eq: () => o, then: (a: any, b: any) => res().then(a, b) }
    return o
  }
  return { supabase: { from: (t: string) => q(t), rpc: (n: string) => { rpcs.push(n); return Promise.resolve({ data: 'newvault', error: null }) }, storage: { from: () => ({}) } }, configured: true, supabaseUrl: 'x', supabaseKey: 'y' }
})
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Ann', signOut: () => {} }) }))

import VaultsPage from './VaultsPage'
import VaultSettings from '../components/VaultSettings'
import VaultItemEditor from './VaultItemEditor'
import { VaultContext } from './VaultShell'
import { ToastProvider } from '../components/ui'
import type { VaultData } from '../lib/useVault'

beforeEach(() => { try { localStorage.clear() } catch { /* ignore */ } rpcs.length = 0; for (const k of Object.keys(tables)) delete tables[k] })
afterEach(cleanup)

const vault = (o: Record<string, unknown>) => ({ id: 'v1', name: 'Italy docs', icon: null, color: null, group_id: null, created_at: '', personal: false, ...o })
const mountList = () => render(<ToastProvider><MemoryRouter initialEntries={['/vaults']}><Routes><Route path="/vaults" element={<VaultsPage />} /><Route path="/vault/:id" element={<div>vault page</div>} /></Routes></MemoryRouter></ToastProvider>)

describe('Vaults page: Group, Private, Both', () => {
  it('shows My vault and the group vaults together by default, and filters', async () => {
    tables.vaults = [vault({}), vault({ id: 'p1', name: 'My vault', personal: true })]
    mountList()
    expect(await screen.findByText('Italy docs')).toBeTruthy()
    expect(screen.getByText('My vault')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.queryByText('My vault')).toBeNull()
    expect(screen.getByText('Italy docs')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Private' }))
    expect(screen.queryByText('Italy docs')).toBeNull()
    expect(screen.getByText('My vault')).toBeTruthy()
  })
  it('creates My vault only when it is first opened', async () => {
    tables.vaults = [vault({})]
    mountList()
    await screen.findByText('Italy docs')
    expect(rpcs).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /Open My vault/ }))
    await waitFor(() => expect(screen.getByText('vault page')).toBeTruthy())
    expect(rpcs).toEqual(['get_or_create_personal_vault'])
  })
})

const data = (personal: boolean): VaultData => ({
  vault: { id: 'v1', name: personal ? 'My vault' : 'Italy docs', icon: null, color: null, group_id: null, invite_code: 'abc', created_at: '', personal },
  items: [], people: [{ user_id: 'u1', role: 'owner', name: 'Ann' }], myRole: 'owner', userId: 'u1', isAdmin: true, isOwner: true, canChange: () => true,
})
const withVault = (d: VaultData, ui: JSX.Element, at = '/') => render(<ToastProvider><MemoryRouter initialEntries={[at]}><VaultContext.Provider value={{ data: d, reload: async () => {} }}><Routes><Route path="/" element={ui} /><Route path="/vault/:id/item/new" element={ui} /></Routes></VaultContext.Provider></MemoryRouter></ToastProvider>)

describe('a personal vault', () => {
  it('has no people list, invite link or group link in its settings', () => {
    withVault(data(true), <VaultSettings onClose={() => {}} />)
    expect(screen.getByText(/Only you can see it/)).toBeTruthy()
    expect(screen.queryByLabelText('Invite link')).toBeNull()
    expect(screen.queryByText('Group')).toBeNull()
  })
  it('keeps them in an ordinary vault', () => {
    withVault(data(false), <VaultSettings onClose={() => {}} />)
    expect(screen.getByLabelText('Invite link')).toBeTruthy()
  })
  it('asks nothing about who can see an item', () => {
    withVault(data(true), <VaultItemEditor />, '/vault/v1/item/new')
    expect(screen.queryByText('Who can see it?')).toBeNull()
    cleanup()
    withVault(data(false), <VaultItemEditor />, '/vault/v1/item/new')
    expect(screen.getByText('Who can see it?')).toBeTruthy()
  })
})
