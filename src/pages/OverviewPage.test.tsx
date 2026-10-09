// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AllGroups } from '../lib/allGroups'
import type { Expense, GroupData, Payment, Traveler } from '../lib/types'

const rpc = vi.fn(async (..._a: unknown[]) => ({ data: [{ status: 'confirmed' }, { status: 'confirmed' }], error: null }))
const fetchAll = vi.fn()
const pdf = vi.fn(async (..._a: unknown[]) => new Blob(['%PDF']))
const save = vi.fn()
vi.mock('../lib/supabase', () => ({ configured: true, supabase: { rpc: (...a: unknown[]) => rpc(...a) } }))
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, displayName: 'Alex' }) }))
vi.mock('../lib/allGroups', () => ({ fetchAllGroups: (...a: unknown[]) => fetchAll(...a) }))
vi.mock('../lib/overviewPdf', () => ({ buildOverviewPdf: (...a: unknown[]) => pdf(...a) }))
vi.mock('../lib/exporters', () => ({ downloadBlob: (...a: unknown[]) => save(...a) }))
import OverviewPage from './OverviewPage'
import { ToastProvider } from '../components/ui'

const T = (id: string, g: string, name: string, user_id: string | null = null): Traveler => ({ id, group_id: g, name, color: '#000', user_id, sort_order: 0 })
const E = (id: string, g: string, o: Partial<Expense> & { split: Record<string, number> }): Expense => ({ id, group_id: g, spent_on: '2026-09-12', spent_at: null, vendor: id, location: '', category: '', notes: '', amount: 0, currency: 'CAD', settled_amount: null, payer_id: 'me', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: Object.entries(o.split).map(([traveler_id, value]) => ({ traveler_id, value })), ...o })
const G = (id: string, name: string, currency: string, created: string, travelers: Traveler[], expenses: Expense[], payments: Payment[], me: string): GroupData => ({ group: { id, name, currency, invite_code: '', created_by: null, created_at: created }, members: [], travelers, expenses, payments, rates: {}, isOwner: true, me: travelers.find(t => t.id === me) ?? null })
const all: AllGroups = { contacts: [], mappings: [], groups: [
  G('L', 'Lisbon', 'CAD', '2026-01-01', [T('L-me', 'L', 'Alex', 'u1'), T('L-jack', 'L', 'Jack'), T('L-sam', 'L', 'Sam')], [E('Hotel', 'L', { amount: 300, payer_id: 'L-me', split: { 'L-me': 1, 'L-jack': 1, 'L-sam': 1 } })], [{ id: 'p', group_id: 'L', from_id: 'L-jack', to_id: 'L-me', amount: 30, paid_on: '2026-09-20', status: 'pending' }], 'L-me'),
  G('B', 'Banff', 'CAD', '2026-03-01', [T('B-me', 'B', 'Alex', 'u1'), T('B-jack', 'B', 'Jack')], [E('Taxi', 'B', { amount: 40, payer_id: 'B-me', split: { 'B-me': 1, 'B-jack': 1 } })], [], 'B-me'),
  G('N', 'NYC', 'USD', '2026-05-01', [T('N-me', 'N', 'Alex', 'u1'), T('N-jack', 'N', 'Jack')], [E('Show', 'N', { amount: 100, currency: 'USD', payer_id: 'N-jack', split: { 'N-me': 1, 'N-jack': 1 } })], [], 'N-me'),
] }
const mount = () => render(<ToastProvider><MemoryRouter><OverviewPage /></MemoryRouter></ToastProvider>)
beforeEach(() => { rpc.mockClear(); pdf.mockClear(); save.mockClear(); fetchAll.mockReset().mockResolvedValue(all) }); afterEach(cleanup)

const card = (name: string) => screen.getByText(name, { selector: 'b' }).closest('button') as HTMLElement
const lastBatch = () => (rpc.mock.calls.at(-1) as unknown as [string, { p_items: Array<Record<string, unknown>> }])

