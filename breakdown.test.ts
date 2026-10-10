import { describe, expect, it } from 'vitest'
import { buildBreakdown, buildOverviewBreakdown } from './breakdown'
import { catLabel } from './categories'
import type { Expense, GroupData, Traveler } from './types'

const names = ['Steven', 'Lavi', 'Shirley', 'Ana', 'Ben', 'Cy', 'Dee']
const trav = (g: string): Traveler[] => names.map((n, i) => ({ id: `${g}-${n}`, group_id: g, name: n, color: '#000', user_id: i === 0 ? 'u1' : null, sort_order: i }))
const E = (g: string, id: string, o: Partial<Expense>, who: string[] = names): Expense => ({
  id, group_id: g, spent_on: '2026-10-09', spent_at: '17:53:00', vendor: id, location: '', category: '', subcategory: '', notes: '', amount: 0, currency: 'CAD', settled_amount: null,
  payer_id: g + '-Steven', split_mode: 'equal', created_at: '', updated_at: '', receipts: [], splits: who.map(n => ({ traveler_id: `${g}-${n}`, value: 1 })), ...o,
})
const G = (id: string, name: string, currency: string, expenses: Expense[], rates: Record<string, number> = {}): GroupData => ({
  group: { id, name, currency, invite_code: '', created_by: null, created_at: '', kind: 'Trip' }, members: [], travelers: trav(id), expenses, payments: [], rates, isOwner: true,
  me: trav(id)[0],
})

// The real example: Dolce 700 (Steven paid) and Vaticano 350 (Lavi paid), both split seven ways.
const italy = G('it', 'Italy 2026', 'CAD', [
  E('it', 'Dolce', { vendor: 'Dolce Restaurant', amount: 700, category: 'Food', subcategory: 'Dinner' }),
  E('it', 'Vaticano', { vendor: 'Vaticano', amount: 350, category: 'Grocery', subcategory: 'Groceries', payer_id: 'it-Lavi', spent_on: '2026-10-10' }),
  E('it', 'Gondola', { vendor: 'Gondola', amount: 120, category: 'Activities', subcategory: 'Gondola ride', spent_on: '2026-10-10' }, ['Steven', 'Lavi', 'Shirley', 'Ana', 'Ben', 'Cy']),
  E('it', 'Glass', { vendor: 'Murano glass', amount: 90, category: 'Souvenirs', subcategory: 'Gifts', spent_on: '2026-10-10' }, ['Lavi', 'Shirley']),
  E('it', 'Laundry', { vendor: 'Lavanderia', amount: 14, category: 'Laundry', subcategory: 'Self-service', spent_on: '2026-10-11' }),
  E('it', 'Mystery', { vendor: 'Cash', amount: 7, spent_on: '2026-10-11' }),
  E('it', 'Taxi', { vendor: 'Water taxi', amount: 60, currency: 'EUR', category: 'Transportation', subcategory: 'Taxi', spent_on: '2026-10-11' }),
  E('it', 'Lost', { vendor: 'Old coins', amount: 20, currency: 'JPY', category: 'Fees' }),
], { EUR: 1.5 })

const money = (n: number) => Math.round(n * 100)

describe('category labels', () => {
  it('shows category and sub-category, or what is there', () => {
    expect(catLabel({ category: 'Food', subcategory: 'Dinner' })).toBe('Food › Dinner')
    expect(catLabel({ category: 'Food' })).toBe('Food')
    expect(catLabel({ category: '' })).toBe('Uncategorized')
  })
})

