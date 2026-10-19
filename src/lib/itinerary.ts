import { fmtDate } from './format'
import { websiteUrl, whenLabel } from './vault'

export { websiteUrl, whenLabel }

export type Category = 'transport' | 'stay' | 'food' | 'attractions' | 'activities' | 'shopping' | 'work' | 'custom'

/** Main categories. `icon` is the inside of a 24×24 stroke icon. `subs` are the quick kinds; every category also takes a typed kind. */
export const CATEGORIES: Array<{ id: Category; label: string; plural: string; tint: string; ink: string; icon: string; subs: string[] }> = [
  { id: 'transport', label: 'Transport', plural: 'Transport', tint: '#E6EBFF', ink: '#2B44FF', icon: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 12h12M9 21l2-4M15 21l-2-4"/>', subs: ['Flight', 'Train', 'Bus', 'Car / rental', 'Taxi / rideshare', 'Ferry'] },
  { id: 'stay', label: 'Stay', plural: 'Stays', tint: '#E3F4EE', ink: '#0E7C61', icon: '<path d="M3 21V8l9-5 9 5v13M9 21v-6h6v6"/>', subs: ['Hotel', 'Airbnb', 'Hostel'] },
  { id: 'food', label: 'Food', plural: 'Food', tint: '#FFF1CF', ink: '#8A5A00', icon: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11"/>', subs: ['Restaurant', 'Café', 'Bar', 'Market'] },
  { id: 'attractions', label: 'Attractions', plural: 'Attractions', tint: '#F1E8FA', ink: '#7239A8', icon: '<path d="M4 20h16M6 20V10l6-6 6 6v10M10 20v-5h4v5"/>', subs: ['Museum', 'Landmark', 'Tour'] },
  { id: 'activities', label: 'Activities', plural: 'Activities', tint: '#FDE8E4', ink: '#C23B22', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', subs: ['Hike', 'Beach', 'Show', 'Class'] },
  { id: 'shopping', label: 'Shopping', plural: 'Shopping', tint: '#FCE6F0', ink: '#B02F6B', icon: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>', subs: ['Souvenirs', 'Clothes', 'Groceries'] },
  { id: 'work', label: 'Work', plural: 'Work', tint: '#E8ECE8', ink: '#3E4A45', icon: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>', subs: ['Meeting', 'Call', 'Conference'] },
  { id: 'custom', label: 'Custom', plural: 'Custom', tint: '#EEF0EC', ink: '#5F6B66', icon: '<path d="M12 5v14M5 12h14"/>', subs: [] },
]
export const categoryOf = (id: string) => CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]

export interface ItineraryRow { id: string; name: string; icon: string | null; color: string | null; group_id: string | null; vault_id: string | null; invite_code: string; created_at: string }
export interface ItineraryMember { user_id: string; role: 'owner' | 'admin' | 'member'; name: string }
export interface ItineraryItem {
  id: string; itinerary_id: string; category: Category; category_label: string; subtype: string
  title: string; description: string; vendor: string
  starts_on: string | null; starts_at: string | null; ends_on: string | null; ends_at: string | null
  place: string; address: string; from_place: string; to_place: string; website: string; notes: string
  people: string[]; private: boolean; vault_item_id: string | null; created_by: string
}

/** What the item is called: the typed custom name, or the category name. */
export const categoryName = (i: Pick<ItineraryItem, 'category' | 'category_label'>) => i.category === 'custom' && i.category_label.trim() ? i.category_label.trim() : categoryOf(i.category).label
/** "Transport · Train" */
export const kindLabel = (i: Pick<ItineraryItem, 'category' | 'category_label' | 'subtype'>) => [categoryName(i), i.subtype.trim()].filter(Boolean).join(' · ')

const enc = encodeURIComponent
const loc = (i: Pick<ItineraryItem, 'address' | 'place'>) => [i.address, i.place].filter(Boolean).join(', ')
/** A trip has a route when both ends are named. */
export const hasRoute = (i: Pick<ItineraryItem, 'from_place' | 'to_place'>) => !!(i.from_place.trim() && i.to_place.trim())
/** Plain links: no key, nothing stored. Google Maps hands off to Apple Maps on iPhone where set up. */
export function mapUrl(i: Pick<ItineraryItem, 'address' | 'place' | 'from_place' | 'to_place'>): string | null {
  const q = loc(i) || i.to_place.trim() || i.from_place.trim()
  return q ? 'https://www.google.com/maps/search/?api=1&query=' + enc(q) : null
}
/** From→To for transport; otherwise the address or place as the destination. */
export function directionsUrl(i: Pick<ItineraryItem, 'address' | 'place' | 'from_place' | 'to_place'>): string | null {
  if (hasRoute(i)) return `https://www.google.com/maps/dir/?api=1&origin=${enc(i.from_place.trim())}&destination=${enc(i.to_place.trim())}`
  const q = loc(i) || i.to_place.trim()
  return q ? 'https://www.google.com/maps/dir/?api=1&destination=' + enc(q) : null
}

export type Arrange = 'date' | 'place' | 'type'
export interface Section { key: string; label: string; sub?: string; items: ItineraryItem[] }

const cmp = (a: ItineraryItem, b: ItineraryItem) =>
  (a.starts_on ?? '9999').localeCompare(b.starts_on ?? '9999') || (a.starts_at ?? '99').localeCompare(b.starts_at ?? '99') || a.title.localeCompare(b.title)
export const sortItems = (items: ItineraryItem[]) => [...items].sort(cmp)

/** The place an item belongs under: where it is, or where a trip goes. */
export const placeOf = (i: Pick<ItineraryItem, 'place' | 'to_place'>) => i.place.trim() || i.to_place.trim()

export function arrange(items: ItineraryItem[], by: Arrange): Section[] {
  const out = new Map<string, Section>()
  const add = (key: string, label: string, it: ItineraryItem) => {
    const s = out.get(key)
    if (s) s.items.push(it); else out.set(key, { key, label, items: [it] })
  }
  for (const it of sortItems(items)) {
    if (by === 'date') it.starts_on ? add(it.starts_on, fmtDate(it.starts_on), it) : add('~', 'No date', it)
    else if (by === 'place') { const p = placeOf(it); add(p ? p.toLowerCase() : '~', p || 'No place', it) }
    else { const c = categoryOf(it.category); const k = it.category === 'custom' ? 'custom:' + categoryName(it).toLowerCase() : c.id; add(k, it.category === 'custom' ? categoryName(it) : c.plural, it) }
  }
  const list = [...out.values()]
  if (by === 'date') for (const s of list) s.sub = [...new Set(s.items.map(placeOf).filter(Boolean))].join(', ') || undefined
  if (by === 'place') list.sort((a, b) => (a.key === '~' ? 1 : b.key === '~' ? -1 : a.label.localeCompare(b.label)))
  if (by === 'type') list.sort((a, b) => {
    const ia = CATEGORIES.findIndex(c => c.id === (a.key.startsWith('custom:') ? 'custom' : a.key)), ib = CATEGORIES.findIndex(c => c.id === (b.key.startsWith('custom:') ? 'custom' : b.key))
    return ia - ib || a.label.localeCompare(b.label)
  })
  return list
}

export interface Filters { category: 'all' | Category; person: string; q: string }
export const NO_FILTERS: Filters = { category: 'all', person: '', q: '' }

export function filterItems(items: ItineraryItem[], f: Filters): ItineraryItem[] {
  const s = f.q.trim().toLowerCase()
  return items.filter(i => (f.category === 'all' || i.category === f.category)
    && (!f.person || i.people.some(p => p.toLowerCase() === f.person.toLowerCase()))
    && (!s || [i.title, i.description, i.vendor, i.place, i.address, i.from_place, i.to_place, i.notes, kindLabel(i), i.people.join(' ')].join(' ').toLowerCase().includes(s)))
}

/** Everyone named on any item, for the person filter. */
export const peopleIn = (items: Array<Pick<ItineraryItem, 'people'>>) => [...new Set(items.flatMap(i => i.people))].sort((a, b) => a.localeCompare(b))

/** Names typed before, for the Custom category pick list. */
export const customNames = (items: Array<Pick<ItineraryItem, 'category' | 'category_label'>>) =>
  [...new Set(items.filter(i => i.category === 'custom' && i.category_label.trim()).map(i => i.category_label.trim()))].sort((a, b) => a.localeCompare(b))

/** Guess a category from a vault item type so Add to itinerary starts close. Everything stays editable. */
export function categoryForVaultType(type: string): { category: Category; subtype: string } {
  switch (type) {
    case 'ticket': return { category: 'transport', subtype: '' }
    case 'stay': return { category: 'stay', subtype: '' }
    case 'reservation': return { category: 'food', subtype: 'Restaurant' }
    case 'entry': return { category: 'attractions', subtype: '' }
    default: return { category: 'custom', subtype: '' }
  }
}

export interface SharedItineraryItem extends Omit<ItineraryItem, 'itinerary_id' | 'private' | 'vault_item_id' | 'created_by'> { has_ticket: boolean }
