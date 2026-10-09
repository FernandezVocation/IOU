import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeLedger, type LedgerResult, type Pair, type PairLine } from '../lib/ledger'
import { fmtMoney, fmtPlain, toMinor } from '../lib/money'
import { friendly, fmtDate } from '../lib/format'
import { paymentHistory, paymentPerms, statusLabel } from '../lib/payments'
import type { GroupData, Payment } from '../lib/types'
import { useAuth } from '../lib/auth'
import { ConfirmDialog, Sheet, useToast } from '../components/ui'
import PaymentSheet from '../components/PaymentSheet'
import { useGroup, verbOwe, who } from './GroupShell'

function lineText(data: GroupData, l: PairLine): string {
  const x = l.line
  if (x.kind === 'share') {
    const poss = data.me?.id === x.debtor ? 'Your' : who(data, x.debtor!, false) + '’s'
    return `${poss} share · ${x.vendor || 'Expense'} (${who(data, x.payer!)} paid)`
  }
  return `Payment ${who(data, x.from!)} → ${who(data, x.to!)}`
}

const PAIR_TAG: Record<Pair['status'], string> = { unpaid: 'Unpaid', partial: 'Partly paid', pending: 'Pending', paid: 'Paid' }

function Statement({ data, R, id }: { data: GroupData; R: LedgerResult; id: string }) {
  const cur = data.group.currency
  const b = R.balance[id]
  return (
    <>
      <div className="ln"><span>Paid for the group</span><span className="a">{fmtMoney(R.paid[id], cur)}</span></div>
      <div className="ln"><span>Share of all costs</span><span className="a">− {fmtMoney(R.share[id], cur)}</span></div>
      <div className="ln"><span>Payments sent / received</span><span className="a">{fmtMoney(R.sent[id], cur)} / {fmtMoney(R.received[id], cur)}</span></div>
      <div className="ln tot"><span>Balance</span><span className={'a ' + (b >= 0 ? 'pos-t' : 'neg-t')}>{b >= 0 ? 'is owed ' : 'owes '}{fmtMoney(Math.abs(b), cur)}</span></div>
    </>
  )
}

