import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { friendly } from './format'
import { buildAliases, canonPeople, type ItineraryItem, type ItineraryMember, type ItineraryRow } from './itinerary'
import { buildIconMap, type IconMap } from './itineraryIcons'
import { spendByItem, type Spend, type SpendExpense } from './itinerarySpend'

export interface ItineraryData {
  itinerary: ItineraryRow
  items: ItineraryItem[]
  people: ItineraryMember[]
  /** Account name (lower case) to the group's traveler name for the same person, so each person appears once. */
  aliases?: Record<string, string>
  /** Names of the linked group's travelers (with or without an account). Empty when not linked or not visible. */
  groupNames: string[]
  groupName: string | null
  vaultName: string | null
  /** Expense totals per item, in the group's currency. Null unless the itinerary is linked to a group the viewer is in, so
   *  people outside the group never get an amount. */
  spend: Spend | null
  /** Linked vault items the viewer can actually open (the rest are hidden by row-level rules), so the ticket icon is shown only when it leads somewhere. */
  tickets: Set<string>
  /** Icons chosen for custom category and subtype names in this itinerary. */
  icons?: IconMap
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
    const [it, items, pp, ic] = await Promise.all([
      supabase.from('itineraries').select('id, name, icon, color, group_id, vault_id, invite_code, created_at').eq('id', id).maybeSingle(),
      supabase.from('itinerary_items').select('*').eq('itinerary_id', id),
      supabase.rpc('itinerary_people', { p_it: id }),
      supabase.from('itinerary_icons').select('kind, name_key, icon').eq('itinerary_id', id),   // optional: a failure only means default icons
    ])
    const err = it.error || items.error || pp.error
    if (err) { setError(friendly(err)); setLoading(false); return }
    if (!it.data) { setError('This itinerary was not found, or you are not in it.'); setLoading(false); return }
    const row = it.data as ItineraryRow
    let groupNames: string[] = [], groupName: string | null = null, vaultName: string | null = null
    let travelers: Array<{ user_id: string | null; name: string }> = []
    if (row.group_id) {
      const [g, t] = await Promise.all([
        supabase.from('groups').select('name').eq('id', row.group_id).maybeSingle(),
        supabase.from('travelers').select('name, user_id').eq('group_id', row.group_id),
      ])
      groupName = (g.data as { name: string } | null)?.name ?? null
      travelers = (t.data ?? []) as Array<{ user_id: string | null; name: string }>
      groupNames = travelers.map(x => x.name)
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
    const linked = ((items.data ?? []) as ItineraryItem[]).map(i => i.vault_item_id).filter((x): x is string => !!x)
    let tickets = new Set<string>()
    if (linked.length) {
      const t = await supabase.from('vault_items').select('id').in('id', linked)
      tickets = new Set(((t.data ?? []) as Array<{ id: string }>).map(x => x.id))
    }
    const people = (pp.data ?? []) as ItineraryMember[]
    const aliases = buildAliases(people, travelers)
    const myRole = people.find(p => p.user_id === userId)?.role ?? 'member'
    const isAdmin = myRole === 'owner' || myRole === 'admin'
    setData({
      itinerary: row, items: ((items.data ?? []) as ItineraryItem[]).map(i => ({ ...i, people: canonPeople(i.people, aliases) })), aliases, people, groupNames, groupName, vaultName, spend, tickets, icons: buildIconMap(ic.error ? [] : ((ic.data ?? []) as Array<{ kind: string; name_key: string; icon: string }>)), myRole, userId, isAdmin, isOwner: myRole === 'owner',
      canChange: i => i.created_by === userId || isAdmin,
    })
    setError(null); setLoading(false)
  }, [id, userId])

  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}

/** The itineraries linked to a group that the signed-in person is in (the rest are hidden by row-level rules). */
export async function itinerariesFor(groupId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase.from('itineraries').select('id, name').eq('group_id', groupId).order('created_at')
  return (data as Array<{ id: string; name: string }> | null) ?? []
}
