import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { friendly } from './format'
import type { VaultFile, VaultItem, VaultMember, VaultRow } from './vault'

export interface VaultData {
  vault: VaultRow
  items: VaultItem[]
  people: VaultMember[]
  myRole: 'owner' | 'admin' | 'member'
  userId: string
  /** Owner or co-admin. */
  isAdmin: boolean
  isOwner: boolean
  /** The signed-in person may change this item (they added it, or they are an owner or co-admin). */
  canChange: (i: VaultItem) => boolean
}

/** Loads one vault with its items, files and people. Private items other people added never reach this list. */
export function useVaultData(vaultId: string, userId: string) {
  const [data, setData] = useState<VaultData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [v, it, fl, pp] = await Promise.all([
      supabase.from('vaults').select('id, name, icon, color, group_id, invite_code, created_at, personal').eq('id', vaultId).maybeSingle(),
      supabase.from('vault_items').select('*').eq('vault_id', vaultId),
      supabase.from('vault_files').select('id, item_id, path, name, mime, label').eq('vault_id', vaultId).order('created_at'),
      supabase.rpc('vault_people', { p_vault: vaultId }),
    ])
    const err = v.error || it.error || fl.error || pp.error
    if (err) { setError(friendly(err)); setLoading(false); return }
    if (!v.data) { setError('This vault was not found, or you are not in it.'); setLoading(false); return }
    const files = (fl.data ?? []) as VaultFile[]
    const items = ((it.data ?? []) as Array<Omit<VaultItem, 'files'>>).map(i => ({ ...i, files: files.filter(f => f.item_id === i.id) })) as VaultItem[]
    const people = (pp.data ?? []) as VaultMember[]
    const myRole = people.find(p => p.user_id === userId)?.role ?? 'member'
    const isAdmin = myRole === 'owner' || myRole === 'admin'
    setData({
      vault: v.data as VaultRow, items, people, myRole, userId, isAdmin, isOwner: myRole === 'owner',
      canChange: i => i.created_by === userId || isAdmin,
    })
    setError(null); setLoading(false)
  }, [vaultId, userId])

  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: load }
}

/** The vault linked to a group, if the signed-in person is in that vault (otherwise they cannot see it). */
export async function linkedVaultFor(groupId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.from('vaults').select('id, name').eq('group_id', groupId).maybeSingle()
  return (data as { id: string; name: string } | null) ?? null
}
