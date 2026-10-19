import { describe, expect, it } from 'vitest'
import { buildAliases, canonPeople, arrange, categoryForExpense, categoryForVaultType, subtypesIn, customNames, directionsUrl, filterItems, kindLabel, mapUrl, NO_FILTERS, peopleIn, type ItineraryItem } from './itinerary'

const I = (o: Partial<ItineraryItem>): ItineraryItem => ({
  id: o.title ?? 'x', itinerary_id: 'it', category: 'transport', category_label: '', subtype: '', title: 'T', description: '', vendor: '',
  starts_on: null, starts_at: null, ends_on: null, ends_at: null, place: '', address: '', from_place: '', to_place: '', website: '', notes: '',
  people: [], private: false, vault_item_id: null, created_by: 'u', ...o,
})

describe('links', () => {
  it('draws a route from the From place to the To place for transport', () => {
    const d = decodeURIComponent(directionsUrl(I({ from_place: 'Venezia Santa Lucia', to_place: 'Firenze SMN' }))!)
    expect(d).toContain('origin=Venezia Santa Lucia')
    expect(d).toContain('destination=Firenze SMN')
  })
  it('uses the address, then the place, when there is no route', () => {
    expect(decodeURIComponent(directionsUrl(I({ address: 'Via Roma 1', place: 'Rome' }))!)).toContain('destination=Via Roma 1, Rome')
    expect(mapUrl(I({}))).toBeNull()
    expect(decodeURIComponent(mapUrl(I({ to_place: 'Florence' }))!)).toContain('Florence')
  })
})

describe('names', () => {
  it('shows a custom category by its typed name', () => {
    expect(kindLabel(I({ category: 'custom', category_label: 'Family', subtype: 'Dinner' }))).toBe('Family · Dinner')
    expect(kindLabel(I({ category: 'work', subtype: 'Call' }))).toBe('Work · Call')
  })
  it('remembers custom names and the people used', () => {
    const items = [I({ category: 'custom', category_label: 'Family' }), I({ category: 'custom', category_label: 'Family' }), I({ category: 'food', people: ['Ann', 'Nonna'] }), I({ people: ['Ann'] })]
    expect(customNames(items)).toEqual(['Family'])
    expect(peopleIn(items)).toEqual(['Ann', 'Nonna'])
  })
})

describe('arrange and filter', () => {
  const items = [
    I({ title: 'Italo', starts_on: '2026-10-10', starts_at: '09:10', to_place: 'Florence', people: ['Ann', 'Ed'] }),
    I({ title: 'Hotel', category: 'stay', starts_on: '2026-10-10', starts_at: '14:00', place: 'Florence', people: ['Ann'] }),
    I({ title: 'Gelato', category: 'food', starts_on: '2026-10-11', place: 'Rome' }),
    I({ title: 'Packing', category: 'custom', category_label: 'Chores' }),
  ]
  it('groups by day in time order with an undated section last', () => {
    const s = arrange(items, 'date')
    expect(s.map(x => x.label).at(-1)).toBe('No date')
    expect(s[0].items.map(i => i.title)).toEqual(['Italo', 'Hotel'])
    expect(s[0].sub).toBe('Florence')
  })
  it('groups by place, counting where a trip goes', () => {
    const s = arrange(items, 'place')
    expect(s.find(x => x.label === 'Florence')!.items.map(i => i.title)).toEqual(['Italo', 'Hotel'])
    expect(s.at(-1)!.label).toBe('No place')
  })
  it('groups by category and keeps each custom name separate', () => {
    const s = arrange(items, 'type')
    expect(s.map(x => x.label)).toEqual(['Transport', 'Stays', 'Food', 'Chores'])
  })
  it('filters by category, person and search', () => {
    expect(filterItems(items, { ...NO_FILTERS, category: 'stay' }).map(i => i.title)).toEqual(['Hotel'])
    expect(filterItems(items, { ...NO_FILTERS, person: 'ed' }).map(i => i.title)).toEqual(['Italo'])
    expect(filterItems(items, { ...NO_FILTERS, q: 'rome' }).map(i => i.title)).toEqual(['Gelato'])
  })
})

describe('Add to itinerary', () => {
  it('suggests a category from the vault type', () => {
    expect(categoryForVaultType('ticket').category).toBe('transport')
    expect(categoryForVaultType('stay').category).toBe('stay')
    expect(categoryForVaultType('reservation')).toEqual({ category: 'food', subtype: 'Restaurant' })
    expect(categoryForVaultType('document').category).toBe('custom')
  })
})

