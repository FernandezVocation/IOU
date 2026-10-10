import { describe, expect, it } from 'vitest'
import { arrange, directionsUrl, filterItems, mapUrl, typeOf, websiteUrl, whenLabel, type VaultItem } from './vault'

const I = (o: Partial<VaultItem>): VaultItem => ({
  id: o.title ?? 'x', vault_id: 'v', type: 'ticket', title: 'T', starts_on: null, starts_at: null, ends_on: null, ends_at: null,
  place: '', address: '', website: '', notes: '', private: false, created_by: 'u', files: [], ...o,
})

describe('links', () => {
  it('only ever opens http and https websites', () => {
    expect(websiteUrl('italotreno.it')).toBe('https://italotreno.it/')
    expect(websiteUrl('http://x.test/a')).toBe('http://x.test/a')
    expect(websiteUrl('javascript:alert(1)')).toBeNull()
    expect(websiteUrl('data:text/html,hi')).toBeNull()
    expect(websiteUrl('  ')).toBeNull()
  })
  it('builds Map and Directions links from the address, falling back to the place', () => {
    const m = mapUrl(I({ title: 'Italo', address: 'Piazza della Stazione', place: 'Florence' }))!
    expect(m).toContain('google.com/maps/search')
    expect(decodeURIComponent(m)).toContain('Piazza della Stazione, Florence')
    expect(decodeURIComponent(directionsUrl(I({ place: 'Venice' }))!)).toContain('destination=Venice')
    expect(mapUrl(I({}))).toBeNull()
  })
})

describe('when', () => {
  it('shows the day and the time exactly as booked, and ranges', () => {
    expect(whenLabel({ starts_on: '2026-10-10', starts_at: '09:10', ends_on: null, ends_at: null })).toMatch(/Oct 10/)
    expect(whenLabel({ starts_on: '2026-10-10', starts_at: '09:10', ends_on: null, ends_at: null })).toMatch(/9:10/)
    expect(whenLabel({ starts_on: '2026-10-10', starts_at: '14:00', ends_on: '2026-10-13', ends_at: '11:00' })).toContain('→')
    expect(whenLabel({ starts_on: null, starts_at: null, ends_on: null, ends_at: null })).toBe('')
  })
})

describe('arranging', () => {
  const items = [
    I({ title: 'Late train', starts_on: '2026-10-13', starts_at: '10:20', place: 'Rome', type: 'ticket' }),
    I({ title: 'Hotel', starts_on: '2026-10-10', starts_at: '14:00', place: 'Rome', type: 'stay' }),
    I({ title: 'Early train', starts_on: '2026-10-10', starts_at: '09:10', place: 'Florence', type: 'ticket' }),
    I({ title: 'Passport copy', type: 'document' }),
  ]
  it('by date: days in order, times in order, undated last', () => {
    const s = arrange(items, 'date')
    expect(s.map(x => x.key)).toEqual(['2026-10-10', '2026-10-13', '~'])
    expect(s[0].items.map(x => x.title)).toEqual(['Early train', 'Hotel'])
    expect(s[0].sub).toBe('Florence, Rome')
    expect(s[2].label).toBe('No date')
  })
  it('by place: one section per place however it is capitalised, no place last', () => {
    const s = arrange([...items, I({ title: 'Cafe', place: 'rome', starts_on: '2026-10-11' })], 'place')
    expect(s.map(x => x.label)).toEqual(['Florence', 'Rome', 'No place'])
    expect(s[1].items).toHaveLength(3)
  })
  it('by type: in the order of the type list', () => {
    expect(arrange(items, 'type').map(x => x.key)).toEqual(['ticket', 'stay', 'document'])
  })
  it('filters by type and search', () => {
    expect(filterItems(items, 'ticket', '')).toHaveLength(2)
    expect(filterItems(items, 'all', 'passport')).toHaveLength(1)
    expect(filterItems(items, 'all', 'florence')[0].title).toBe('Early train')
  })
  it('knows every type, and falls back for an unknown one', () => {
    expect(typeOf('pass').label).toBe('Pass / QR')
    expect(typeOf('nonsense').id).toBe('other')
  })
})
