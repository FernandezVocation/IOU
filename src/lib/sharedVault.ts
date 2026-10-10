import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase, supabaseKey, supabaseUrl } from './supabase'
import type { ItemType } from './vault'

export interface SharedVaultFile { id: string; path: string; name: string; mime: string; label: string }
export interface SharedVaultItem {
  id: string; type: ItemType; title: string; starts_on: string | null; starts_at: string | null; ends_on: string | null; ends_at: string | null
  place: string; address: string; website: string; notes: string; files: SharedVaultFile[]
}
export interface SharedVault { vault: { name: string; icon: string | null; color: string | null }; label: string; items: SharedVaultItem[] }

/** null when the link is unknown, expired or turned off. */
export async function fetchSharedVault(token: string): Promise<SharedVault | null> {
  const { data, error } = await supabase.rpc('get_shared_vault', { p_token: token })
  if (error) throw error
  return (data as SharedVault | null) ?? null
}

/**
 * Vault files are private. A visitor gets a throwaway anonymous session (no email, nothing saved in this browser),
 * registers the link with claim_vault_link(), and may then read the files that link covers.
 * Returns null if anonymous sign-in is not switched on in Supabase, in which case the page simply omits files.
 */
export async function openVaultSession(token: string): Promise<SupabaseClient | null> {
  try {
    const c = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { error } = await c.auth.signInAnonymously()
    if (error) return null
    const { data, error: e2 } = await c.rpc('claim_vault_link', { p_token: token })
    return !e2 && data === true ? c : null
  } catch { return null }
}

export async function signedVaultUrls(c: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await c.storage.from('vault').createSignedUrls(paths.slice(i, i + 100), 3600)
    for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl
  }
  return out
}