describe('subtypes and booking codes', () => {
  const rows = [I({ title: 'a', subtype: 'Train' }), I({ title: 'b', subtype: 'Flight' }), I({ title: 'c', subtype: 'Train' }), I({ title: 'd', category: 'stay', subtype: 'Hotel' }), I({ title: 'e', category: 'custom', subtype: '' })]
  it('lists subtypes in use, within one category if asked', () => {
    expect(subtypesIn(rows)).toEqual(['Flight', 'Hotel', 'Train'])
    expect(subtypesIn(rows, 'transport')).toEqual(['Flight', 'Train'])
  })
  it('filters by subtype, ignoring case', () => {
    expect(filterItems(rows, { ...NO_FILTERS, subtype: 'train' }).map(i => i.title)).toEqual(['a', 'c'])
    expect(filterItems(rows, { ...NO_FILTERS, category: 'stay', subtype: 'Train' })).toEqual([])
  })
  it('arranges by subtype: one section per kind, in category order', () => {
    expect(arrange(rows, 'kind').map(s => [s.label, s.items.length])).toEqual([['Transport · Flight', 1], ['Transport · Train', 2], ['Stay · Hotel', 1], ['Custom', 1]])
  })
  it('finds an item by its booking code', () => {
    expect(filterItems([I({ title: 'x', booking_ref: 'PNR55' })], { ...NO_FILTERS, q: 'pnr55' })).toHaveLength(1)
  })
  it('starts an item from an expense category', () => {
    expect(categoryForExpense('Transportation', 'Train')).toEqual({ category: 'transport', category_label: '', subtype: 'Train' })
    expect(categoryForExpense('Transportation', 'Flights').subtype).toBe('Flight')
    expect(categoryForExpense('Housing', 'Hotel')).toMatchObject({ category: 'stay', subtype: 'Hotel' })
    expect(categoryForExpense('Fees', 'Tip')).toEqual({ category: 'custom', category_label: 'Fees', subtype: '' })
  })
  it('under Type, splits each type by subtype and puts items without one last', () => {
    const t = arrange(rows, 'type')
    const transport = t.find(x => x.key === 'transport')!
    expect(transport.subs?.map(g => [g.label, g.items.length])).toEqual([['Flight', 1], ['Train', 2]])
    expect(transport.items.map(i => i.title)).toEqual(['b', 'a', 'c'])
    expect(t.find(x => x.key === 'stay')!.subs).toBeUndefined()   // one subtype only: no sub-headings
    const mixed = arrange([I({ title: 'x', subtype: 'Train' }), I({ title: 'y', subtype: '' })], 'type')[0]
    expect(mixed.subs?.map(g => g.label)).toEqual(['Train', 'Other'])
  })
})

describe('one name per person', () => {
  const members = [{ user_id: 'u1', name: 'Shirley Fernandez' }, { user_id: 'u2', name: 'Lavi' }, { user_id: 'u3', name: 'Steve' }, { user_id: 'u4', name: 'Outsider' }]
  const travelers = [{ user_id: 'u1', name: 'ShirleyFernandez' }, { user_id: 'u2', name: 'Lavina Ferrao' }, { user_id: 'u3', name: 'Steve' }, { user_id: null, name: 'Nonna' }, { user_id: 'u9', name: 'ShirleyFerrao' }]
  const a = buildAliases(members, travelers)
  it('maps an account name to the traveler name of the same person', () => {
    expect(a).toEqual({ 'shirley fernandez': 'ShirleyFernandez', lavi: 'Lavina Ferrao' })   // Steve already matches; Outsider is not in the group
  })
  it('shows each person once, leaves other people alone, and is case-blind', () => {
    expect(canonPeople(['Shirley Fernandez', 'ShirleyFernandez', 'shirley fernandez', 'ShirleyFerrao', 'Nonna'], a)).toEqual(['ShirleyFernandez', 'ShirleyFerrao', 'Nonna'])
  })
  it('skips an account name that two members share', () => {
    expect(buildAliases([{ user_id: 'u1', name: 'Sam' }, { user_id: 'u2', name: 'Sam' }], [{ user_id: 'u1', name: 'Samuel' }, { user_id: 'u2', name: 'Samantha' }])).toEqual({})
  })
})
