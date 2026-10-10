import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Expense, Receipt } from '../lib/types'
import { fmtMoney, toMinor } from '../lib/money'
import { fmtDate, fmtTime, friendly } from '../lib/format'
import { receiptFileName } from '../lib/receiptNames'
import { buildReceiptsZip } from '../lib/receiptsZip'
import { downloadReceiptBlob, useSignedUrls } from '../lib/receipts'
import { downloadBlob } from '../lib/exporters'
import { Sheet, useToast } from '../components/ui'
import { useGroup, who } from './GroupShell'

interface Item { e: Expense; r: Receipt; i: number }
type By = 'date' | 'vendor' | 'category'

export default function ReceiptsTab() {
  const { data } = useGroup()
  const toast = useToast()
  const cur = data.group.currency
  const [q, setQ] = useState('')
  const [by, setBy] = useState<By>('date')
  const [view, setView] = useState<'receipts' | 'missing'>('receipts')
  const [open, setOpen] = useState<Item | null>(null)
  const [zipMsg, setZipMsg] = useState<string | null>(null)

  const s = q.trim().toLowerCase()
  const match = (e: Expense) => !s || [e.vendor, e.description ?? '', e.location, e.category, e.subcategory ?? '', e.notes, e.spent_on, who(data, e.payer_id, false)].join(' ').toLowerCase().includes(s)
  const items = useMemo(() => data.expenses.filter(match).flatMap(e => e.receipts.map((r, i) => ({ e, r, i }))), [data.expenses, s]) // eslint-disable-line react-hooks/exhaustive-deps
  const urls = useSignedUrls(items.map(x => x.r.path))
  const total = data.expenses.reduce((n, e) => n + e.receipts.length, 0)
  const missingAll = data.expenses.filter(e => !e.receipts.length)
  const missing = missingAll.filter(match).sort((a, b) => b.spent_on.localeCompare(a.spent_on))

  const keyOf = (it: Item) => by === 'date' ? it.e.spent_on : by === 'vendor' ? (it.e.vendor || 'No vendor') : (it.e.category || 'Uncategorized')
  const groups = new Map<string, Item[]>()
  items.forEach(it => groups.set(keyOf(it), [...(groups.get(keyOf(it)) ?? []), it]))
  const keys = [...groups.keys()].sort((a, b) => (by === 'date' ? b.localeCompare(a) : a.localeCompare(b)))
  keys.forEach(k => groups.get(k)!.sort((a, b) => b.e.spent_on.localeCompare(a.e.spent_on) || (b.e.spent_at ?? '').localeCompare(a.e.spent_at ?? '')))

  async function zipAll() {
    setZipMsg('Preparing…')
    try {
      const z = await buildReceiptsZip(data, downloadReceiptBlob, (d, t) => setZipMsg(`Packing ${d} of ${t}…`))
      downloadBlob(z.blob, z.filename)
      toast(z.failed.length ? `${z.count} saved, ${z.failed.length} could not be downloaded.` : `${z.count} receipts saved.`)
    } catch (e) { toast(friendly(e)) } finally { setZipMsg(null) }
  }
  async function saveOne(it: Item) {
    try { downloadBlob(await downloadReceiptBlob(it.r.path), receiptFileName(it.e, it.r, it.i, it.e.receipts.length)) } catch (e) { toast(friendly(e)) }
  }

  return (
    <>
      <div className="panel">
        <div className="total">
          <div><div className="muted small">Receipts on file</div><div className="big">{total}</div></div>
          <div className="muted small" style={{ textAlign: 'right' }}>{data.expenses.length - missingAll.length} of {data.expenses.length} expenses<br />have a receipt</div>
        </div>
        <button className="btn block" style={{ marginTop: 12 }} disabled={!total || zipMsg !== null} onClick={zipAll}>{zipMsg ?? 'Download all receipts (ZIP)'}</button>
        <div className="muted small" style={{ marginTop: 6 }}>Files are named by date, vendor and amount, with an index sheet included.</div>
      </div>

      <input type="search" className="inp" placeholder="Search vendor, date, place, category" value={q} onChange={e => setQ(e.target.value)} aria-label="Search receipts" />
      <div className="chips">
        <button className="chip" aria-pressed={view === 'receipts'} onClick={() => setView('receipts')}>Receipts ({items.length})</button>
        <button className="chip" aria-pressed={view === 'missing'} onClick={() => setView('missing')}>Missing a receipt ({missing.length})</button>
      </div>

      {view === 'receipts' && (
        <>
          <div className="seg" role="group" aria-label="Group receipts by" style={{ margin: '4px 0 6px' }}>
            {(['date', 'vendor', 'category'] as By[]).map(b => <button key={b} aria-pressed={by === b} onClick={() => setBy(b)}>{b === 'date' ? 'By date' : b === 'vendor' ? 'By vendor' : 'By category'}</button>)}
          </div>
          {!items.length && <div className="empty"><b>{total ? 'Nothing matches' : 'No receipts yet'}</b>{total ? 'Try a different search.' : 'Open any expense and tap “Add photo or PDF”.'}</div>}
          {keys.map(k => (
            <div key={k}>
              <div className="day"><span>{by === 'date' ? fmtDate(k) : k}</span><span>{groups.get(k)!.length}</span></div>
              <div className="rgrid">
                {groups.get(k)!.map(it => (
                  <button className="rc" key={it.r.id} onClick={() => setOpen(it)} aria-label={`${it.e.vendor || 'Expense'}, ${fmtDate(it.e.spent_on)}`}>
                    <span className="rt">
                      {it.r.mime === 'application/pdf' ? <b>PDF</b> : urls[it.r.path] ? <img src={urls[it.r.path]} alt="" loading="lazy" /> : <span className="muted small">…</span>}
                    </span>
                    <span className="rv">{it.e.vendor || 'Expense'}</span>
                    <span className="rm">{fmtDate(it.e.spent_on)} · {fmtMoney(toMinor(it.e.amount, it.e.currency), it.e.currency)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {view === 'missing' && (
        <div style={{ marginTop: 6 }}>
          {!missing.length && <div className="empty"><b>{missingAll.length ? 'Nothing matches' : 'Every expense has a receipt'}</b>{missingAll.length ? 'Try a different search.' : 'Nice and tidy.'}</div>}
          {missing.map(e => (
            <Link className="exp" key={e.id} to={`/g/${data.group.id}/expense/${e.id}`}>
              <div className="v">{e.vendor || 'Untitled'}</div>
              <div className="amt">{fmtMoney(toMinor(e.amount, e.currency), e.currency)}</div>
              <div className="m">{[e.description, fmtDate(e.spent_on)].filter(Boolean).join(' · ')} · {who(data, e.payer_id)} paid</div>
              <div className="sb" style={{ color: 'var(--accent)' }}>Add receipt →</div>
            </Link>
          ))}
        </div>
      )}

      <div className="muted small" style={{ marginTop: 22 }}>Receipts are kept in this group’s private storage. Only people in the group can open them.</div>

      {open && (
        <Sheet title="Receipt" onClose={() => setOpen(null)}>
          {open.r.mime === 'application/pdf'
            ? <a className="btn block" href={urls[open.r.path]} target="_blank" rel="noopener noreferrer">Open PDF receipt</a>
            : urls[open.r.path] && <img className="bigrc" src={urls[open.r.path]} alt={`Receipt for ${open.e.vendor}`} />}
          <div className="panel">
            <h2>{open.e.vendor || 'Expense'}</h2>
            <div className="ln"><span>Group</span><span className="a">{data.group.name}</span></div>
            <div className="ln"><span>Date</span><span className="a">{fmtDate(open.e.spent_on)}{open.e.spent_at ? ' · ' + fmtTime(open.e.spent_at) : ''}</span></div>
            <div className="ln"><span>Amount</span><span className="a">{fmtMoney(toMinor(open.e.amount, open.e.currency), open.e.currency)}</span></div>
            {open.e.currency !== cur && open.e.settled_amount != null && <div className="ln"><span>Charged in {cur}</span><span className="a">{fmtMoney(toMinor(open.e.settled_amount, cur), cur)}</span></div>}
            <div className="ln"><span>Paid by</span><span className="a">{who(data, open.e.payer_id)}</span></div>
            {open.e.category && <div className="ln"><span>Category</span><span className="a">{open.e.category}</span></div>}
            {open.e.location && <div className="ln"><span>Location</span><span className="a">{open.e.location}</span></div>}
          </div>
          <div className="row2">
            <Link className="btn primary" to={`/g/${data.group.id}/expense/${open.e.id}`}>Open expense</Link>
            <button className="btn" onClick={() => saveOne(open)}>Save file</button>
          </div>
        </Sheet>
      )}
    </>
  )
}
