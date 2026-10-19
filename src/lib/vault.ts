import { fmtDate, fmtTime } from './format'

export type ItemType = 'ticket' | 'stay' | 'reservation' | 'entry' | 'pass' | 'document' | 'contact' | 'other'

/** Each kind of thing a vault can hold. `icon` is the inside of a 24×24 stroke icon. */
export const TYPES: Array<{ id: ItemType; label: string; plural: string; tint: string; ink: string; icon: string; timed: boolean }> = [
  { id: 'ticket', label: 'Ticket', plural: 'Tickets', tint: '#FDE8E4', ink: '#C23B22', timed: true, icon: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l2-4M15 21l-2-4"/>' },
  { id: 'stay', label: 'Stay', plural: 'Stays', tint: '#E3F4EE', ink: '#0E7C61', timed: true, icon: '<path d="M3 21V8l9-5 9 5v13M9 21v-6h6v6"/>' },
  { id: 'reservation', label: 'Reservation', plural: 'Reservations', tint: '#FFF1CF', ink: '#8A5A00', timed: true, icon: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11"/>' },
  { id: 'entry', label: 'Entry', plural: 'Entries', tint: '#EEF0FF', ink: '#2B44FF', timed: true, icon: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3zM13 6v12"/>' },
  { id: 'pass', label: 'Pass / QR', plural: 'Passes', tint: '#F1E8FA', ink: '#7239A8', timed: false, icon: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2z"/>' },
  { id: 'document', label: 'Document', plural: 'Documents', tint: '#E8ECE8', ink: '#5F6B66', timed: false, icon: '<path d="M6 3h9l4 4v14H6zM14 3v5h5"/>' },
  { id: 'contact', label: 'Contact', plural: 'Contacts', tint: '#E8ECE8', ink: '#5F6B66', timed: false, icon: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>' },
  { id: 'other', label: 'Other', plural: 'Other', tint: '#E8ECE8', ink: '#5F6B66', timed: false, icon: '<path d="M5 12h.01M12 12h.01M19 12h.01"/>' },
]
export const typeOf = (id: string) => TYPES.find(t => t.id === id) ?? TYPES[TYPES.length - 1]

export interface VaultRow { id: string; name: string; icon: string | null; color: string | null; group_id: string | null; invite_code: string; created_at: string; personal?: boolean }
export interface VaultFile { id: string; item_id: string; path: string; name: string; mime: string; label: string }
export interface VaultItem {
  id: string; vault_id: string; type: ItemType; title: string; description: string; booking_ref?: string
  starts_on: string | null; starts_at: string | null; ends_on: string | null; ends_at: string | null
  place: string; address: string; website: string; notes: string; private: boolean; created_by: string
  files: VaultFile[]
}
export interface VaultMember { user_id: string; role: 'owner' | 'admin' | 'member'; name: string }

/** "Sat, Oct 10 · 9:10 AM". Times are local to the place and never converted. */
export function whenLabel(i: Pick<VaultItem, 'starts_on' | 'starts_at' | 'ends_on' | 'ends_at'>): string {
  if (!i.starts_on) return i.starts_at ? fmtTime(i.starts_at) : ''
  const a = [fmtDate(i.starts_on), i.starts_at ? fmtTime(i.starts_at) : ''].filter(Boolean).join(' · ')
  if (i.ends_on && i.ends_on !== i.starts_on) return `${a} → ${[fmtDate(i.ends_on), i.ends_at ? fmtTime(i.ends_at) : ''].filter(Boolean).join(' · ')}`
  if (i.ends_at) return `${a} – ${fmtTime(i.ends_at)}`
  return a
}

/** Only http(s) links are ever opened; anything else (javascript:, data:) is dropped. */
export function websiteUrl(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s
  try {
    const u = new URL(withScheme)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch { return null }
}

const where = (i: Pick<VaultItem, 'title' | 'address' | 'place'>) => [i.address, i.place].filter(Boolean).join(', ')
/** Map and directions are plain links: they cost nothing and need no key. They open Google Maps, which hands off to Apple Maps on iPhone where set up. */
export const mapUrl = (i: Pick<VaultItem, 'title' | 'address' | 'place'>) => i.address || i.place ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(where(i)) : null
export const directionsUrl = (i: Pick<VaultItem, 'title' | 'address' | 'place'>) => i.address || i.place ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(where(i)) : null

export type Arrange = 'date' | 'place' | 'type'
export interface Section { key: string; label: string; sub?: string; items: VaultItem[] }

const cmp = (a: VaultItem, b: VaultItem) =>
  (a.starts_on ?? '9999').localeCompare(b.starts_on ?? '9999') || (a.starts_at ?? '99').localeCompare(b.starts_at ?? '99') || a.title.localeCompare(b.title)

/** Sections for the vault list. Items without a date go in a last "No date" section. */
export function arrange(items: VaultItem[], by: Arrange): Section[] {
  const sorted = [...items].sort(cmp)
  const out = new Map<string, Section>()
  const add = (key: string, label: string, it: VaultItem, sub?: string) => {
    const s = out.get(key)
    if (s) s.items.push(it); else out.set(key, { key, label, sub, items: [it] })
  }
  for (const it of sorted) {
    if (by === 'date') it.starts_on ? add(it.starts_on, fmtDate(it.starts_on), it) : add('~', 'No date', it)
    else if (by === 'place') {
      const p = it.place.trim()
      add(p ? p.toLowerCase() : '~', p || 'No place', it)
    } else { const t = typeOf(it.type); add(t.id, t.plural, it) }
  }
  const list = [...out.values()]
  if (by === 'date') for (const s of list) s.sub = [...new Set(s.items.map(i => i.place.trim()).filter(Boolean))].join(', ') || undefined
  if (by === 'place') list.sort((a, b) => (a.key === '~' ? 1 : b.key === '~' ? -1 : a.label.localeCompare(b.label)))
  if (by === 'type') list.sort((a, b) => TYPES.findIndex(t => t.id === a.key) - TYPES.findIndex(t => t.id === b.key))
  return list
}

export function filterItems(items: VaultItem[], type: 'all' | ItemType, q: string): VaultItem[] {
  const s = q.trim().toLowerCase()
  return items.filter(i => (type === 'all' || i.type === type)
    && (!s || [i.title, i.description, i.place, i.address, i.notes, typeOf(i.type).label].join(' ').toLowerCase().includes(s)))
}

/** Shrink phone photos before upload: long edge 2000px, JPEG. PDFs and small images pass through. */
export async function prepVaultFile(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  if (file.type === 'application/pdf') return { blob: file, type: file.type, name: file.name }
  if (!file.type.startsWith('image/')) throw new Error('Only photos and PDFs can be attached.')
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const sc = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    // PNG stays lossless so a QR code stays sharp; photos become JPEG.
    const png = file.type === 'image/png'
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.86))
    if (!blob) throw new Error('encode failed')
    return { blob, type: png ? 'image/png' : 'image/jpeg', name: file.name }
  } catch {
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return { blob: file, type: file.type, name: file.name }
    throw new Error('Could not read that image. Try a JPEG or PNG.')
  }
}

export const safeFileName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'file'
