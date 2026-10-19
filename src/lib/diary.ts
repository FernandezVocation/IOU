import { supabase } from './supabase'

export interface DiaryEntry {
  id: string; itinerary_id: string | null; group_id: string | null; title: string; description: string; place: string
  entry_on: string; entry_at: string | null; people: string[]; notes: string; shared: boolean
  created_by: string; created_at: string
}
export interface DiaryPhoto { id: string; entry_id: string; path: string; name: string; mime: string; caption: string }

export const DIARY_COLS = 'id, itinerary_id, group_id, title, description, place, entry_on, entry_at, people, notes, shared, created_by, created_at'
export type DiaryLinkFilter = 'all' | 'standalone' | string   // a trip or group id

/** Entries for one link: everything, only standalone ones, or those tied to a given trip/group id. */
export const byLink = (rows: DiaryEntry[], f: DiaryLinkFilter) =>
  f === 'all' ? rows : f === 'standalone' ? rows.filter(r => !r.itinerary_id && !r.group_id) : rows.filter(r => r.itinerary_id === f || r.group_id === f)

export const MAX_DIARY_PHOTOS = 10

/** Newest day first; within a day, latest time first, then newest written. */
export function sortDiary(rows: DiaryEntry[]): DiaryEntry[] {
  return [...rows].sort((a, b) =>
    b.entry_on.localeCompare(a.entry_on) || (b.entry_at ?? '').localeCompare(a.entry_at ?? '') || b.created_at.localeCompare(a.created_at))
}

export function matchDiary(rows: DiaryEntry[], q: string): DiaryEntry[] {
  const s = q.trim().toLowerCase()
  return s ? rows.filter(r => [r.title, r.description, r.place, r.notes, r.people.join(' ')].join(' ').toLowerCase().includes(s)) : rows
}

export const diaryPath = (entryId: string, name: string, id: string = crypto.randomUUID()) =>
  `${entryId}/${id}-${name.replace(/[^\w.\- ]+/g, '_').slice(0, 60) || 'photo'}`

export function splitPeople(s: string): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const p of s.split(',').map(x => x.trim()).filter(Boolean)) { const k = p.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(p.slice(0, 40)) } }
  return out.slice(0, 30)
}

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {}
  const { data } = await supabase.storage.from('diary').createSignedUrls(paths, 3600)
  return Object.fromEntries((data ?? []).filter(x => x.path && x.signedUrl).map(x => [x.path as string, x.signedUrl as string]))
}
