import { supabase } from './supabase'
import type { Expense, GroupData, Payment, Traveler } from './types'

/** Exactly what get_shared_trip() returns. Anything not listed here is never sent to a link holder. */
export interface SharedTrip {
  label: string
  group: { name: string; currency: string }
  linked: string[]
  travelers: Array<{ id: string; name: string; color: string }>
  expenses: Array<{
    id: string; spent_on: string; spent_at: string | null; vendor: string; location: string; category: string
    amount: number | string; currency: string; settled_amount: number | string | null; payer_id: string
    split_mode: Expense['split_mode']; splits: Array<{ traveler_id: string; value: number | string }>
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
    id: e.id, group_id: 'shared', spent_on: e.spent_on, spent_at: e.spent_at, vendor: e.vendor, location: e.location, category: e.category, notes: '',
    amount: Number(e.amount), currency: e.currency, settled_amount: e.settled_amount == null ? null : Number(e.settled_amount),
    payer_id: e.payer_id, split_mode: e.split_mode, created_at: '', updated_at: '', receipts: [],
    splits: e.splits.map(x => ({ traveler_id: x.traveler_id, value: Number(x.value) })),
  }))
  const payments: Payment[] = s.payments.map(p => ({ id: p.id, group_id: 'shared', from_id: p.from_id, to_id: p.to_id, amount: Number(p.amount), paid_on: p.paid_on, status: p.status }))
  const rates = Object.fromEntries(Object.entries(s.rates).map(([k, v]) => [k, Number(v)]))
  return {
    data: {
      group: { id: 'shared', name: s.group.name, currency: s.group.currency, invite_code: '', created_by: null, created_at: '' },
      members: [], travelers, expenses, payments, rates, me: null, isOwner: false,
    },
    linked: s.linked.filter(id => ids.has(id)),
  }
}
