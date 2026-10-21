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

export interface LinkedItem { id: string; title: string; description: string; type: string; starts_on: string | null; vault_id?: string; personal?: boolean }

/**
 * The vault items an expense of this group can point at: the group's vault, plus the signed-in person's own private vault.
 * Row-level rules in the database do the filtering, so an item that is private to someone else, and anyone else's personal
 * vault, simply never comes back (and its expense shows no icon). Skipped entirely when `needed` is false.
 */
export function useGroupVaultItems(groupId: string, needed: boolean): { items: LinkedItem[]; vaultId: string | null } {
  const [state, setState] = useState<{ items: LinkedItem[]; vaultId: string | null }>({ items: [], vaultId: null })
  useEffect(() => {
    if (!needed) return
    let live = true
    const cols = 'id, title, description, type, starts_on'
    const load = async (vid: string, personal: boolean): Promise<LinkedItem[]> => {
      const r = await supabase.from('vault_items').select(cols).eq('vault_id', vid).order('starts_on', { ascending: true, nullsFirst: false })
      return ((r.data ?? []) as LinkedItem[]).map(x => ({ ...x, vault_id: vid, personal }))
    }
    ;(async () => {
      try {
        const [g, p] = await Promise.all([
          supabase.from('vaults').select('id').eq('group_id', groupId).maybeSingle(),
          supabase.from('vaults').select('id').eq('personal', true).maybeSingle().then(r => r, () => ({ data: null })),
        ])
        const vid = (g.data as { id: string } | null)?.id ?? null
        const pid = (p.data as { id: string } | null)?.id ?? null
        const groupItems = vid ? await load(vid, false) : []
        const mine = pid && pid !== vid ? await load(pid, true) : []
        if (live) setState({ items: [...groupItems, ...mine], vaultId: vid })
      } catch { if (live) setState({ items: [], vaultId: null }) }
    })()
    return () => { live = false }
  }, [groupId, needed])
  return state
}

export interface LinkedItineraryItem { id: string; title: string; category: string; category_label: string; subtype: string; starts_on: string | null; itinerary_id: string; itinerary_name: string }

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
        const r = await supabase.from('itinerary_items').select('id, title, category, category_label, subtype, starts_on, itinerary_id').in('itinerary_id', list.map(x => x.id)).order('starts_on', { ascending: true, nullsFirst: false })
        const names = new Map(list.map(x => [x.id, x.name]))
        if (live) setItems(((r.data ?? []) as Array<Omit<LinkedItineraryItem, 'itinerary_name'>>).map(x => ({ ...x, itinerary_name: names.get(x.itinerary_id) ?? '' })))
      } catch { if (live) setItems([]) }
    })()
    return () => { live = false }
  }, [groupId, needed])
  return items
}
