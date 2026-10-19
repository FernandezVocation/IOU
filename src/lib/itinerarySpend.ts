import { expenseInGroupCurrency } from './ledger'
import { fmtMoney } from './money'
import type { Expense } from './types'

export interface SpendExpense { id: string; vendor: string; description?: string; spent_on: string; amount: number; currency: string; settled_amount: number | null; charged_amount: number | null; charged_currency: string | null; itinerary_item_id: string | null; status?: string }
export interface ItemSpend {
  /** Total in the group's currency, in minor units. Expenses with no usable rate are left out and counted in `missing`. */
  minor: number
  /** True when part of the total is converted at a rate rather than a confirmed statement amount. */
  estimated: boolean
  count: number
  missing: number
  expenses: SpendExpense[]
}
export interface Spend { currency: string; byItem: Record<string, ItemSpend> }

/** Totals of the expenses linked to each itinerary item, in the group's currency. A display only: balances are not touched. */
export function spendByItem(expenses: SpendExpense[], currency: string, rates: Record<string, number>): Spend {
  const byItem: Record<string, ItemSpend> = {}
  for (const e of expenses) {
    if (!e.itinerary_item_id) continue
    const s = (byItem[e.itinerary_item_id] ??= { minor: 0, estimated: false, count: 0, missing: 0, expenses: [] })
    s.count++; s.expenses.push(e)
    const c = expenseInGroupCurrency(e as unknown as Expense, currency, rates)
    if (c.minor == null) s.missing++
    else { s.minor += c.minor; if (c.status === 'estimated') s.estimated = true }
  }
  return { currency, byItem }
}

/** "$120.00", "≈ $120.00" when part is converted at a rate, with a note when an expense could not be converted. */
export function spendLabel(s: ItemSpend, currency: string): string {
  const total = s.count === s.missing ? '' : (s.estimated ? '≈ ' : '') + fmtMoney(s.minor, currency)
  return [total, s.missing ? `${s.missing} without a rate` : ''].filter(Boolean).join(' + ')
}
