import { describe, expect, it } from 'vitest'
import { allocateAcrossTrips, buildOverview, listPeople, totalsByCurrency } from './overview'
import { buildOverviewPdf } from './overviewPdf'
import type { Expense, GroupData, Payment, Traveler } from './types'

const T = (id: string, g: string, name: string, user_id: string | null = null): Traveler => ({ id, group_id: g, name, color: '#000', user_id, sort_order: 0 })
const E = (id: string, g: string, o: Partial<Expense> & { split: Record<string, number> }): Expense => ({
  id, group_id: g, spent_on: '2026-09-12', spent_at: null, vendor: id, location: '', category: '', notes: '', amount: 0, currency: 'CAD', settled_amount: null,
  payer_id: 'me', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: Object.entries(o.split).map(([traveler_id, value]) => ({ traveler_id, value })), ...o,
})
const P = (id: string, g: string, from: string, to: string, amount: number, status: 'pending' | 'confirmed' = 'confirmed'): Payment => ({ id, group_id: g, from_id: from, to_id: to, amount, paid_on: '2026-09-20', status })
const G = (id: string, name: string, currency: string, created: string, travelers: Traveler[], expenses: Expense[], payments: Payment[], me: string): GroupData => ({
  group: { id, name, currency, invite_code: '', created_by: null, created_at: created }, members: [], travelers, expenses, payments, rates: { EUR: 1.5 }, isOwner: true,
  me: travelers.find(t => t.id === me) ?? null,
})

// Lisbon (CAD): Hotel 300 I paid, split me/Jack/Sam -> Jack 100 + Sam 100 owed to me. Dinner 60 Jack paid, split me/Jack -> I owe Jack 30.
//   Jack paid me 20 (confirmed) and 10 (pending).
const lis = G('L', 'Lisbon', 'CAD', '2026-01-01', [T('L-me', 'L', 'Me', 'u1'), T('L-jack', 'L', 'Jack'), T('L-sam', 'L', 'Sam')], [
  E('Hotel', 'L', { amount: 300, payer_id: 'L-me', split: { 'L-me': 1, 'L-jack': 1, 'L-sam': 1 } }),
  E('Dinner', 'L', { amount: 60, payer_id: 'L-jack', split: { 'L-me': 1, 'L-jack': 1 } }),
], [P('p1', 'L', 'L-jack', 'L-me', 20), P('p2', 'L', 'L-jack', 'L-me', 10, 'pending')], 'L-me')
// Banff (CAD): Taxi 40, I paid, me/Jack -> Jack owes me 20
const ban = G('B', 'Banff', 'CAD', '2026-03-01', [T('B-me', 'B', 'Me', 'u1'), T('B-jack', 'B', 'jack ')], [E('Taxi', 'B', { amount: 40, payer_id: 'B-me', split: { 'B-me': 1, 'B-jack': 1 } })], [], 'B-me')
// NYC (USD): 100 USD, Jack paid, me/Jack -> I owe Jack 50 USD
const nyc = G('N', 'NYC', 'USD', '2026-05-01', [T('N-me', 'N', 'Me', 'u1'), T('N-jack', 'N', 'Jack')], [E('Show', 'N', { amount: 100, currency: 'USD', payer_id: 'N-jack', split: { 'N-me': 1, 'N-jack': 1 } })], [], 'N-me')
// A trip I am not part of as a traveler is ignored
const other = G('X', 'Other', 'CAD', '2026-02-01', [T('X-a', 'X', 'A')], [], [], 'nobody')
const args = { groups: [lis, ban, nyc, other], userId: 'u1', contacts: [], mappings: [], includeEstimates: true }