describe('breakdown of one group', () => {
  const total = buildBreakdown(italy, 'category', 'total')
  it('adds up every expense that has an amount in the group currency', () => {
    // 700 + 350 + 120 + 90 + 14 + 7 + 60 EUR x 1.5 = 90 -> 1371. The yen expense has no rate and is left out.
    expect(total.total).toBe(money(1371))
    expect(total.missing).toBe(1)
    expect(total.estimated).toBe(1)
  })
  it('groups by category, biggest first, with sub-categories and the expenses under them', () => {
    expect(total.rows.map(r => [r.label, r.minor])).toEqual([['Food', money(700)], ['Grocery', money(350)], ['Activities', money(120)], ['Souvenirs', money(90)], ['Transportation', money(90)], ['Laundry', money(14)], ['Uncategorized', money(7)]])
    const act = total.rows.find(r => r.label === 'Activities')!
    expect(act.kids!.map(k => [k.label, k.minor])).toEqual([['Gondola ride', money(120)]])
    expect(act.kids![0].kids![0].href).toBe('/g/it/expense/Gondola')
    expect(total.rows.find(r => r.label === 'Transportation')!.estimated).toBe(true)
  })
  it('keeps custom and uncategorized rows, and the category colours list matches the total', () => {
    expect(total.rows.find(r => r.label === 'Laundry')!.category).toBe('Laundry')
    expect(total.rows.find(r => r.label === 'Uncategorized')!.category).toBe('')
    expect(total.cats.reduce((s, c) => s + c.minor, 0)).toBe(total.total)
  })
  it('every row equals the sum of what is under it', () => {
    const check = (rows: ReturnType<typeof buildBreakdown>['rows']) => rows.forEach(r => { if (r.kids) { expect(r.kids.reduce((s, k) => s + k.minor, 0)).toBe(r.minor); check(r.kids) } })
    for (const by of ['category', 'sub', 'date', 'vendor'] as const) { const b = buildBreakdown(italy, by, 'total'); check(b.rows); expect(b.rows.reduce((s, r) => s + r.minor, 0)).toBe(b.total) }
  })
  it('can group by sub-category, date and vendor', () => {
    const sub = buildBreakdown(italy, 'sub', 'total').rows
    expect(sub[0]).toMatchObject({ label: 'Dinner', meta: 'Food', minor: money(700) })
    const date = buildBreakdown(italy, 'date', 'total').rows
    expect(date.map(r => r.key)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
    expect(date[0].minor).toBe(money(700))
    const vendor = buildBreakdown(italy, 'vendor', 'total').rows
    expect(vendor[0]).toMatchObject({ label: 'Dolce Restaurant', minor: money(700) })
  })
})

describe('my share', () => {
  const mine = buildBreakdown(italy, 'category', 'mine')
  it('counts only what the signed-in person owes on each expense', () => {
    // 100 + 50 + 20 (1/6 of 120) + 2 + 1 + 90/7... = 100 + 50 + 20 + 2 + 1 + 12.857 -> allocated to the cent
    const cents = mine.rows.reduce((s, r) => s + r.minor, 0)
    expect(mine.total).toBe(cents)
    expect(mine.rows.find(r => r.label === 'Food')!.minor).toBe(money(100))
    expect(mine.rows.find(r => r.label === 'Grocery')!.minor).toBe(money(50))
    expect(mine.rows.find(r => r.label === 'Activities')!.minor).toBe(money(20))
  })
  it('leaves out expenses the person is not part of, and says how many', () => {
    expect(mine.notMine).toBe(1)                      // Murano glass: only Lavi and Shirley
    expect(mine.rows.find(r => r.label === 'Souvenirs')).toBeUndefined()
  })
})

describe('breakdown across groups', () => {
  const banff = G('ba', 'Banff', 'CAD', [E('ba', 'Cabin', { amount: 700, category: 'Housing', subcategory: 'Rental / Airbnb' }), E('ba', 'Steak', { amount: 210, category: 'Food', subcategory: 'Dinner' })])
  const lisbon = G('li', 'Lisbon', 'EUR', [E('li', 'Tapas', { amount: 70, currency: 'EUR', category: 'Food', subcategory: 'Dinner' })])
  const out = buildOverviewBreakdown([italy, banff, lisbon], 'total')
  it('adds each currency separately and never converts', () => {
    expect(out.map(o => [o.currency, o.groupCount])).toEqual([['CAD', 2], ['EUR', 1]])
    expect(out[1].total).toBe(money(70))
  })
  it('adds the same category across groups and lets you see which groups it came from', () => {
    const cad = out[0]
    const food = cad.rows.find(r => r.label === 'Food')!
    expect(food.minor).toBe(money(910))
    expect(food.kids!.map(k => [k.label, k.minor])).toEqual([['Italy 2026', money(700)], ['Banff', money(210)]])
    expect(food.kids![0].href).toBe('/g/it/breakdown')
  })
  it('can show my share instead of the total', () => {
    const food = buildOverviewBreakdown([italy, banff], 'mine')[0].rows.find(r => r.label === 'Food')!
    expect(food.minor).toBe(money(100) + money(30))
  })
})

describe('expense description in the breakdown', () => {
  const g = G('d', 'Rail', 'CAD', [E('d', 'Train', { vendor: 'Italo', description: 'Florence to Rome', amount: 355.15, category: 'Transportation', subcategory: 'Train' })])
  it('keeps the vendor as the title and puts the description in the line under it', () => {
    for (const by of ['category', 'sub', 'date', 'vendor'] as const) {
      const walk = (rows: ReturnType<typeof buildBreakdown>['rows']): ReturnType<typeof buildBreakdown>['rows'] => rows.flatMap(r => r.leaf ? [r] : walk(r.kids ?? []))
      const leaf = walk(buildBreakdown(g, by, 'total').rows)[0]
      expect(leaf.label).toBe('Italo')
      expect(leaf.meta).toMatch(/^Florence to Rome/)
    }
  })
})
