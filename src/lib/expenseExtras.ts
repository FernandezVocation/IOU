import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { ExpenseStatus } from './types'

/** A label on an expense. It never changes an amount, a split or a balance. */
export const STATUSES: Array<{ id: ExpenseStatus; label: string; help: string }> = [
  { id: 'final', label: 'Final', help: 'The amount is exact and paid. This is the default and shows no label.' },
  { id: 'estimate', label: 'Estimate', help: 'You are guessing the amount, like a hotel balance before checkout.' },
  { id: 'pending', label: 'Pending', help: 'Probably right, but the charge has not gone through or been confirmed yet.' },
  { id: 'needs_info', label: 'Needs info', help: 'Something is missing, like the receipt or the tip.' },
]
export const statusLabel = (s: string | undefined | null) => STATUSES.find(x => x.id === s)?.label ?? ''

export interface LinkedItem { id: string; title: string; description: string; type: string; starts_on: string | null }

/**
 * The vault items of this group's vault that the signed-in person is allowed to see.
 * Row-level rules in the database do the filtering, so an item that is private to someone else simply never comes back
 * (and its expense shows no icon). Skipped entirely when `needed` is false.
 */
export function useGroupVaultItems(groupId: string, needed: boolean): { items: LinkedItem[]; vaultId: string | null } {
  const [state, setState] = useState<{ items: LinkedItem[]; vaultId: string | null }>({ items: [], vaultId: null })
  useEffect(() => {
    if (!needed) return
    let live = true
    ;(async () => {
      try {
        const v = await supabase.from('vaults').select('id').eq('group_id', groupId).maybeSingle()
        const vid = (v.data as { id: string } | null)?.id ?? null
        if (!vid) { if (live) setState({ items: [], vaultId: null }); return }
        const r = await supabase.from('vault_items').select('id, title, description, type, starts_on').eq('vault_id', vid).order('starts_on', { ascending: true, nullsFirst: false })
        if (live) setState({ items: ((r.data ?? []) as LinkedItem[]), vaultId: vid })
      } catch { if (live) setState({ items: [], vaultId: null }) }
    })()
    return () => { live = false }
  }, [groupId, needed])
  return state
}

export interface LinkedItineraryItem { id: string; title: string; category: string; subtype: string; starts_on: string | null; itinerary_id: string; itinerary_name: string }

/**
 * The itinerary items, in itineraries linked to this group, that the signed-in person can see (the database filters
 * the rest). Skipped when `needed` is false.
 */
export function useGroupItineraryItems(groupId: string, needed: boolean): LinkedItineraryItem[] {
  const [items, setItems] = useState<LinkedItineraryItem[]>([])
  useEffect(() => {
    if (!needed) return
    let live = true
    ;(async () => {
      try {
        const it = await supabase.from('itineraries').select('id, name').eq('group_id', groupId)
        const list = (it.data ?? []) as Array<{ id: string; name: string }>
        if (!list.length) { if (live) setItems([]); return }
        const r = await supabase.from('itinerary_items').select('id, title, category, subtype, starts_on, itinerary_id').in('itinerary_id', list.map(x => x.id)).order('starts_on', { ascending: true, nullsFirst: false })
        const names = new Map(list.map(x => [x.id, x.name]))
        if (live) setItems(((r.data ?? []) as Array<Omit<LinkedItineraryItem, 'itinerary_name'>>).map(x => ({ ...x, itinerary_name: names.get(x.itinerary_id) ?? '' })))
      } catch { if (live) setItems([]) }
    })()
    return () => { live = false }
  }, [groupId, needed])
  return items
}
