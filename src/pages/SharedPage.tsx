import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSharedTrip, sharedToGroupData, type SharedTrip } from '../lib/shared'
import { buildInvoiceModel, buildInvoicePdf, type InvoiceLine } from '../lib/invoice'
import { downloadBlob } from '../lib/exporters'
import { fmtMoney } from '../lib/money'
import { fmtDate, friendly, slug, todayStr } from '../lib/format'
import { Spinner, ToastProvider, useToast } from '../components/ui'

type State = { s: 'loading' } | { s: 'invalid' } | { s: 'error'; msg: string } | { s: 'ok'; trip: SharedTrip; at: Date }

/** Public, read-only page behind a secret link. No sign-in, no editing, no receipts or notes. */
export default function SharedPage() {
  return <ToastProvider><Inner /></ToastProvider>
}

function Inner() {
  const { token = '' } = useParams()
  const toast = useToast()
  const [state, setState] = useState<State>({ s: 'loading' })
  const [includeEst, setIncludeEst] = useState(true)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)

  const load = useCallback(async () => {
    try {
      const trip = await fetchSharedTrip(token)
      setState(trip ? { s: 'ok', trip, at: new Date() } : { s: 'invalid' })
      setStale(false)
    } catch (e) {
      // Keep showing the last good data if a refresh fails, but say so.
      setState(p => (p.s === 'ok' ? p : { s: 'error', msg: friendly(e) }))
      setStale(true)
    }
  }, [token])

  useEffect(() => {
    load()
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex,nofollow'; document.head.appendChild(meta)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { meta.remove(); document.removeEventListener('visibilitychange', onVisible) }
  }, [load])

  const view = useMemo(() => {
    if (state.s !== 'ok') return null
    const { data, linked } = sharedToGroupData(state.trip)
    if (!linked.length) return { data, linked, model: null }
    return { data, linked, model: buildInvoiceModel({ data, billTo: linked, mode: includeEst ? 'pending' : 'final' }) }
  }, [state, includeEst])

  if (state.s === 'loading') return <Spinner />
  if (state.s === 'invalid') return (
    <div className="auth">
      <h1>Link not available</h1>
      <p className="muted">This link isn’t valid any more. It may have been turned off or expired. Ask the trip organizer for a fresh one.</p>
    </div>
  )
  if (state.s === 'error') return (
    <div className="auth">
      <h1>Couldn’t load</h1>
      <div className="notice err" role="alert">{state.msg}</div>
      <button className="btn block" onClick={load}>Try again</button>
    </div>
  )
  if (!view?.model) return <div className="auth"><h1>Nothing to show</h1><p className="muted">This link doesn’t point to anyone on the trip any more. Ask the organizer for a new one.</p></div>

  const m = view.model
  const cur = m.currency
  const due = m.totals.due
  const owes = due > 0, square = due === 0

  async function pdf() {
    setBusy(true)
    try { downloadBlob(await buildInvoicePdf(m), `${slug(m.groupName)}-balance-${slug(state.s === 'ok' ? state.trip.label : 'trip')}-${todayStr()}.pdf`) }
    catch (e) { toast(friendly(e)) } finally { setBusy(false) }
  }

  const Row = ({ l, amount, plain }: { l: InvoiceLine; amount: number; plain?: boolean }) => (
    <div className="ln">
      <span>
        {l.vendor}{l.estimated && <> <span className="tag">est.</span></>}
        <br /><span className="muted small">{fmtDate(l.date)} · paid by {l.payerName}{l.original ? ` · ${l.original}` : ''}{plain ? '' : ` · ${l.basis}`}</span>
      </span>
      <span className="a">{fmtMoney(amount, cur)}</span>
    </div>
  )

  return (
    <div className="app" style={{ paddingBottom: 40 }}>
      <div className="top">
        <div>
          <div className="muted small" style={{ marginBottom: 4 }}>Read-only balance · {state.trip.label}</div>
          <h1>{m.groupName}</h1>
          <div className="sub">Updated {state.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <button className="btn small" onClick={load}>Refresh</button>
      </div>

      {stale && <div className="notice" role="status">Couldn’t refresh just now. These numbers are from {state.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</div>}

      <div className="panel" style={{ background: owes ? 'var(--soft)' : 'rgba(14,124,97,.12)' }}>
        <div className="muted small" style={{ fontWeight: 600, letterSpacing: '.04em' }}>{owes ? 'YOU OWE' : square ? 'BALANCE' : 'YOU ARE OWED'}</div>
        <div className="total"><div className="big" style={{ color: owes ? 'var(--ink)' : 'var(--owed)' }}>{square ? 'All square' : fmtMoney(Math.abs(due), cur)}</div></div>
        {m.counts.estimated > 0 && includeEst && <div className="muted small" style={{ marginTop: 6 }}>Includes {m.counts.estimated} estimated amount{m.counts.estimated === 1 ? '' : 's'} that may change once card statements are in.</div>}
      </div>

      <label className="switch"><input type="checkbox" checked={includeEst} onChange={e => setIncludeEst(e.target.checked)} /><span>Include estimated amounts</span></label>

      {(owes ? m.payOut : m.payIn).length > 0 && (
        <div className="panel">
          <h2>{owes ? 'How to pay' : 'Who will pay you'}</h2>
          {(owes ? m.payOut : m.payIn).map(p => <div className="ln" key={p.name}><span>{owes ? `Pay ${p.name}` : p.name}</span><span className="a"><b>{fmtMoney(p.amount, cur)}</b></span></div>)}
        </div>
      )}

      <div className="panel">
        <h2>Summary</h2>
        <div className="ln"><span>Total share of trip costs</span><span className="a">{fmtMoney(m.totals.share, cur)}</span></div>
        <div className="ln"><span>Less: expenses you paid</span><span className="a">− {fmtMoney(m.totals.paid, cur)}</span></div>
        {m.totals.made > 0 && <div className="ln"><span>Less: payments you made</span><span className="a">− {fmtMoney(m.totals.made, cur)}</span></div>}
        {m.totals.received > 0 && <div className="ln"><span>Plus: payments you received</span><span className="a">+ {fmtMoney(m.totals.received, cur)}</span></div>}
        <div className="ln tot"><span>{owes ? 'Amount due' : square ? 'Balance' : 'Credit'}</span><span className="a">{fmtMoney(Math.abs(due), cur)}</span></div>
      </div>

      <div className="sect" style={{ marginTop: 18 }}>
        <h2>Your share, item by item</h2>
        <div className="panel">
          {m.shareLines.length ? m.shareLines.map(l => <Row key={l.expenseId} l={l} amount={l.share} />) : <div className="muted">Nothing is shared with you yet.</div>}
        </div>
      </div>
      {m.paidLines.length > 0 && (
        <div className="sect">
          <h2>What you paid</h2>
          <div className="panel">{m.paidLines.map(l => <Row key={l.expenseId} l={l} amount={l.paid} plain />)}</div>
        </div>
      )}
      {m.paymentLines.length > 0 && (
        <div className="sect">
          <h2>Payments already settled</h2>
          <div className="panel">{m.paymentLines.map((p, i) => <div className="ln" key={i}><span>{p.text}<br /><span className="muted small">{fmtDate(p.date)}</span></span><span className="a">{p.kind === 'made' ? '−' : '+'} {fmtMoney(p.amount, cur)}</span></div>)}</div>
        </div>
      )}

      {m.pendingLines.length > 0 && (
        <div className="sect">
          <h2>Payments awaiting confirmation</h2>
          <div className="panel">
            {m.pendingLines.map((p, i) => <div className="ln" key={i}><span>{p.text} <span className="tag pending">Pending</span><br /><span className="muted small">{fmtDate(p.date)}</span></span><span className="a">{fmtMoney(p.amount, cur)}</span></div>)}
            <div className="muted small" style={{ marginTop: 8 }}>These count once the person receiving them confirms.</div>
          </div>
        </div>
      )}

      <button className="btn block" style={{ marginTop: 16 }} onClick={pdf} disabled={busy}>{busy ? 'Building…' : 'Download as PDF'}</button>
      <div className="muted small" style={{ marginTop: 14 }}>This page is read-only and updates when the trip does. If something looks wrong, tell the trip organizer.</div>
    </div>
  )
}
