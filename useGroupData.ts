import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { friendly } from './format'
import type { Group, GroupData } from './types'
import { assembleGroup } from './mapRows'

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchGroup(groupId: string, userId: string): Promise<GroupData> {
  const [g, m, t, e, p, r] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select('user_id, role, joined_at, profiles(display_name)').eq('group_id', groupId),
    supabase.from('travelers').select('*').eq('group_id', groupId).order('sort_order'),
    supabase.from('expenses').select('*, expense_splits(traveler_id, value), receipts(*)').eq('group_id', groupId),
    supabase.from('payments').select('*').eq('group_id', groupId),
    supabase.from('group_rates').select('currency, rate').eq('group_id', groupId),
  ])
  for (const res of [g, m, t, e, p, r]) if (res.error) throw res.error
  if (!g.data) throw new Error('This group does not exist, or you are not a member of it.')

  return assembleGroup({ group: g.data as Group, members: m.data as any[], travelers: t.data as any[], expenses: e.data as any[], payments: p.data as any[], rates: r.data as any[], userId })
}

const WATCHED: Array<{ table: string; column: string }> = [
  { table: 'groups', column: 'id' },
  { table: 'group_members', column: 'group_id' },
  { table: 'travelers', column: 'group_id' },
  { table: 'expenses', column: 'group_id' },
  { table: 'expense_splits', column: 'group_id' },
  { table: 'receipts', column: 'group_id' },
  { table: 'payments', column: 'group_id' },
  { table: 'group_rates', column: 'group_id' },
]

/**
 * Loads one group and keeps it live: any change by anyone in the group (realtime) or by
 * this device (reload()) refetches. Refetching beats patching rows here: a group is small,
 * and the ledger stays trivially consistent.
 */
export function useGroupData(groupId: string, userId: string) {
  const [data, setData] = useState<GroupData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const mine = ++seq.current
    try {
      const d = await fetchGroup(groupId, userId)
      if (mine === seq.current) { setData(d); setError(null) }
    } catch (e) {
      if (mine === seq.current) setError(friendly(e))
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [groupId, userId])

  useEffect(() => {
    setData(null); setError(null); setLoading(true)
    reload()
    let timer: ReturnType<typeof setTimeout> | undefined
    const bump = () => { clearTimeout(timer); timer = setTimeout(reload, 250) }
    let ch = supabase.channel('group-' + groupId)
    for (const w of WATCHED) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: w.table, filter: `${w.column}=eq.${groupId}` }, bump)
    }
    ch.subscribe()
    // Realtime can drop on flaky phone connections; refresh when the app comes back to the foreground.
    const onVisible = () => { if (document.visibilityState === 'visible') reload() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); supabase.removeChannel(ch) }
  }, [groupId, userId, reload])

  return { data, error, loading, reload }
}
