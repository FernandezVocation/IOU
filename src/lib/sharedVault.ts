import { supabase } from './supabase'
import type { ItemType } from './vault'

export interface SharedVaultItem {
  id: string; type: ItemType; title: string; starts_on: string | null; starts_at: string | null; ends_on: string | null; ends_at: string | null
  place: string; address: string; website: string; notes: string; file_count: number
}
export interface SharedVault { vault: { name: string; icon: string | null; color: string | null }; label: string; items: SharedVaultItem[] }

/** null when the link is unknown, expired or turned off. */
export async function fetchSharedVault(token: string): Promise<SharedVault | null> {
  const { data, error } = await supabase.rpc('get_shared_vault', { p_token: token })
  if (error) throw error
  return (data as SharedVault | null) ?? null
}
