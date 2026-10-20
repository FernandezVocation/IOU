import { describe, expect, it } from 'vitest'
import { NO_FILTERS, addDays, counts, dueBucket, filterItems, groupItems, mergePeople, purchaseQuery, sortItems, typeLabel, type ChecklistItem } from './checklist'

const today = '2026-10-19'
const ctx = { today, me: 'u1' }
let n = 0
const mk = (o: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: 'i' + ++n, checklist_id: 'c1', type: 'todo', type_label: '', type_icon: '', title: 'Item ' + n, notes: '', status: 'todo', due_on: null,
  assigned_name: '', assigned_user: null, completed_by_name: '', completed_by_user: null, completed_at: null,
  est_amount: null, est_currency: null, qty: 1, packed_in: '', booking_ref: '', expense_id: null, itinerary_item_id: null, vault_item_id: null,
  created_by: 'u1', created_at: '2026-10-01T00:00:0' + (n % 10) + 'Z', ...o,
})

describe('checklist filters', () => {
  const items = [
    mk({ title: 'Passport', type: 'packing', packed_in: 'Carry-on', due_on: '2026-10-25' }),
    mk({ title: 'Adapter', type: 'purchase', est_amount: 20, est_currency: 'CAD', due_on: '2026-10-10', assigned_user: 'u1', assigned_name: 'Ann' }),
    mk({ title: 'Visa', type: 'custom', type_label: 'Paperwork', status: 'in_progress', assigned_name: 'Maria' }),
    mk({ title: 'Taxi', type: 'booking', status: 'completed', due_on: today, completed_by_user: 'u2', completed_by_name: 'Ed' }),
  ]
  const f = (p: object) => filterItems(items, { ...NO_FILTERS, ...p }, ctx).map(i => i.title)
  it('filters by built-in and custom type', () => {
    expect(f({ type: 'purchase' })).toEqual(['Adapter'])
    expect(f({ type: 'c:Paperwork' })).toEqual(['Visa'])
  })
  it('filters by status, with "open" meaning not completed', () => {
    expect(f({ status: 'completed' })).toEqual(['Taxi'])
    expect(f({ status: 'open' })).toEqual(['Passport', 'Adapter', 'Visa'])
  })
  it('filters by who it is assigned to, including me and nobody', () => {
    expect(f({ assignee: 'me' })).toEqual(['Adapter'])
    expect(f({ assignee: 'n:maria' })).toEqual(['Visa'])
    expect(f({ assignee: 'none' })).toEqual(['Passport', 'Taxi'])
  })
  it('filters by who completed it', () => { expect(f({ doneBy: 'u:u2' })).toEqual(['Taxi']) })
  it('filters by date: overdue ignores completed items', () => {
    expect(f({ when: 'overdue' })).toEqual(['Adapter'])
    expect(f({ when: 'today' })).toEqual(['Taxi'])
    expect(f({ when: 'week' })).toEqual(['Passport', 'Taxi'])
    expect(f({ when: 'none' })).toEqual(['Visa'])
    expect(f({ when: 'range', from: '2026-10-20', to: '2026-10-31' })).toEqual(['Passport'])
  })
  it('searches title, notes, packed-in and type', () => {
    expect(f({ q: 'carry' })).toEqual(['Passport'])
    expect(f({ q: 'paperwork' })).toEqual(['Visa'])
  })
})

describe('sorting and grouping', () => {
  it('puts completed last, then by due date with undated after dated', () => {
    const a = mk({ due_on: '2026-11-01' }), b = mk({ due_on: '2026-10-20' }), c = mk(), d = mk({ status: 'completed', due_on: '2026-10-01' })
    expect(sortItems([d, c, a, b]).map(i => i.id)).toEqual([b.id, a.id, c.id, d.id])
  })
  it('groups by due-date bucket in a sensible order', () => {
    const items = [mk({ due_on: '2026-10-01' }), mk({ due_on: today }), mk({ due_on: '2026-10-22' }), mk({ due_on: '2027-01-01' }), mk(), mk({ status: 'completed' })]
    expect(groupItems(items, 'due', ctx, []).map(s => s.label)).toEqual(['Overdue', 'Today', 'This week', 'Later', 'No date', 'Completed'])
  })
  it('groups by assignee with unassigned last', () => {
    const s = groupItems([mk(), mk({ assigned_name: 'Zed' }), mk({ assigned_name: 'Amy' })], 'assignee', ctx, [])
    expect(s.map(x => x.label)).toEqual(['Amy', 'Zed', 'Unassigned'])
  })
  it('groups by status', () => {
    expect(groupItems([mk({ status: 'completed' }), mk(), mk({ status: 'in_progress' })], 'status', ctx, []).map(s => s.label)).toEqual(['In progress', 'To do', 'Completed'])
  })
})

describe('helpers', () => {
  it('names a custom type by its label', () => { expect(typeLabel(mk({ type: 'custom', type_label: 'Gift' }))).toBe('Gift'); expect(typeLabel(mk({ type: 'booking' }))).toBe('To book') })
  it('counts done, open and overdue', () => {
    expect(counts([mk({ status: 'completed' }), mk({ due_on: '2026-01-01' }), mk()], today)).toEqual({ total: 3, done: 1, open: 2, overdue: 1 })
  })
  it('adds days across month ends', () => { expect(addDays('2026-10-30', 3)).toBe('2026-11-02') })
  it('buckets a dated item', () => { expect(dueBucket(mk({ due_on: today }), today).label).toBe('Today') })
  it('shows one entry per human: an account hides a same-named name-only person', () => {
    const p = mergePeople([[{ key: '', name: 'Shirley', user: 'u9' }], [{ key: '', name: 'shirley', user: null }, { key: '', name: 'Maria', user: null }]])
    expect(p.map(x => x.name)).toEqual(['Shirley', 'Maria'])
  })
  it('hands a purchase to the expense form with its price and id', () => {
    const q = new URLSearchParams(purchaseQuery(mk({ id: 'abc', title: 'Adapter', est_amount: 20 })))
    expect([q.get('vendor'), q.get('amount'), q.get('checklist')]).toEqual(['Adapter', '20', 'abc'])
  })
})
