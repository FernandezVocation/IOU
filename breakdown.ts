import { computeLedger } from './ledger'
import { catLabel, NO_CATEGORY } from './categories'
import { fmtDate, fmtTime } from './format'
import type { GroupData } from './types'

export type By = 'category' | 'sub' | 'date' | 'vendor'
export type Metric = 'total' | 'mine'

export interface BreakdownRow {
  key: string
  label: string
  meta?: string
  /** Amount in the group's currency, minor units. */
  minor: number
  count: number
  /** Category name, used for the colour swatch. Absent for date and vendor rows. */
  category?: string
  estimated: boolean
  kids?: BreakdownRow[]
  /** An individual expense (or, in the overview, one group). */
  leaf?: boolean
  href?: string
}

export interface Breakdown {
  rows: BreakdownRow[]
  total: number
  /** Category totals, biggest first, for the stacked bar. */
  cats: Array<{ category: string; minor: number }>
  /** Expenses left out because the group has no exchange rate for them. */
  missing: number
  /** Expenses left out of "My share" because the person is not part of the split. */
  notMine: number
  estimated: number
}

interface Item {
  id: string
  date: string
  time: string | null
  vendor: string
  description: string
  category: string
  subcategory: string
  minor: number
  estimated: boolean
}

/** Every expense that counts, with its amount (whole, or only the signed-in person's share) in the group currency. */
function itemsOf(d: GroupData, metric: Metric): { items: Item[]; missing: number; notMine: number } {
  const R = computeLedger({ currency: d.group.currency, travelers: d.travelers, expenses: d.expenses, payments: [], rates: d.rates, includeEstimates: true })
  const myRows = d.me ? new Map((R.rows[d.me.id] ?? []).map(r => [r.expenseId, r])) : new Map()
  const items: Item[] = []
  let missing = 0, notMine = 0
  for (const e of d.expenses) {
    const c = R.calc[e.id]
    if (!c || c.status === 'norate' || c.minor == null) { missing++; continue }
    let minor = c.minor
    if (metric === 'mine') {
      const share = myRows.get(e.id)?.share ?? 0
      if (share <= 0) { notMine++; continue }
      minor = share
    }
    items.push({ id: e.id, date: e.spent_on, time: e.spent_at, vendor: e.vendor, description: e.description ?? '', category: e.category, subcategory: e.subcategory ?? '', minor, estimated: c.status === 'estimated' })
  }
  return { items, missing, notMine }
}

const sum = (a: Item[]) => a.reduce((s, x) => s + x.minor, 0)
const anyEst = (a: Item[]) => a.some(x => x.estimated)
const byMinor = (a: BreakdownRow, b: BreakdownRow) => b.minor - a.minor || a.label.localeCompare(b.label)

function groupBy<T>(arr: T[], f: (x: T) => string): Array<[string, T[]]> {
  const m = new Map<string, T[]>()
  for (const x of arr) { const k = f(x); const l = m.get(k); if (l) l.push(x); else m.set(k, [x]) }
  return [...m]
}

