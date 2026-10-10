import type { GroupData } from './types'
import { computeLedger } from './ledger'

/**
 * Cross-trip overview, from the signed-in user's point of view.
 * For every trip, the amount between ME and each other traveler comes from the trip's own
 * pair-by-pair ledger (so it matches the itemized view). Travelers in different trips are
 * treated as one person when they are the same account, share a name, or the user merged
 * them in the People screen. Amounts are never converted between currencies.
 */
export interface OverviewRow { date: string; text: string; amount: number; kind: 'share' | 'payment' }   // amount: + they owe me, - I owe them
export interface PersonTrip {
  groupId: string; groupName: string; currency: string; createdAt: string
  myId: string; theirId: string
  net: number                // + they owe me, - I owe them (minor units of the trip currency)
  pendingToMe: number        // they paid me; awaiting my confirmation
  pendingFromMe: number      // I paid them; awaiting theirs
  estimated: boolean
  rows: OverviewRow[]
}
export interface PersonCurrency { currency: string; net: number; trips: PersonTrip[] }
export interface Person { key: string; name: string; contactId: string | null; travelerIds: string[]; currencies: PersonCurrency[]; tripNames: string[]; hasPending: boolean }
export interface ContactInfo { id: string; name: string }
export interface Mapping { traveler_id: string; contact_id: string }

const defaultKey = (t: { user_id: string | null; name: string }) => (t.user_id ? `u:${t.user_id}` : `n:${t.name.trim().toLowerCase()}`)

function resolver(contacts: ContactInfo[], mappings: Mapping[]) {
  const contactById = new Map(contacts.map(c => [c.id, c]))
  const contactOf = new Map(mappings.map(m => [m.traveler_id, m.contact_id]))
  return (t: { id: string; user_id: string | null; name: string }) => {
    const cid = contactOf.get(t.id)
    const c = cid ? contactById.get(cid) : undefined
    return c ? { key: `c:${c.id}`, name: c.name, contactId: c.id } : { key: defaultKey(t), name: t.name, contactId: null as string | null }
  }
}

