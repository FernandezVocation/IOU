import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabase, supabaseKey, supabaseUrl } from './supabase'
import type { Expense, GroupData, Payment, Traveler } from './types'

/** Exactly what get_shared_trip() returns. Anything not listed here is never sent to a link holder. */
export interface SharedTrip {
  /** 'group': the whole group, receipts included. 'person': only the linked people's own expenses. Missing on old data = person. */
  scope?: 'group' | 'person'
  label: string
  group: { name: string; currency: string }
  linked: string[]
  travelers: Array<{ id: string; name: string; color: string }>
  expenses: Array<{
    id: string; spent_on: string; spent_at: string | null; vendor: string; location: string; category: string; subcategory?: string
    amount: number | string; currency: string; settled_amount: number | string | null; payer_id: string
    split_mode: Expense['split_mode']; splits: Array<{ traveler_id: string; value: number | string }>
    /** Only on group links. */
    receipts?: Array<{ id: string; path: string; name: string | null; mime: string }>
  }>
  payments: Array<{ id: string; from_id: string; to_id: string; amount: number | string; paid_on: string; status?: 'pending' | 'confirmed' }>
  rates: Record<string, number | string>
  generated_at: string
}

/** null means "not valid": unknown, malformed, expired and turned-off links are indistinguishable by design. */
export async function fetchSharedTrip(token: string): Promise<SharedTrip | null> {
  const { data, error } = await supabase.rpc('get_shared_trip', { p_token: token })
  if (error) throw error
  return (data as SharedTrip | null) ?? null
}

/** Rebuild the in-app data shape so the SAME ledger and invoice code computes the numbers. */
export function sharedToGroupData(s: SharedTrip): { data: GroupData; linked: string[] } {
  const travelers: Traveler[] = s.travelers.map((t, i) => ({ id: t.id, group_id: 'shared', name: t.name, color: t.color, user_id: null, sort_order: i }))
  const ids = new Set(travelers.map(t => t.id))
  const expenses: Expense[] = s.expenses.map(e => ({
    id: e.id, group_id: 'shared', spent_on: e.spent_on, spent_at: e.spent_at, vendor: e.vendor, location: e.location, category: e.category, subcategory: e.subcategory ?? '', notes: '',
    amount: Number(e.amount), currency: e.currency, settled_amount: e.settled_amount == null ? null : Number(e.settled_amount),
    payer_id: e.payer_id, split_mode: e.split_mode, created_at: '', updated_at: '',
    receipts: (e.receipts ?? []).map(r => ({ id: r.id, expense_id: e.id, group_id: 'shared', path: r.path, mime: r.mime, name: r.name, size_bytes: null })),
    splits: e.splits.map(x => ({ traveler_id: x.traveler_id, value: Number(x.value) })),
  }))
  const payments: Payment[] = s.payments.map(p => ({ id: p.id, group_id: 'shared', from_id: p.from_id, to_id: p.to_id, amount: Number(p.amount), paid_on: p.paid_on, status: p.status }))
  const rates = Object.fromEntries(Object.entries(s.rates).map(([k, v]) => [k, Number(v)]))
  return {
    data: {
      group: { id: 'shared', name: s.group.name, currency: s.group.currency, invite_code: '', created_by: null, created_at: '' },
      members: [], travelers, expenses, payments, rates, me: null, isOwner: false, canEdit: false,
    },
    linked: s.linked.filter(id => ids.has(id)),
  }
}

/**
 * Receipt files are private. A visitor to a group-wide link gets a throwaway anonymous session (no email, nothing
 * saved in this browser), registers the link with claim_share_link(), and may then read that group's receipts.
 * Returns null if anonymous sign-in is not switched on in Supabase, in which case the page simply omits receipts.
 */
export async function openReceiptSession(token: string): Promise<SupabaseClient | null> {
  try {
    const c = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const { error } = await c.auth.signInAnonymously()
    if (error) return null
    const { data, error: e2 } = await c.rpc('claim_share_link', { p_token: token })
    return !e2 && data === true ? c : null
  } catch { return null }
}

export async function signedReceiptUrls(c: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < paths.length; i += 100) {
    const { data } = await c.storage.from('receipts').createSignedUrls(paths.slice(i, i + 100), 3600)
    for (const x of data ?? []) if (x.path && x.signedUrl) out[x.path] = x.signedUrl
  }
  return out
}
