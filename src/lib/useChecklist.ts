import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { friendly } from './format'
import { CHECKLIST_COLS, ITEM_COLS, mergePeople, type Checklist, type ChecklistItem, type Person } from './checklist'

export interface Member { user_id: string; role: 'owner' | 'admin' | 'member'; name: string }
export interface ChecklistData {
  list: Checklist
  items: ChecklistItem[]
  members: Member[]
  /** Everyone an item can be given to: people with accounts, group travelers, and names already used on items. */
  people: Person[]
  groupName: string | null
  userId: string
  isAdmin: boolean
  isOwner: boolean
  canChange: (i: ChecklistItem) => boolean
}

/** One list with its items and people. */
export function useChecklistData(id: string, userId: string) {
  const [data, setData] = useState<ChecklistData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [c, it, pp] = await Promise.all([
      supabase.from('checklists').select(CHECKLIST_COLS).eq('id', id).maybeSingle(),
      supabase.from('checklist_items').select(ITEM_COLS).eq('checklist_id', id),
      supabase.rpc('checklist_people', { p_cl: id }),
    ])
    const err = c.error || it.error || pp.error
    if (err) { setError(friendly(err)); setLoading(false); return }
    if (!c.data) { setError('This list was not found, or you are not in it.'); setLoading(false); return }
    const list = c.data as Checklist
    const items = (it.data ?? []) as ChecklistItem[]
    const members = (pp.data ?? []) as Member[]
    let travelers: Person[] = [], groupName: string | null = null, groupAdmin = false
    if (list.group_id) {
      const [g, t, gm] = await Promise.all([
        supabase.from('groups').select('name').eq('id', list.group_id).maybeSingle(),
        supabase.from('travelers').select('name, user_id').eq('group_id', list.group_id),
        supabase.from('group_members').select('role').eq('group_id', list.group_id).eq('user_id', userId).maybeSingle(),
      ])
      groupName = (g.data as { name: string } | null)?.name ?? null
      travelers = ((t.data ?? []) as Array<{ name: string; user_id: string | null }>).map(x => ({ key: '', name: x.name, user: x.user_id }))
      groupAdmin = ['owner', 'admin'].includes((gm.data as { role: string } | null)?.role ?? '')
    }
    const accounts: Person[] = members.map(m => ({ key: '', name: m.name, user: m.user_id }))
    const used: Person[] = items.flatMap(i => [
      ...(i.assigned_name && !i.assigned_user ? [{ key: '', name: i.assigned_name, user: null }] : []),
      ...(i.completed_by_name && !i.completed_by_user ? [{ key: '', name: i.completed_by_name, user: null }] : []),
    ])
    // Travelers with an account use their group name; the account name fills in for anyone not in the group.
    const people = mergePeople([travelers.filter(x => x.user), accounts, travelers, used]).map(p => ({ ...p, key: p.user ? 'u:' + p.user : 'n:' + p.name.toLowerCase() }))
    const myRole = members.find(m => m.user_id === userId)?.role
    const isAdmin = myRole === 'owner' || myRole === 'admin' || groupAdmin
    setData({ list, items, members, people, groupName, userId, isAdmin, isOwner: myRole === 'owner', canChange: i => i.created_by === userId || isAdmin })
    setError(null); setLoading(false)
  }, [id, userId])

  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}
