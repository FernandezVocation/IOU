import type { Expense, Group, GroupData, Member, Payment, Traveler } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
// Database rows -> app shapes. Shared by the single-trip screen and the all-trips overview.

export const mapTraveler = (x: any): Traveler => ({ ...x, sort_order: Number(x.sort_order) })

export const mapMember = (x: any): Member => ({
  user_id: x.user_id, role: x.role, joined_at: x.joined_at,
  display_name: (Array.isArray(x.profiles) ? x.profiles[0]?.display_name : x.profiles?.display_name) ?? '',
})

export function mapExpense(x: any): Expense {
  const { expense_splits, ...rest } = x
  return {
    ...rest,
    amount: Number(rest.amount),
    subcategory: rest.subcategory ?? '',
    settled_amount: rest.settled_amount == null ? null : Number(rest.settled_amount),
    charged_amount: rest.charged_amount == null ? null : Number(rest.charged_amount),
    charged_currency: rest.charged_currency ?? null,
    splits: (expense_splits ?? []).map((s: any) => ({ traveler_id: s.traveler_id, value: Number(s.value) })),
    receipts: rest.receipts ?? [],
  } as Expense
}

export const mapPayment = (x: any): Payment => ({ ...x, amount: Number(x.amount) })

export function assembleGroup(a: {
  group: Group; members: any[]; travelers: any[]; expenses: any[]; payments: any[]; rates: any[]; userId: string
}): GroupData {
  const travelers = a.travelers.map(mapTraveler)
  const members = a.members.map(mapMember)
  return {
    group: a.group, members, travelers,
    expenses: a.expenses.map(mapExpense),
    payments: a.payments.map(mapPayment),
    rates: Object.fromEntries(a.rates.map(x => [x.currency, Number(x.rate)])),
    me: travelers.find(x => x.user_id === a.userId) ?? null,
    isOwner: members.some(x => x.user_id === a.userId && (x.role === 'owner' || x.role === 'admin')),
    isPrimaryOwner: members.some(x => x.user_id === a.userId && x.role === 'owner'),
    canEdit: members.some(x => x.user_id === a.userId),
  }
}
