import { supabase } from './supabase'

export interface GroupOpt { id: string; name: string }

/** Groups the person is in (optionally only where they own or co-administer), one entry each.
 *  group_members shows everyone in your groups, so the query must be limited to your own rows. */
export async function myGroups(userId: string, adminOnly = false): Promise<GroupOpt[]> {
  let q = supabase.from('group_members').select('groups(id, name)').eq('user_id', userId)
  if (adminOnly) q = q.in('role', ['owner', 'admin'])
  const { data } = await q
  type Row = { groups: GroupOpt | GroupOpt[] | null }
  const seen = new Map<string, GroupOpt>()
  for (const r of (data ?? []) as unknown as Row[]) {
    const g = Array.isArray(r.groups) ? r.groups[0] : r.groups
    if (g && !seen.has(g.id)) seen.set(g.id, g)
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}