export function buildOverview(args: {
  groups: GroupData[]; userId: string; contacts: ContactInfo[]; mappings: Mapping[]
  includeEstimates: boolean; groupIds?: Set<string> | null
}): Person[] {
  const who = resolver(args.contacts, args.mappings)
  const people = new Map<string, Person>()
  const person = (key: string, name: string, contactId: string | null): Person => {
    let p = people.get(key)
    if (!p) { p = { key, name, contactId, travelerIds: [], currencies: [], tripNames: [], hasPending: false }; people.set(key, p) }
    return p
  }

  for (const g of args.groups) {
    if (args.groupIds && !args.groupIds.has(g.group.id)) continue
    const me = g.me
    if (!me) continue
    const cur = g.group.currency
    const R = computeLedger({ currency: cur, travelers: g.travelers, expenses: g.expenses, payments: g.payments, rates: g.rates, includeEstimates: args.includeEstimates })
    const trav = new Map(g.travelers.map(t => [t.id, t]))
    const nm = (id: string) => (id === me.id ? 'You' : trav.get(id)?.name ?? 'Someone')
    const perOther = new Map<string, PersonTrip>()
    const trip = (otherId: string): PersonTrip => {
      let x = perOther.get(otherId)
      if (!x) { x = { groupId: g.group.id, groupName: g.group.name, currency: cur, createdAt: g.group.created_at, myId: me.id, theirId: otherId, net: 0, pendingToMe: 0, pendingFromMe: 0, estimated: false, rows: [] }; perOther.set(otherId, x) }
      return x
    }

    for (const pair of R.pairs) {
      const sign = pair.creditor === me.id ? 1 : pair.debtor === me.id ? -1 : 0
      if (!sign) continue
      const x = trip(sign === 1 ? pair.debtor : pair.creditor)
      x.net = sign * pair.net
      for (const l of pair.lines) {
        const mine = (l.sign * sign) as 1 | -1
        const ln = l.line
        x.rows.push({
          date: ln.date, kind: ln.kind, amount: mine * ln.amount,
          text: ln.kind === 'share'
            ? `${ln.debtor === me.id ? 'Your' : nm(ln.debtor!) + '’s'} share · ${ln.vendor || 'Expense'} (${nm(ln.payer!)} paid)`
            : `Payment ${nm(ln.from!)} → ${nm(ln.to!)}`,
        })
        if (ln.kind === 'share' && ln.expenseId && R.calc[ln.expenseId]?.status === 'estimated') x.estimated = true
      }
    }
    for (const p of R.pendingPayments) {
      if (p.from === me.id) trip(p.to).pendingFromMe += p.amount
      else if (p.to === me.id) trip(p.from).pendingToMe += p.amount
    }

    for (const [otherId, x] of perOther) {
      if (x.net === 0 && !x.pendingToMe && !x.pendingFromMe) continue
      const t = trav.get(otherId)
      if (!t) continue
      const w = who(t)
      const pr = person(w.key, w.name, w.contactId)
      if (!pr.travelerIds.includes(otherId)) pr.travelerIds.push(otherId)
      if (!pr.tripNames.includes(g.group.name)) pr.tripNames.push(g.group.name)
      if (x.pendingToMe || x.pendingFromMe) pr.hasPending = true
      let pc = pr.currencies.find(c => c.currency === cur)
      if (!pc) { pc = { currency: cur, net: 0, trips: [] }; pr.currencies.push(pc) }
      pc.trips.push(x); pc.net += x.net
    }
  }
  const out = [...people.values()].filter(p => p.currencies.some(c => c.net !== 0) || p.hasPending)
  out.forEach(p => { p.currencies.sort((a, b) => a.currency.localeCompare(b.currency)); p.currencies.forEach(c => c.trips.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) })
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Every other traveler across the user's trips, grouped into people (for the merge / split screen). */
export interface PersonRef { key: string; name: string; contactId: string | null; travelers: Array<{ id: string; name: string; groupId: string; groupName: string }> }
export function listPeople(args: { groups: GroupData[]; userId: string; contacts: ContactInfo[]; mappings: Mapping[] }): PersonRef[] {
  const who = resolver(args.contacts, args.mappings)
  const map = new Map<string, PersonRef>()
  for (const g of args.groups) {
    if (!g.me) continue
    for (const t of g.travelers) {
      if (t.id === g.me.id) continue
      const w = who(t)
      let p = map.get(w.key)
      if (!p) { p = { key: w.key, name: w.name, contactId: w.contactId, travelers: [] }; map.set(w.key, p) }
      p.travelers.push({ id: t.id, name: t.name, groupId: g.group.id, groupName: g.group.name })
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Spread one payment across trips, oldest trip first. Nothing exceeds what that trip owes. */
export function allocateAcrossTrips(trips: Array<{ key: string; max: number }>, amount: number): { allocs: Record<string, number>; leftover: number } {
  const allocs: Record<string, number> = {}
  let left = amount
  for (const t of trips) { const a = Math.max(0, Math.min(t.max, left)); allocs[t.key] = a; left -= a }
  return { allocs, leftover: left }
}

export interface CurrencyTotals { currency: string; owedToMe: number; iOwe: number; net: number }
export function totalsByCurrency(people: Person[]): CurrencyTotals[] {
  const m = new Map<string, CurrencyTotals>()
  for (const p of people) for (const c of p.currencies) {
    const t = m.get(c.currency) ?? { currency: c.currency, owedToMe: 0, iOwe: 0, net: 0 }
    if (c.net > 0) t.owedToMe += c.net; else t.iOwe += -c.net
    t.net += c.net; m.set(c.currency, t)
  }
  return [...m.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}