describe('overview across trips', () => {
  it('combines the same person across trips, keeps currencies apart, and totals them', async () => {
    mount()
    await screen.findByText('Jack')
    expect(within(card('Jack')).getByText('owes you CAD 120.00')).toBeTruthy()      // Lisbon 100 + Banff 20
    expect(within(card('Jack')).getByText('you owe USD 50.00')).toBeTruthy()        // NYC
    expect(within(card('Jack')).getByText('Pending')).toBeTruthy()                  // Lisbon payment of 30 awaits confirmation
    expect(within(card('Sam')).getByText('owes you CAD 100.00')).toBeTruthy()
    expect(screen.getByText(/owed to you CAD 220\.00 · you owe CAD 0\.00/)).toBeTruthy()
    expect(screen.getByText(/owed to you USD 0\.00 · you owe USD 50\.00/)).toBeTruthy()
  })
  it('shows spending by category, one currency at a time, with the groups behind each category', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(screen.getByText('Spending by category'))
    expect(await screen.findByText('CAD · 2 groups')).toBeTruthy()
    expect(screen.getByText('USD · 1 group')).toBeTruthy()
    expect(screen.getByText(/Each currency is added up on its own/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Uncategorized/ })[0])
    expect(screen.getByRole('link', { name: /Lisbon/ }).getAttribute('href')).toBe('/g/L/breakdown')
    expect(screen.getByRole('link', { name: /Banff/ }).getAttribute('href')).toBe('/g/B/breakdown')
    fireEvent.click(screen.getByText('Balances', { selector: 'button' }))
    expect(within(card('Jack')).getByText('owes you CAD 120.00')).toBeTruthy()
  })
  it('can look at some trips only', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(screen.getByText('Lisbon', { selector: 'button.chip' }))
    await waitFor(() => expect(within(card('Jack')).getByText('owes you CAD 100.00')).toBeTruthy())
    expect(within(card('Jack')).queryByText(/USD/)).toBeNull()
    fireEvent.click(screen.getByText(/All groups/))
    await waitFor(() => expect(within(card('Jack')).getByText('owes you CAD 120.00')).toBeTruthy())
  })
  it('records one payment spread over two trips, oldest first, never over what is owed', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(card('Jack'))
    fireEvent.click(await screen.findByText('Record a payment'))
    expect((await screen.findByLabelText(/Total amount/) as HTMLInputElement).value).toBe('120')
    expect((screen.getByLabelText('Amount for Lisbon') as HTMLInputElement).value).toBe('100')
    expect((screen.getByLabelText('Amount for Banff') as HTMLInputElement).value).toBe('20')
    fireEvent.change(screen.getByLabelText(/Total amount/), { target: { value: '110' } })
    expect((screen.getByLabelText('Amount for Lisbon') as HTMLInputElement).value).toBe('100')
    expect((screen.getByLabelText('Amount for Banff') as HTMLInputElement).value).toBe('10')
    expect(screen.getByText(/Recording CAD 110\.00, leaving CAD 10\.00 owed/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'Cash' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'settled up at brunch' } })
    fireEvent.click(screen.getByText('Record payment', { selector: 'button.primary' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    const [fn, args] = lastBatch()
    expect(fn).toBe('save_payments_batch')
    expect(args.p_items).toEqual([
      expect.objectContaining({ group_id: 'L', from_id: 'L-jack', to_id: 'L-me', amount: 100, method: 'Cash', note: 'settled up at brunch' }),
      expect.objectContaining({ group_id: 'B', from_id: 'B-jack', to_id: 'B-me', amount: 10 }),
    ])
    expect(String(args.p_items[0].paid_on)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('blocks an amount larger than a trip owes', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(card('Jack')); fireEvent.click(await screen.findByText('Record a payment'))
    fireEvent.change(await screen.findByLabelText('Amount for Lisbon'), { target: { value: '150' } })
    expect(screen.getByText(/Lisbon: more than the CAD 100\.00 owed there/)).toBeTruthy()
    expect((screen.getByText('Record payment', { selector: 'button.primary' }) as HTMLButtonElement).disabled).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })
  it('records a payment I made in the other currency, in the right direction', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(card('Jack')); fireEvent.click(await screen.findByText('Record a payment'))
    fireEvent.click(await screen.findByText('I paid Jack'))
    expect((screen.getByLabelText(/Total amount/) as HTMLInputElement).value).toBe('50')
    expect((screen.getByLabelText('Currency') as HTMLSelectElement).value).toBe('USD')
    expect(screen.getByText(/Sent in each group until Jack confirms/)).toBeTruthy()
    fireEvent.click(screen.getByText('Record payment', { selector: 'button.primary' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    expect(lastBatch()[1].p_items).toEqual([expect.objectContaining({ group_id: 'N', from_id: 'N-me', to_id: 'N-jack', amount: 50 })])
  })
  it('exports a PDF for everyone, or for one person', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(screen.getByText('Export PDF'))
    await waitFor(() => expect(pdf).toHaveBeenCalled())
    const first = pdf.mock.calls[0][0] as { people: Array<{ name: string }>; preparedBy: string; includeEstimates: boolean; tripNames: string[] }
    expect(first.people.map(p => p.name)).toEqual(['Jack', 'Sam']); expect(first.preparedBy).toBe('Alex'); expect(first.tripNames).toEqual(['Lisbon', 'Banff', 'NYC'])
    await waitFor(() => expect(save).toHaveBeenCalled())
    expect(String(save.mock.calls[0][1])).toMatch(/^balances-overview-\d{4}-\d{2}-\d{2}\.pdf$/)
    pdf.mockClear(); save.mockClear()
    fireEvent.click(card('Jack'))
    fireEvent.click(await screen.findByText('Export PDF for Jack'))
    await waitFor(() => expect(pdf).toHaveBeenCalled())
    const one = pdf.mock.calls[0][0] as { people: Array<{ name: string }>; title: string }
    expect(one.people.map(p => p.name)).toEqual(['Jack']); expect(one.title).toBe('BALANCE STATEMENT')
  })
  it('shows the items behind a trip and flags payments awaiting confirmation', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(card('Jack'))
    await screen.findByText('Export PDF for Jack')
    expect(screen.getByText('Jack owes you CAD 120.00')).toBeTruthy()
    expect(screen.getByText('You owe Jack USD 50.00')).toBeTruthy()
    expect(screen.getByText(/CAD 30\.00 paid to you is waiting for your confirmation/)).toBeTruthy()
  })
  it('opens the People screen for merging, and explains the rules', async () => {
    mount()
    await screen.findByText('Jack')
    fireEvent.click(screen.getByText('People'))
    expect(await screen.findByText('People across your groups')).toBeTruthy()
    expect(screen.getByText(/Jack in Lisbon · Jack in Banff · Jack in NYC/)).toBeTruthy()
    expect((screen.getByText('Select two or more to merge') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Select Jack')); fireEvent.click(screen.getByLabelText('Select Sam'))
    expect(screen.getByText('Merge 2 people into one')).toBeTruthy()
  })
  it('handles having no trips, and load failures', async () => {
    fetchAll.mockResolvedValue({ ...all, groups: all.groups.map(g => ({ ...g, me: null })) })
    mount(); await screen.findByText('No groups yet'); cleanup()
    fetchAll.mockRejectedValue(new Error('Failed to fetch'))
    mount(); await screen.findByRole('alert')
  })
})


describe('Jack owes me 100 (Banff) and 50 (Bar); I owe Jack 25 (Jill\'s Birthday)', () => {
  const cad = (id: string, name: string, created: string, payer: 'me' | 'jack', amount: number) =>
    G(id, name, 'CAD', created, [T(id + '-me', id, 'Alex', 'u1'), T(id + '-jack', id, 'Jack')],
      [E('x' + id, id, { amount, payer_id: id + '-' + payer, split: { [id + '-me']: 1, [id + '-jack']: 1 } })], [], id + '-me')
  beforeEach(() => fetchAll.mockReset().mockResolvedValue({ contacts: [], mappings: [], groups: [
    cad('B', 'Banff', '2026-03-01', 'me', 200), cad('R', 'Bar', '2026-04-01', 'me', 100), cad('J', "Jill's Birthday", '2026-05-01', 'jack', 50),
  ] }))

  it('summarises it as: Jack owes you CAD 125', async () => {
    mount()
    await screen.findByText('Jack')
    expect(within(card('Jack')).getByText('owes you CAD 125.00')).toBeTruthy()
    expect(screen.getAllByText(/\+CAD 125\.00/).length).toBeGreaterThan(0)       // grand total box
    expect(within(card('Jack')).getByText(/Banff · Bar · Jill/)).toBeTruthy()
  })
  it('shows each trip with its own sign in the breakdown (+100, +50, -25)', async () => {
    mount()
    await screen.findByText('Jack'); fireEvent.click(card('Jack'))
    expect(await screen.findByText('Jack owes you CAD 125.00')).toBeTruthy()
    for (const amt of ['+CAD 100.00', '+CAD 50.00', '−CAD 25.00']) expect(screen.getAllByText(amt).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Jill's Birthday").length).toBeGreaterThan(0)
  })
  it('the payment sheet agrees: it suggests 125, not 150, and explains the 25 offset', async () => {
    mount()
    await screen.findByText('Jack'); fireEvent.click(card('Jack')); fireEvent.click(await screen.findByText('Record a payment'))
    expect((screen.getByLabelText(/Total amount/) as HTMLInputElement).value).toBe('125')
    expect(screen.getByText(/Jack owes you CAD 125\.00 overall \(CAD 150\.00 across 2 groups, less CAD 25\.00 the other way/)).toBeTruthy()
    expect(screen.getByText(/Recording CAD 125\.00, settling everything/)).toBeTruthy()
    fireEvent.click(screen.getByText('Record payment', { selector: 'button.primary' }))
    await waitFor(() => expect(rpc).toHaveBeenCalled())
    // oldest trip first: Banff takes its full 100, Bar takes the remaining 25
    expect(lastBatch()[1].p_items).toEqual([
      expect.objectContaining({ group_id: 'B', from_id: 'B-jack', to_id: 'B-me', amount: 100 }),
      expect.objectContaining({ group_id: 'R', from_id: 'R-jack', to_id: 'R-me', amount: 25 }),
    ])
  })
  it('paying the 125 brings the overall balance to zero', () => {
    const after = [
      G('B', 'Banff', 'CAD', '2026-03-01', [T('B-me', 'B', 'Alex', 'u1'), T('B-jack', 'B', 'Jack')], [E('xB', 'B', { amount: 200, payer_id: 'B-me', split: { 'B-me': 1, 'B-jack': 1 } })], [{ id: 'p1', group_id: 'B', from_id: 'B-jack', to_id: 'B-me', amount: 100, paid_on: '2026-10-05', status: 'confirmed' } as Payment], 'B-me'),
      G('R', 'Bar', 'CAD', '2026-04-01', [T('R-me', 'R', 'Alex', 'u1'), T('R-jack', 'R', 'Jack')], [E('xR', 'R', { amount: 100, payer_id: 'R-me', split: { 'R-me': 1, 'R-jack': 1 } })], [{ id: 'p2', group_id: 'R', from_id: 'R-jack', to_id: 'R-me', amount: 25, paid_on: '2026-10-05', status: 'confirmed' } as Payment], 'R-me'),
      G('J', "Jill's Birthday", 'CAD', '2026-05-01', [T('J-me', 'J', 'Alex', 'u1'), T('J-jack', 'J', 'Jack')], [E('xJ', 'J', { amount: 50, payer_id: 'J-jack', split: { 'J-me': 1, 'J-jack': 1 } })], [], 'J-me'),
    ]
    fetchAll.mockReset().mockResolvedValue({ contacts: [], mappings: [], groups: after })
    mount()
    return screen.findByText('All square')
  })
})