/** What the group spent, grouped by category, sub-category, date or vendor, with the expenses behind each row. */
export function buildBreakdown(d: GroupData, by: By, metric: Metric): Breakdown {
  const { items, missing, notMine } = itemsOf(d, metric)
  const base = '/g/' + d.group.id + '/expense/'
  const leaves = (arr: Item[], pk: string): BreakdownRow[] =>
    [...arr].sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))).map(x => ({
      key: pk + '/' + x.id, label: x.vendor || '(no vendor)', minor: x.minor, count: 1, leaf: true, estimated: x.estimated, category: x.category, href: base + x.id,
      meta: (by === 'date' ? [x.description, fmtTime(x.time), catLabel(x)] : [x.description, fmtDate(x.date), by === 'category' ? '' : catLabel(x)]).filter(Boolean).join(' · '),
    }))

  let rows: BreakdownRow[]
  if (by === 'category') {
    rows = groupBy(items, x => x.category || NO_CATEGORY).map(([cat, arr]) => ({
      key: cat, label: cat, minor: sum(arr), count: arr.length, category: cat === NO_CATEGORY ? '' : cat, estimated: anyEst(arr),
      kids: groupBy(arr, x => x.subcategory || 'No sub-category').map(([sc, a2]) => ({
        key: cat + '|' + sc, label: sc, minor: sum(a2), count: a2.length, estimated: anyEst(a2), kids: leaves(a2, cat + '|' + sc),
      })).sort(byMinor),
    })).sort(byMinor)
  } else if (by === 'sub') {
    rows = groupBy(items, x => (x.category || NO_CATEGORY) + '|' + x.subcategory).map(([k, arr]) => ({
      key: k, label: arr[0].subcategory || 'No sub-category', meta: arr[0].category || NO_CATEGORY, minor: sum(arr), count: arr.length,
      category: arr[0].category, estimated: anyEst(arr), kids: leaves(arr, k),
    })).sort(byMinor)
  } else if (by === 'date') {
    rows = groupBy(items, x => x.date).map(([k, arr]) => ({
      key: k, label: fmtDate(k), minor: sum(arr), count: arr.length, estimated: anyEst(arr), kids: leaves(arr, k),
    })).sort((a, b) => a.key.localeCompare(b.key))
  } else {
    rows = groupBy(items, x => x.vendor || '(no vendor)').map(([k, arr]) => ({
      key: k, label: k, meta: catLabel(arr[0]), minor: sum(arr), count: arr.length, estimated: anyEst(arr), kids: leaves(arr, k),
    })).sort(byMinor)
  }
  const cats = groupBy(items, x => x.category || NO_CATEGORY).map(([c, arr]) => ({ category: c === NO_CATEGORY ? '' : c, minor: sum(arr) })).sort((a, b) => b.minor - a.minor)
  return { rows, total: sum(items), cats, missing, notMine, estimated: items.filter(x => x.estimated).length }
}

export interface CurrencyBreakdown {
  currency: string
  total: number
  groupCount: number
  rows: BreakdownRow[]
  cats: Array<{ category: string; minor: number }>
}

/**
 * The category breakdown across several groups. Each currency is added up on its own and never converted.
 * Every category row opens to show which groups it came from.
 */
export function buildOverviewBreakdown(groups: GroupData[], metric: Metric): CurrencyBreakdown[] {
  const out = new Map<string, { groups: Set<string>; cats: Map<string, Map<string, { name: string; id: string; minor: number; count: number; est: boolean }>> }>()
  for (const g of groups) {
    if (!g.me) continue
    const { items } = itemsOf(g, metric)
    if (!items.length) continue
    const cur = g.group.currency
    const c = out.get(cur) ?? { groups: new Set<string>(), cats: new Map() }
    out.set(cur, c)
    c.groups.add(g.group.id)
    for (const x of items) {
      const cat = x.category || NO_CATEGORY
      const per = c.cats.get(cat) ?? new Map()
      c.cats.set(cat, per)
      const cell = per.get(g.group.id) ?? { name: g.group.name, id: g.group.id, minor: 0, count: 0, est: false }
      cell.minor += x.minor; cell.count++; cell.est = cell.est || x.estimated
      per.set(g.group.id, cell)
    }
  }
  return [...out].map(([currency, v]) => {
    const rows: BreakdownRow[] = [...v.cats].map(([cat, per]) => {
      const kids: BreakdownRow[] = [...per.values()].map(x => ({
        key: currency + '|' + cat + '|' + x.id, label: x.name, minor: x.minor, count: x.count, leaf: true, estimated: x.est, href: '/g/' + x.id + '/breakdown',
      })).sort(byMinor)
      return { key: currency + '|' + cat, label: cat, minor: kids.reduce((s, k) => s + k.minor, 0), count: kids.reduce((s, k) => s + k.count, 0), category: cat === NO_CATEGORY ? '' : cat, estimated: kids.some(k => k.estimated), kids }
    }).sort(byMinor)
    return { currency, total: rows.reduce((s, r) => s + r.minor, 0), groupCount: v.groups.size, rows, cats: rows.map(r => ({ category: r.category ?? '', minor: r.minor })) }
  }).sort((a, b) => a.currency.localeCompare(b.currency))
}