export default function BalancesTab() {
  const { data, reload } = useGroup()
  const { user } = useAuth()
  const toast = useToast()
  const cur = data.group.currency
  const me = user?.id ?? ''
  const [includeEst, setIncludeEst] = useState(true)
  const [pairMode, setPairMode] = useState<'itemized' | 'fewest'>('itemized')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [statementId, setStatementId] = useState<string | null>(null)
  // null = closed; {} = new blank payment; {from,to} = suggested; {payment} = editing
  const [sheet, setSheet] = useState<null | { from?: string; to?: string; payment?: Payment }>(null)
  const [tick, setTick] = useState<{ p: Payment; on: boolean } | null>(null)
  const [tickBusy, setTickBusy] = useState(false)

  const R = useMemo(() => computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: includeEst }), [data, cur, includeEst])
  if (!data.travelers.length) return <div className="empty"><b>No travelers yet</b>Add people in the Trip tab first.</div>

  const max = Math.max(1, ...data.travelers.map(t => Math.abs(R.balance[t.id])))
  const unsettled = R.counts.estimated + R.counts.missing
  const pendingTotal = R.pendingPayments.reduce((s, x) => s + x.amount, 0)
  const toggle = (k: string) => setOpen(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const sorted = [...data.payments].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || b.paid_on.localeCompare(a.paid_on))

  // The "Received" tick box: ticking asks first (so a stray tap can't settle a debt), and it can be undone.
  async function setReceived(p: Payment, on: boolean) {
    setTickBusy(true)
    const { error } = await supabase.rpc(on ? 'confirm_payment' : 'unconfirm_payment', { p_id: p.id })
    setTickBusy(false); setTick(null)
    if (error) toast(friendly(error)); else { toast(on ? 'Marked as received.' : 'Marked as not received.'); reload() }
  }

  const Tag = ({ s }: { s: Pair['status'] }) => <span className={'tag ' + s}>{PAIR_TAG[s]}</span>
  const PayBtn = ({ from, to }: { from: string; to: string }) => (
    <div className="pay"><button className="btn small" onClick={() => setSheet({ from, to })}>Record payment</button></div>
  )
  const Lines = ({ p }: { p: Pair }) => (
    <>
      {p.lines.map((l, i) => (
        <div className="ln" key={i}>
          <span>{lineText(data, l)}<br /><span className="muted small">{fmtDate(l.line.date)}</span></span>
          <span className={'a ' + (l.sign > 0 ? '' : 'pos-t')}>{l.sign > 0 ? '' : '− '}{fmtMoney(l.line.amount, cur)}</span>
        </div>
      ))}
      <div className="ln tot"><span>{p.net === 0 ? 'Net (all paid)' : 'Net still owed'}</span><span className="a">{fmtMoney(p.net, cur)}</span></div>
    </>
  )

  return (
    <>
      <div className="panel">
        <label className="switch"><input type="checkbox" checked={includeEst} onChange={e => setIncludeEst(e.target.checked)} /><span>Include estimated amounts</span></label>
        <div className="muted small">{unsettled ? `${R.counts.estimated} estimated at your trip rates${R.counts.missing ? `, ${R.counts.missing} with no rate (not counted)` : ''}. Enter the ${cur} amount on each to make it final.` : 'Every amount is confirmed.'}</div>
      </div>
      {pendingTotal > 0 && <div className="notice">{fmtMoney(pendingTotal, cur)} in recorded payments {R.pendingPayments.length === 1 ? 'is' : 'are'} waiting for the receiver to confirm, so {R.pendingPayments.length === 1 ? 'it isn’t' : 'they aren’t'} counted below yet.</div>}

      <div className="sect" style={{ marginTop: 8 }}>
        <h2>Who is ahead</h2>
        <div className="muted small">Green: owed money. Red: owes money. Tap a name for their full statement.</div>
      </div>
      <div className="panel">
        {data.travelers.map(t => {
          const b = R.balance[t.id], w = Math.round((Math.abs(b) / max) * 50)
          return (
            <button className="dv" key={t.id} onClick={() => setStatementId(t.id)}>
              <span className="nm">{who(data, t.id)}</span>
              <span className="tr"><i className={'bar ' + (b >= 0 ? 'pos' : 'neg')} style={{ width: b === 0 ? 0 : Math.max(w, 2) + '%' }} /></span>
              <span className={'am ' + (b > 0 ? 'pos-t' : b < 0 ? 'neg-t' : '')}>{b > 0 ? '+' : b < 0 ? '−' : ''}{fmtPlain(Math.abs(b), cur)}</span>
            </button>
          )
        })}
        <div className="legend"><span>owes</span><span>owed</span></div>
      </div>

      <div className="sect">
        <h2>Who pays whom</h2>
        <div className="seg" role="group" style={{ margin: '8px 0' }}>
          <button aria-pressed={pairMode === 'itemized'} onClick={() => setPairMode('itemized')}>Itemized</button>
          <button aria-pressed={pairMode === 'fewest'} onClick={() => setPairMode('fewest')}>Fewest payments</button>
        </div>
        <div className="muted small">{pairMode === 'itemized' ? 'Each pair settles directly, so every amount traces to specific expenses.' : 'The fewest transfers that square everyone up. Amounts come from each person’s balance.'}</div>

        {pairMode === 'itemized' ? (
          <>
            {!R.pairs.length && <div className="empty"><b>All square</b>Nobody owes anybody right now.</div>}
            {R.pairs.map(p => {
              const k = 'p:' + p.debtor + '>' + p.creditor
              return (
                <details className="pair" key={k} open={open.has(k)} onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open !== open.has(k)) toggle(k) }}>
                  <summary><span>{who(data, p.debtor)} {verbOwe(data, p.debtor)} {who(data, p.creditor)} <Tag s={p.status} /></span><span>{fmtMoney(p.net, cur)}</span></summary>
                  <div className="why">
                    <Lines p={p} />
                    {p.pending > 0 && <div className="muted small" style={{ marginTop: 6 }}>{fmtMoney(p.pending, cur)} more has been paid but isn’t confirmed yet.</div>}
                    <PayBtn from={p.debtor} to={p.creditor} />
                  </div>
                </details>
              )
            })}
            {R.settledPairs.length > 0 && (
              <>
                <div className="day"><span>Paid up</span><span>{R.settledPairs.length}</span></div>
                {R.settledPairs.map(p => {
                  const k = 's:' + p.debtor + '>' + p.creditor
                  return (
                    <details className="pair" key={k} open={open.has(k)} onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open !== open.has(k)) toggle(k) }}>
                      <summary><span>{who(data, p.debtor)} &amp; {who(data, p.creditor)} <Tag s="paid" /></span><span>{fmtMoney(0, cur)}</span></summary>
                      <div className="why"><Lines p={p} /></div>
                    </details>
                  )
                })}
              </>
            )}
          </>
        ) : (
          <>
            {!R.transfers.length && <div className="empty"><b>All square</b>Nobody owes anybody right now.</div>}
            {R.transfers.map(t => {
              const k = 'f:' + t.from + '>' + t.to
              return (
                <details className="pair" key={k} open={open.has(k)} onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open !== open.has(k)) toggle(k) }}>
                  <summary><span>{who(data, t.from)} {verbOwe(data, t.from)} {who(data, t.to)}</span><span>{fmtMoney(t.amount, cur)}</span></summary>
                  <div className="why">
                    <div className="small muted" style={{ margin: '0 0 6px' }}>{who(data, t.from, false)}</div>
                    <Statement data={data} R={R} id={t.from} />
                    <div className="small muted" style={{ margin: '12px 0 6px' }}>{who(data, t.to, false)}</div>
                    <Statement data={data} R={R} id={t.to} />
                    <PayBtn from={t.from} to={t.to} />
                  </div>
                </details>
              )
            })}
          </>
        )}
      </div>

      <div className="sect">
        <div className="prow" style={{ justifyContent: 'space-between', margin: 0 }}>
          <h2>Payments</h2>
          <button className="btn small primary" onClick={() => setSheet({})}>Record a payment</button>
        </div>
        {!sorted.length && <div className="empty"><b>No payments yet</b>When someone pays someone back, record it here.</div>}
        {sorted.map(p => {
          const perms = paymentPerms(data, p, me)
          const pending = p.status === 'pending'
          return (
            <div className="panel pcard" key={p.id}>
              <div className="phead"><b>{who(data, p.from_id)} → {who(data, p.to_id)}</b><span className={'tag ' + (pending ? 'pending' : 'paid')}>{statusLabel(p)}</span></div>
              <div className="pamt">{fmtMoney(toMinor(p.amount, cur), cur)}</div>
              <div className="muted small">{fmtDate(p.paid_on)}{p.method ? ` · ${p.method}` : ''}</div>
              {p.note && <div className="small" style={{ marginTop: 4 }}>“{p.note}”</div>}
              <div className="hist">
                {paymentHistory(data, p, me).map(h => <div className="muted small" key={h}>{h}</div>)}
                {pending && <div className="small" style={{ color: 'var(--est)', marginTop: 2 }}>{perms.confirmHint}</div>}
              </div>
              <div className="acts">
                {(perms.canConfirm || perms.canUnconfirm) && (
                  <label className="switch rbox">
                    <input type="checkbox" checked={!pending} onChange={e => setTick({ p, on: e.target.checked })} />
                    <span>{pending ? (data.me?.id === p.to_id ? 'I received this' : `${who(data, p.to_id, false)} received this (confirm for them)`) : 'Received'}</span>
                  </label>
                )}
                <button className="btn small" onClick={() => setSheet({ payment: p })}>{perms.canEdit ? 'Edit' : 'Details'}</button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="sect">
        <h2>Reports & invoices</h2>
        <div className="muted small">Download the full trip report, or create an itemized invoice for any person or couple to send.</div>
        <Link className="btn primary block" style={{ marginTop: 10 }} to={`/g/${data.group.id}/reports`}>Open reports</Link>
      </div>

      {sheet && <PaymentSheet payment={sheet.payment} from={sheet.from} to={sheet.to} onClose={() => setSheet(null)} />}

      {statementId && (
        <Sheet title={`${who(data, statementId, false)}’s statement`} onClose={() => setStatementId(null)}>
          <div className="panel"><Statement data={data} R={R} id={statementId} /></div>
          <div className="sect" style={{ marginTop: 18 }}>
            <h2>Every expense involving {who(data, statementId, false)}</h2>
            {[...R.rows[statementId]].sort((a, b) => a.date.localeCompare(b.date)).map(r => (
              <div className="ln" key={r.expenseId}>
                <span>{r.vendor || 'Expense'}{r.estimated && <> <span className="tag">est.</span></>}<br /><span className="muted small">{fmtDate(r.date)}</span></span>
                <span className="a" style={{ textAlign: 'right' }}>{r.paid > 0 && <><span className="pos-t">paid {fmtMoney(r.paid, cur)}</span><br /></>}share {fmtMoney(r.share, cur)}</span>
              </div>
            ))}
            {!R.rows[statementId].length && <div className="muted">Nothing counted yet.</div>}
          </div>
        </Sheet>
      )}
      {tick && (
        <ConfirmDialog title={tick.on ? 'Mark as received?' : 'Mark as not received?'} confirmLabel={tick.on ? 'Yes, received' : 'Yes, undo'} tone="primary" busy={tickBusy} onCancel={() => setTick(null)} onConfirm={() => setReceived(tick.p, tick.on)}>
          <b>{who(data, tick.p.from_id)} → {who(data, tick.p.to_id)}</b>, {fmtMoney(toMinor(tick.p.amount, cur), cur)}.{' '}
          {tick.on ? `Once it’s marked received, it counts toward balances.${data.me?.id === tick.p.to_id ? '' : ` You’re confirming on behalf of ${who(data, tick.p.to_id, false)}.`}` : 'It goes back to Sent and stops counting toward balances until it’s confirmed again.'}
        </ConfirmDialog>
      )}
    </>
  )
}
