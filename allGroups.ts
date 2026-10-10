import { supabase } from './supabase'
import type { Group, GroupData } from './types'
import { assembleGroup } from './mapRows'

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Read a whole table, a page at a time (the API returns at most 1000 rows per request). */
async function fetchTable(table: string, select: string, order: string[]): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select)
    for (const o of order) q = q.order(o)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw error
    out.push(...(data as any[]))
    if ((data as any[]).length < 1000) break
  }
  return out
}

export interface ContactRow { id: string; name: string }
export interface MappingRow { traveler_id: string; contact_id: string }
export interface AllGroups { groups: GroupData[]; contacts: ContactRow[]; mappings: MappingRow[] }

/**
 * Every trip the signed-in user belongs to, plus their private contact mappings.
 * Row-level security means this can only ever return the user's own trips.
 */
export async function fetchAllGroups(userId: string): Promise<AllGroups> {
  const [g, m, t, e, p, r, c, ct] = await Promise.all([
    fetchTable('groups', '*', ['created_at', 'id']),
    fetchTable('group_members', 'group_id, user_id, role, joined_at, profiles(display_name)', ['group_id', 'user_id']),
    fetchTable('travelers', '*', ['group_id', 'id']),
    fetchTable('expenses', '*, expense_splits(traveler_id, value)', ['group_id', 'id']),
    fetchTable('payments', '*', ['group_id', 'id']),
    fetchTable('group_rates', 'group_id, currency, rate', ['group_id', 'currency']),
    fetchTable('contacts', 'id, name', ['id']),
    fetchTable('contact_travelers', 'traveler_id, contact_id', ['traveler_id']),
  ])
  const by = (rows: any[]) => {
    const map = new Map<string, any[]>()
    for (const x of rows) { const arr = map.get(x.group_id); if (arr) arr.push(x); else map.set(x.group_id, [x]) }
    return map
  }
  const [mm, tt, ee, pp, rr] = [by(m), by(t), by(e), by(p), by(r)]
  const groups = (g as Group[]).map(group => assembleGroup({
    group, members: mm.get(group.id) ?? [], travelers: tt.get(group.id) ?? [], expenses: ee.get(group.id) ?? [],
    payments: pp.get(group.id) ?? [], rates: rr.get(group.id) ?? [], userId,
  }))
  return { groups, contacts: c as ContactRow[], mappings: ct as MappingRow[] }
}
