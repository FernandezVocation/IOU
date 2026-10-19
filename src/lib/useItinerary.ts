import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { friendly } from './format'
import type { ItineraryItem, ItineraryMember, ItineraryRow } from './itinerary'
import { spendByItem, type Spend, type SpendExpense } from './itinerarySpend'

export interface ItineraryData {
  itinerary: ItineraryRow
  items: ItineraryItem[]
  people: ItineraryMember[]
  /** Names of the linked group's travelers (with or without an account). Empty when not linked or not visible. */
  groupNames: string[]
  groupName: string | null
  vaultName: string | null
  /** Expense totals per item, in the group's currency. Null unless the itinerary is linked to a group the viewer is in, so
   *  people outside the group never get an amount. */
  spend: Spend | null
  myRole: 'owner' | 'admin' | 'member'
  userId: string
  isAdmin: boolean
  isOwner: boolean
  canChange: (i: ItineraryItem) => boolean
}

/** Loads one itinerary with its items, people and the names of its linked group and vault. Only-me items of other people never arrive. */
export function useItineraryData(id: string, userId: string) {
  const [data, setData] = useState<ItineraryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [it, items, pp] = await Promise.all([
      supabase.from('itineraries').select('id, name, icon, color, group_id, vault_id, invite_code, created_at').eq('id', id).maybeSingle(),
      supabase.from('itinerary_items').select('*').eq('itinerary_id', id),
      supabase.rpc('itinerary_people', { p_it: id }),
    ])
    const err = it.error || items.error || pp.error
    if (err) { setError(friendly(err)); setLoading(false); return }
    if (!it.data) { setError('This itinerary was not found, or you are not in it.'); setLoading(false); return }
    const row = it.data as ItineraryRow
    let groupNames: string[] = [], groupName: string | null = null, vaultName: string | null = null
    if (row.group_id) {
      const [g, t] = await Promise.all([
        supabase.from('groups').select('name').eq('id', row.group_id).maybeSingle(),
        supabase.from('travelers').select('name').eq('group_id', row.group_id),
      ])
      groupName = (g.data as { name: string } | null)?.name ?? null
      groupNames = ((t.data ?? []) as Array<{ name: string }>).map(x => x.name)
    }
    if (row.vault_id) {
      const v = await supabase.from('vaults').select('name').eq('id', row.vault_id).maybeSingle()
      vaultName = (v.data as { name: string } | null)?.name ?? null
    }
    let spend: Spend | null = null
    const itemIds = ((items.data ?? []) as ItineraryItem[]).map(i => i.id)
    if (row.group_id && itemIds.length) {
      // Row-level rules return these only to members of the group; anyone else gets nothing and so sees no amounts.
      const [g, r, ex] = await Promise.all([
        supabase.from('groups').select('currency').eq('id', row.group_id).maybeSingle(),
        supabase.from('group_rates').select('currency, rate').eq('group_id', row.group_id),
        supabase.from('expenses').select('id, vendor, description, spent_on, amount, currency, settled_amount, charged_amount, charged_currency, itinerary_item_id, status').eq('group_id', row.group_id).in('itinerary_item_id', itemIds),
      ])
      const cur = (g.data as { currency: string } | null)?.currency
      if (cur && !ex.error) {
        const rates = Object.fromEntries(((r.data ?? []) as Array<{ currency: string; rate: number }>).map(x => [x.currency, Number(x.rate)]))
        spend = spendByItem((ex.data ?? []) as SpendExpense[], cur, rates)
      }
    }
    const people = (pp.data ?? []) as ItineraryMember[]
    const myRole = people.find(p => p.user_id === userId)?.role ?? 'member'
    const isAdmin = myRole === 'owner' || myRole === 'admin'
    setData({
      itinerary: row, items: (items.data ?? []) as ItineraryItem[], people, groupNames, groupName, vaultName, spend, myRole, userId, isAdmin, isOwner: myRole === 'owner',
      canChange: i => i.created_by === userId || isAdmin,
    })
    setError(null); setLoading(false)
  }, [id, userId])

  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}
