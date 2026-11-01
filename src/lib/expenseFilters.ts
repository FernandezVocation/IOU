import type { Calc } from './ledger'
import type { Expense, GroupData } from './types'
import { NO_CATEGORY } from './categories'
import { NO_PAY_TYPE, NO_PAY_SUBTYPE } from './payTypes'

export type RateStatus = 'norate' | 'estimated' | 'confirmed'
export type ReceiptFilter = '' | 'has' | 'none'

export interface ExpenseFilters {
  /** Which amount statuses to show; empty means all. */
  rate: RateStatus[]
  paidBy: string[]
  splitWith: string[]
  category: string
  subcategory: string
  payType: string
  paySub: string
  currency: string
  card: string
  from: string
  to: string
  receipt: ReceiptFilter
}

export const NO_FILTERS: ExpenseFilters = { rate: [], paidBy: [], splitWith: [], category: '', subcategory: '', payType: '', paySub: '', currency: '', card: '', from: '', to: '', receipt: '' }

/** How many different filters are switched on. */
export function activeCount(f: ExpenseFilters): number {
  return (f.rate.length ? 1 : 0) + (f.paidBy.length ? 1 : 0) + (f.splitWith.length ? 1 : 0) + (f.category ? 1 : 0) + (f.payType ? 1 : 0) + (f.currency ? 1 : 0)
    + (f.card ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.receipt ? 1 : 0)
}

/** The card an expense counts as paid on: its own, else the one typed from a statement, else the payer's usual, else the group currency. */
export function cardOf(d: GroupData, e: Expense): string {
  return e.card_currency || e.charged_currency || d.travelers.find(t => t.id === e.payer_id)?.statement_currency || d.group.currency
}

export function filterExpenses(d: GroupData, list: Expense[], calc: Record<string, Calc>, f: ExpenseFilters): Expense[] {
  return list.filter(e => {
    if (f.rate.length) { const st = calc[e.id]?.status; if (!st || !f.rate.includes(st)) return false }
    if (f.paidBy.length && !f.paidBy.includes(e.payer_id)) return false
    if (f.splitWith.length && !f.splitWith.some(id => e.splits.some(s => s.traveler_id === id))) return false
    if (f.category && (e.category || NO_CATEGORY) !== f.category) return false
    if (f.subcategory && (e.subcategory || '') !== f.subcategory) return false
    if (f.payType && (e.pay_type || NO_PAY_TYPE) !== f.payType) return false
    if (f.paySub && (e.pay_subtype || NO_PAY_SUBTYPE) !== f.paySub) return false
    if (f.currency && e.currency !== f.currency) return false
    if (f.card && cardOf(d, e) !== f.card) return false
    if (f.from && e.spent_on < f.from) return false
    if (f.to && e.spent_on > f.to) return false
    if (f.receipt === 'has' && e.receipts.length === 0) return false
    if (f.receipt === 'none' && e.receipts.length > 0) return false
    return true
  })
}

const uniq = (a: string[]) => [...new Set(a)]

/** What there is to choose from, built from the group's own expenses so the panel never offers an empty choice. */
export function filterOptions(d: GroupData) {
  const cats = uniq(d.expenses.map(e => e.category || NO_CATEGORY)).sort((a, b) => a.localeCompare(b))
  const subsOf = (c: string) => uniq(d.expenses.filter(e => (e.category || NO_CATEGORY) === c && e.subcategory).map(e => e.subcategory as string)).sort((a, b) => a.localeCompare(b))
  const types = uniq(d.expenses.map(e => e.pay_type || NO_PAY_TYPE)).sort((a, b) => (a === NO_PAY_TYPE ? 1 : b === NO_PAY_TYPE ? -1 : a.localeCompare(b)))
  const paySubsOf = (t: string) => uniq(d.expenses.filter(e => (e.pay_type || NO_PAY_TYPE) === t).map(e => e.pay_subtype || NO_PAY_SUBTYPE)).sort((a, b) => (a === NO_PAY_SUBTYPE ? 1 : b === NO_PAY_SUBTYPE ? -1 : a.localeCompare(b)))
  const currencies = uniq(d.expenses.map(e => e.currency)).sort()
  const cards = uniq(d.expenses.map(e => cardOf(d, e))).sort()
  return { cats, subsOf, types, paySubsOf, currencies, cards, anyReceipts: d.expenses.some(e => e.receipts.length > 0) }
}

/** A short plain sentence for under the search box, e.g. "Estimated · Paid by Lavi · Credit card". */
export function describeFilters(d: GroupData, f: ExpenseFilters): string {
  const nm = (id: string) => d.travelers.find(t => t.id === id)?.name ?? 'someone'
  const rate = { norate: 'No rate set', estimated: 'Estimated', confirmed: 'Confirmed' }
  const parts: string[] = []
  if (f.rate.length) parts.push(f.rate.map(r => rate[r]).join(' or '))
  if (f.paidBy.length) parts.push('Paid by ' + f.paidBy.map(nm).join(' or '))
  if (f.splitWith.length) parts.push('Split with ' + f.splitWith.map(nm).join(' or '))
  if (f.category) parts.push(f.subcategory ? `${f.category} › ${f.subcategory}` : f.category)
  if (f.payType) parts.push(f.paySub ? `${f.payType} › ${f.paySub}` : f.payType)
  if (f.currency) parts.push('Bill in ' + f.currency)
  if (f.card) parts.push(f.card + ' card')
  if (f.from || f.to) parts.push(f.from && f.to ? `${f.from} to ${f.to}` : f.from ? `from ${f.from}` : `until ${f.to}`)
  if (f.receipt) parts.push(f.receipt === 'has' ? 'With receipt' : 'No receipt')
  return parts.join(' · ')
}