describe('overview across trips', () => {
  const people = buildOverview(args)
  const jack = people.find(p => p.name === 'Jack')!
  it('combines the same person across trips (same name), keeps currencies apart', () => {
    expect(people.map(p => p.name)).toEqual(['Jack', 'Sam'])
    expect(jack.currencies.map(c => [c.currency, c.net])).toEqual([['CAD', 5000 + 2000], ['USD', -5000]])  // Lisbon 70-20=50, Banff 20 ; NYC -50
    expect(jack.tripNames.sort()).toEqual(['Banff', 'Lisbon', 'NYC'])
  })
  it('uses confirmed payments only, and shows pending ones separately', () => {
    const l = jack.currencies[0].trips.find(t => t.groupName === 'Lisbon')!
    expect(l.net).toBe(5000); expect(l.pendingToMe).toBe(1000); expect(l.pendingFromMe).toBe(0); expect(jack.hasPending).toBe(true)
  })
  it('lists the items behind every number, from my point of view', () => {
    const l = jack.currencies[0].trips.find(t => t.groupName === 'Lisbon')!
    expect(l.rows.reduce((s, r) => s + r.amount, 0)).toBe(l.net)
    expect(l.rows.map(r => r.text).sort()).toEqual(['Jack’s share · Hotel (You paid)', 'Payment Jack → You', 'Your share · Dinner (Jack paid)'].sort())
  })
  it('can look at some trips only', () => {
    const j = buildOverview({ ...args, groupIds: new Set(['L']) }).find(p => p.name === 'Jack')!
    expect(j.currencies).toHaveLength(1); expect(j.currencies[0].net).toBe(5000)
    expect(buildOverview({ ...args, groupIds: new Set(['X']) })).toEqual([])
  })
  it('a merge (contact mapping) joins different names; a separate contact splits the same name', () => {
    const merged = buildOverview({ ...args, contacts: [{ id: 'c1', name: 'Jackson' }], mappings: [{ traveler_id: 'B-jack', contact_id: 'c1' }] })
    expect(merged.map(p => p.name)).toEqual(['Jack', 'Jackson', 'Sam'])
    expect(merged.find(p => p.name === 'Jackson')!.currencies[0].net).toBe(2000)
    expect(merged.find(p => p.name === 'Jack')!.currencies.find(c => c.currency === 'CAD')!.net).toBe(5000)
    const all = buildOverview({ ...args, contacts: [{ id: 'c1', name: 'Jack (work)' }], mappings: [{ traveler_id: 'L-jack', contact_id: 'c1' }, { traveler_id: 'B-jack', contact_id: 'c1' }, { traveler_id: 'N-jack', contact_id: 'c1' }] })
    expect(all.find(p => p.name === 'Jack (work)')!.currencies).toHaveLength(2)
  })
  it('people who are the same account are the same person even with different names', () => {
    const a = G('A', 'A', 'CAD', '2026-01-01', [T('A-me', 'A', 'Me', 'u1'), T('A-x', 'A', 'Jacques', 'uJ')], [E('e', 'A', { amount: 20, payer_id: 'A-me', split: { 'A-me': 1, 'A-x': 1 } })], [], 'A-me')
    const b = G('B2', 'B2', 'CAD', '2026-02-01', [T('B2-me', 'B2', 'Me', 'u1'), T('B2-x', 'B2', 'Jack', 'uJ')], [E('e', 'B2', { amount: 20, payer_id: 'B2-me', split: { 'B2-me': 1, 'B2-x': 1 } })], [], 'B2-me')
    const r = buildOverview({ ...args, groups: [a, b] })
    expect(r).toHaveLength(1); expect(r[0].currencies[0].net).toBe(2000)
  })
  it('a settled person disappears unless something is pending', () => {
    const settled = G('S', 'S', 'CAD', '2026-01-01', [T('S-me', 'S', 'Me', 'u1'), T('S-x', 'S', 'Zed')], [E('e', 'S', { amount: 20, payer_id: 'S-me', split: { 'S-me': 1, 'S-x': 1 } })], [P('p', 'S', 'S-x', 'S-me', 10)], 'S-me')
    expect(buildOverview({ ...args, groups: [settled] })).toEqual([])
    const pend = { ...settled, payments: [P('p', 'S', 'S-x', 'S-me', 10, 'pending')] }
    expect(buildOverview({ ...args, groups: [pend] })).toHaveLength(1)
  })
  it('estimated amounts can be left out', () => {
    const est = G('E', 'E', 'CAD', '2026-01-01', [T('E-me', 'E', 'Me', 'u1'), T('E-x', 'E', 'Zed')], [E('t', 'E', { amount: 20, currency: 'EUR', payer_id: 'E-me', split: { 'E-me': 1, 'E-x': 1 } })], [], 'E-me')
    expect(buildOverview({ ...args, groups: [est] })[0].currencies[0]).toMatchObject({ net: 1500 })
    expect(buildOverview({ ...args, groups: [est], includeEstimates: false })).toEqual([])
  })
  it('totals per currency', () => {
    expect(totalsByCurrency(people)).toEqual([{ currency: 'CAD', owedToMe: 5000 + 2000 + 10000, iOwe: 0, net: 17000 }, { currency: 'USD', owedToMe: 0, iOwe: 5000, net: -5000 }])
  })
  it('lists everyone I have traveled with, for merging', () => {
    const r = listPeople(args)
    expect(r.map(p => [p.name, p.travelers.length])).toEqual([['Jack', 3], ['Sam', 1]])
  })
})

