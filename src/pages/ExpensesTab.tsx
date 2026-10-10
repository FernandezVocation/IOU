import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { computeLedger, type Calc } from '../lib/ledger'
import { fmtMoney, toMinor } from '../lib/money'
import { fmtDate, fmtTime } from '../lib/format'
import { catLabel } from '../lib/categories'
import type { Expense } from '../lib/types'
import { useGroup, who } from './GroupShell'

const clipIcon = <svg className="i" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}><path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10 18a1.7 1.7 0 0 1-2.4-2.4L15 8" /></svg>

export default function ExpensesTab() {
  const { data } = useGroup()
  const cur = data.group.currency
  const [q, setQ] = useState('')
  const [needOnly, setNeedOnly] = useState(false)
  const R = useMemo(() => computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: true }), [data, cur])
  const needs = data.expenses.filter(e => R.calc[e.id]?.status !== 'confirmed')

  if (!data.travelers.length) {
    return <div className="empty"><b>Add the people first</b>Open More, then Group settings, and add everyone who is splitting costs.</div>
  }

  let list = [...data.expenses]
  if (needOnly) list = list.filter(e => R.calc[e.id]?.status !== 'confirmed')
  const s = q.trim().toLowerCase()
  if (s) list = list.filter(e => [e.vendor, e.description ?? '', e.location, e.category, e.subcategory ?? '', e.notes, who(data, e.payer_id, false)].join(' ').toLowerCase().includes(s))
  list.sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.spent_at ?? '').localeCompare(a.spent_at ?? '') || b.created_at.localeCompare(a.created_at))

  const groups = new Map<string, Expense[]>()
  list.forEach(e => groups.set(e.spent_on, [...(groups.get(e.spent_on) ?? []), e]))

  return (
    <>
      <div className="panel">
        <div className="total">
          <div><div className="muted small">Group total</div><div className="big">{fmtMoney(R.total, cur)}</div></div>
          <div className="muted small" style={{ textAlign: 'right' }}>
            {data.expenses.length} expense{data.expenses.length === 1 ? '' : 's'}
            {R.counts.estimated > 0 && <><br /><span className="tag">{R.counts.estimated} estimated</span></>}
          </div>
        </div>
      </div>
      {needs.length > 0 && <div className="notice">{needs.length} expense{needs.length === 1 ? '' : 's'} in another currency still need the {cur} amount from your card statement.</div>}
      <input type="search" className="inp" placeholder="Search vendor, description, place, category, notes" value={q} onChange={e => setQ(e.target.value)} aria-label="Search expenses" />
      <div className="chips"><button className="chip" aria-pressed={needOnly} onClick={() => setNeedOnly(v => !v)}>Needs {cur} amount ({needs.length})</button></div>
      {!list.length && <div className="empty"><b>{data.expenses.length ? 'Nothing matches' : 'No expenses yet'}</b>{data.expenses.length ? 'Try a different search.' : 'Tap + to log the first one.'}</div>}
      {[...groups.keys()].sort().reverse().map(d => {
        const items = groups.get(d) ?? []
        const tot = items.reduce((sum, e) => sum + (R.calc[e.id]?.minor ?? 0), 0)
        return (
          <div key={d}>
            <div className="day"><span>{fmtDate(d)}</span><span>{fmtMoney(tot, cur)}</span></div>
            {items.map(e => <Row key={e.id} e={e} c={R.calc[e.id]} />)}
          </div>
        )
      })}
    </>
  )
}

function Row({ e, c }: { e: Expense; c: Calc }) {
  const { data } = useGroup()
  const cur = data.group.currency
  const foreign = e.currency !== cur
  const n = e.splits.length
  const meta = [e.description, catLabel(e), fmtTime(e.spent_at), `${who(data, e.payer_id)} paid`].filter(Boolean).join(' · ')
  const split = e.split_mode === 'equal' ? `split ${n} way${n === 1 ? '' : 's'}` : 'custom split'
  return (
    <Link className="exp" to={`/g/${data.group.id}/expense/${e.id}`}>
      <div className="v">{e.vendor || 'Untitled'}</div>
      <div className="amt">{fmtMoney(toMinor(e.amount, e.currency), e.currency)}</div>
      <div className="m">{meta}{e.receipts.length > 0 && <> · <span className="clip">{clipIcon}{e.receipts.length}</span></>}</div>
      {foreign ? (c.status === 'confirmed' ? <div className="sb">{fmtMoney(c.minor as number, cur)}</div>
        : c.status === 'estimated' ? <div className="sb est">≈ {fmtMoney(c.minor as number, cur)} est.</div>
        : <div className="sb est">no rate set</div>) : <div />}
      <div className="m">{split}{e.location ? ' · ' + e.location : ''}</div>
    </Link>
  )
}
