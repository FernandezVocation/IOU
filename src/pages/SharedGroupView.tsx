import { useEffect, useMemo, useState } from 'react'
import { computeLedger } from '../lib/ledger'
import { buildBreakdown, type BreakdownRow } from '../lib/breakdown'
import { catLabel } from '../lib/categories'
import { fmtMoney, toMinor } from '../lib/money'
import { fmtDate, fmtTime } from '../lib/format'
import { openReceiptSession, sharedToGroupData, signedReceiptUrls, type SharedTrip } from '../lib/shared'
import BreakdownList, { CategoryBar } from '../components/BreakdownList'
import type { Expense } from '../lib/types'

type Tab = 'expenses' | 'breakdown' | 'balances' | 'receipts'
const noLinks = (rows: BreakdownRow[]): BreakdownRow[] => rows.map(r => ({ ...r, href: undefined, kids: r.kids ? noLinks(r.kids) : undefined }))

/** The whole group, read-only, for anyone holding a group-wide link. */
export default function SharedGroupView({ trip, token, at, stale, onRefresh }: { trip: SharedTrip; token: string; at: Date; stale: boolean; onRefresh: () => void }) {
  const { data } = useMemo(() => sharedToGroupData(trip), [trip])
  const cur = data.group.currency
  const [tab, setTab] = useState<Tab>('expenses')
  const [mode, setMode] = useState<'itemized' | 'fewest'>('itemized')
  const R = useMemo(() => computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: true }), [data, cur])
  const name = (id: string) => data.travelers.find(t => t.id === id)?.name ?? 'Someone'
  const bd = useMemo(() => buildBreakdown(data, 'category', 'total'), [data])

  const withReceipts = data.expenses.filter(e => e.receipts.length > 0)
  const paths = useMemo(() => withReceipts.flatMap(e => e.receipts.map(r => r.path)), [withReceipts])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [receiptsOk, setReceiptsOk] = useState<boolean | null>(null)
  const key = paths.join('|')
  useEffect(() => {
    if (!key) { setReceiptsOk(true); return }
    let alive = true
    openReceiptSession(token).then(async c => {
      if (!alive) return
      if (!c) { setReceiptsOk(false); return }
      const u = await signedReceiptUrls(c, key.split('|'))
      if (alive) { setUrls(u); setReceiptsOk(true) }
    })
    return () => { alive = false }
  }, [key, token])

  const sorted = [...data.expenses].sort((a, b) => b.spent_on.localeCompare(a.spent_on) || (b.spent_at ?? '').localeCompare(a.spent_at ?? ''))
  const days = new Map<string, Expense[]>()
  sorted.forEach(e => days.set(e.spent_on, [...(days.get(e.spent_on) ?? []), e]))

  const Thumbs = ({ e }: { e: Expense }) => (
    <div className="thumbs">
      {e.receipts.map(r => urls[r.path]
        ? (r.mime === 'application/pdf'
          ? <a key={r.id} className="th" href={urls[r.path]} target="_blank" rel="noopener noreferrer">PDF</a>
          : <a key={r.id} className="th" href={urls[r.path]} target="_blank" rel="noopener noreferrer"><img src={urls[r.path]} alt={r.name ?? 'Receipt'} /></a>)
        : <span key={r.id} className="th">{receiptsOk === false ? '–' : '…'}</span>)}
    </div>
  )

  return (
    <div className="app" style={{ paddingBottom: 40 }}>
      <div className="top">
        <div>
          <div className="muted small" style={{ marginBottom: 4 }}>Read-only view of the whole group</div>
          <h1>{data.group.name}</h1>
          <div className="sub">{data.travelers.length} people · {cur} · updated {at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <button className="btn small" onClick={onRefresh}>Refresh</button>
      </div>
      {stale && <div className="notice" role="status">Couldn’t refresh just now. These numbers are from {at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</div>}

      <div className="panel">
        <div className="total">
          <div><div className="muted small">Group total</div><div className="big">{fmtMoney(R.total, cur)}</div></div>
          <div className="muted small" style={{ textAlign: 'right' }}>{data.expenses.length} expense{data.expenses.length === 1 ? '' : 's'}{R.counts.estimated > 0 && <><br /><span className="tag">{R.counts.estimated} estimated</span></>}</div>
        </div>
      </div>

      <div className="seg fit" role="group" aria-label="Sections" style={{ marginBottom: 12 }}>
        <button aria-pressed={tab === 'expenses'} onClick={() => setTab('expenses')}>Expenses</button>
        <button aria-pressed={tab === 'breakdown'} onClick={() => setTab('breakdown')}>Breakdown</button>
        <button aria-pressed={tab === 'balances'} onClick={() => setTab('balances')}>Balances</button>
        <button aria-pressed={tab === 'receipts'} onClick={() => setTab('receipts')}>Receipts</button>
      </div>

      {tab === 'expenses' && (
        <>
          {!sorted.length && <div className="empty"><b>No expenses yet</b></div>}
          {[...days.keys()].sort().reverse().map(d => (
            <div key={d}>
              <div className="day"><span>{fmtDate(d)}</span><span>{fmtMoney((days.get(d) ?? []).reduce((s, e) => s + (R.calc[e.id]?.minor ?? 0), 0), cur)}</span></div>
              {(days.get(d) ?? []).map(e => {
                const c = R.calc[e.id]
                const shares = data.travelers.map(t => ({ t, share: R.rows[t.id]?.find(r => r.expenseId === e.id)?.share ?? 0 })).filter(x => x.share > 0)
                return (
                  <details className="pair" key={e.id}>
                    <summary>
                      <span>{e.vendor || 'Untitled'}<br /><span className="muted small">{[catLabel(e), fmtTime(e.spent_at), `${name(e.payer_id)} paid`].filter(Boolean).join(' · ')}</span></span>
                      <span>{fmtMoney(toMinor(e.amount, e.currency), e.currency)}</span>
                    </summary>
                    <div className="why">
                      {e.currency !== cur && c?.minor != null && <div className="muted small">{fmtMoney(c.minor, cur)}{c.status === 'estimated' ? ' (estimated)' : ''}</div>}
                      {e.location && <div className="muted small">{e.location}</div>}
                      {e.notes && <div className="small" style={{ fontStyle: 'italic', margin: '4px 0' }}>{e.notes}</div>}
                      {shares.map(x => <div className="ln" key={x.t.id}><span>{x.t.name}’s share</span><span className="a">{fmtMoney(x.share, cur)}</span></div>)}
                      {e.receipts.length > 0 && <Thumbs e={e} />}
                    </div>
                  </details>
                )
              })}
            </div>
          ))}
        </>
      )}

      {tab === 'breakdown' && (
        bd.total > 0 ? (
          <>
            <div className="panel"><div className="muted small">Total spent</div><div style={{ font: '700 30px/1.1 var(--display)' }}>{fmtMoney(bd.total, cur)}</div><CategoryBar cats={bd.cats} total={bd.total} /></div>
            <div className="panel" style={{ paddingBlock: 4 }}><BreakdownList rows={noLinks(bd.rows)} total={bd.total} currency={cur} swatch /></div>
          </>
        ) : <div className="empty"><b>Nothing to show yet</b></div>
      )}

      {tab === 'balances' && (
        <>
          <div className="panel">
            <h2>Everyone</h2>
            {data.travelers.map(t => {
              const b = R.balance[t.id] ?? 0
              return <div className="ln" key={t.id}><span><b>{t.name}</b><br /><span className="muted small">paid {fmtMoney(R.paid[t.id] ?? 0, cur)} · share {fmtMoney(R.share[t.id] ?? 0, cur)}</span></span><span className={'a ' + (b > 0 ? 'pos-t' : b < 0 ? 'neg-t' : '')}><b>{b === 0 ? 'settled' : (b > 0 ? 'is owed ' : 'owes ') + fmtMoney(Math.abs(b), cur)}</b></span></div>
            })}
          </div>
          <div className="sect">
            <h2>Who pays whom</h2>
            <div className="seg" role="group" style={{ margin: '8px 0' }}>
              <button aria-pressed={mode === 'itemized'} onClick={() => setMode('itemized')}>Itemized</button>
              <button aria-pressed={mode === 'fewest'} onClick={() => setMode('fewest')}>Fewest payments</button>
            </div>
            <div className="panel">
              {mode === 'itemized'
                ? (R.pairs.length ? R.pairs.map(p => <div className="ln" key={p.debtor + p.creditor}><span>{name(p.debtor)} owes {name(p.creditor)}</span><span className="a"><b>{fmtMoney(p.net, cur)}</b></span></div>) : <div className="muted">All square.</div>)
                : (R.transfers.length ? R.transfers.map(t => <div className="ln" key={t.from + t.to}><span>{name(t.from)} owes {name(t.to)}</span><span className="a"><b>{fmtMoney(t.amount, cur)}</b></span></div>) : <div className="muted">All square.</div>)}
            </div>
          </div>
          {data.payments.length > 0 && (
            <div className="sect">
              <h2>Payments</h2>
              <div className="panel">{[...data.payments].sort((a, b) => b.paid_on.localeCompare(a.paid_on)).map(p => <div className="ln" key={p.id}><span>{name(p.from_id)} → {name(p.to_id)} {p.status === 'pending' && <span className="tag pending">Sent</span>}<br /><span className="muted small">{fmtDate(p.paid_on)}</span></span><span className="a">{fmtMoney(toMinor(p.amount, cur), cur)}</span></div>)}</div>
            </div>
          )}
        </>
      )}

      {tab === 'receipts' && (
        <>
          {receiptsOk === false && <div className="notice">Receipt photos can’t be shown right now. The group owner may need to switch on anonymous sign-ins in Supabase.</div>}
          {!withReceipts.length && <div className="empty"><b>No receipts attached</b></div>}
          {withReceipts.map(e => (
            <div className="panel" key={e.id}>
              <div className="ln" style={{ borderTop: 0 }}><span><b>{e.vendor || 'Untitled'}</b><br /><span className="muted small">{fmtDate(e.spent_on)} · {name(e.payer_id)} paid</span></span><span className="a">{fmtMoney(toMinor(e.amount, e.currency), e.currency)}</span></div>
              <Thumbs e={e} />
            </div>
          ))}
        </>
      )}

      <div className="muted small" style={{ marginTop: 18 }}>This page is read-only and updates when the group does. If something looks wrong, tell the group organizer.</div>
    </div>
  )
}