describe('splitting one payment across trips', () => {
  it('fills the oldest trip first and never exceeds what each trip owes', () => {
    const trips = [{ key: 'L', max: 5000 }, { key: 'B', max: 2000 }]
    expect(allocateAcrossTrips(trips, 6000)).toEqual({ allocs: { L: 5000, B: 1000 }, leftover: 0 })
    expect(allocateAcrossTrips(trips, 3000)).toEqual({ allocs: { L: 3000, B: 0 }, leftover: 0 })
    expect(allocateAcrossTrips(trips, 9000)).toEqual({ allocs: { L: 5000, B: 2000 }, leftover: 2000 })
  })
})

describe('overview pdf', () => {
  it('renders for everyone, for none, and with odd characters', async () => {
    const people = buildOverview(args)
    for (const input of [{ people, tripNames: ['Lisbon', 'Banff', 'NYC'] }, { people: [people[0]], tripNames: ['Lisbon'] }, { people: [], tripNames: [] }]) {
      const blob = await buildOverviewPdf({ ...input, preparedBy: 'Zoë 日本', includeEstimates: true, now: new Date('2026-10-04T12:00:00') })
      expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe('%PDF-'); expect(blob.size).toBeGreaterThan(2000)
    }
  })
})

describe('netting one person across trips (the "Jack" example)', () => {
  // Banff: Jack owes me 100. Bar: Jack owes me 50. Jill's Birthday: I owe Jack 25. All CAD.
  const banff = G('B', 'Banff', 'CAD', '2026-03-01', [T('B-me', 'B', 'Me', 'u1'), T('B-jack', 'B', 'Jack')], [E('Cabin', 'B', { amount: 200, payer_id: 'B-me', split: { 'B-me': 1, 'B-jack': 1 } })], [], 'B-me')
  const bar = G('R', 'Bar', 'CAD', '2026-04-01', [T('R-me', 'R', 'Me', 'u1'), T('R-jack', 'R', 'Jack')], [E('Tab', 'R', { amount: 100, payer_id: 'R-me', split: { 'R-me': 1, 'R-jack': 1 } })], [], 'R-me')
  const jill = G('J', "Jill's Birthday", 'CAD', '2026-05-01', [T('J-me', 'J', 'Me', 'u1'), T('J-jack', 'J', 'Jack')], [E('Gift', 'J', { amount: 50, payer_id: 'J-jack', split: { 'J-me': 1, 'J-jack': 1 } })], [], 'J-me')
  const go = (groups: GroupData[]) => buildOverview({ groups, userId: 'u1', contacts: [], mappings: [], includeEstimates: true })
  const jack = (groups: GroupData[]) => go(groups).find(p => p.name === 'Jack')!

  it('adds what he owes you and subtracts what you owe him: Jack owes you 125', () => {
    const j = jack([banff, bar, jill])
    expect(j.currencies).toHaveLength(1)
    expect(j.currencies[0].currency).toBe('CAD')
    expect(j.currencies[0].net).toBe(12500)
    expect(Object.fromEntries(j.currencies[0].trips.map(t => [t.groupName, t.net]))).toEqual({ Banff: 10000, Bar: 5000, "Jill's Birthday": -2500 })
    expect(totalsByCurrency(go([banff, bar, jill]))).toEqual([{ currency: 'CAD', owedToMe: 12500, iOwe: 0, net: 12500 }])   // netted per person
  })
  it('a payment in any one trip reduces the grand total (Jack pays 40 toward Banff -> 85)', () => {
    const paid = G('B', 'Banff', 'CAD', '2026-03-01', banff.travelers, banff.expenses, [P('p', 'B', 'B-jack', 'B-me', 40)], 'B-me')
    expect(jack([paid, bar, jill]).currencies[0].net).toBe(8500)
  })
  it('a payment still waiting for confirmation is not counted yet', () => {
    const sent = G('B', 'Banff', 'CAD', '2026-03-01', banff.travelers, banff.expenses, [P('p', 'B', 'B-jack', 'B-me', 40, 'pending')], 'B-me')
    expect(jack([sent, bar, jill]).currencies[0].net).toBe(12500)
  })
  it('if you owe him more than he owes you, the total flips to "you owe Jack"', () => {
    const big = G('J', "Jill's Birthday", 'CAD', '2026-05-01', jill.travelers, [E('Gift', 'J', { amount: 400, payer_id: 'J-jack', split: { 'J-me': 1, 'J-jack': 1 } })], [], 'J-me')
    expect(jack([banff, bar, big]).currencies[0].net).toBe(15000 - 20000)
  })
  it('only combines the trips you pick', () => {
    const only = buildOverview({ groups: [banff, bar, jill], userId: 'u1', contacts: [], mappings: [], includeEstimates: true, groupIds: new Set(['B', 'J']) }).find(p => p.name === 'Jack')!
    expect(only.currencies[0].net).toBe(10000 - 2500)
  })
})
