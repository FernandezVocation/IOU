import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { computeLedger } from '../lib/ledger'
import { fmtMoney } from '../lib/money'
import { friendly, slug, todayStr } from '../lib/format'
import { buildPdf, buildXlsx, downloadBlob, exportName, type ExportMode } from '../lib/exporters'
import { buildInvoiceModel, buildInvoicePdf, loadInvoiceImages } from '../lib/invoice'
import { downloadReceiptBlob } from '../lib/receipts'
import { useAuth } from '../lib/auth'
import { Avatar, Sheet, useToast } from '../components/ui'
import { useGroup } from './GroupShell'

export default function ReportsTab() {
  const { data } = useGroup()
  const { displayName } = useAuth()
  const toast = useToast()
  const cur = data.group.currency
  const [mode, setMode] = useState<ExportMode>('pending')
  const [billTo, setBillTo] = useState<string[]>(data.me ? [data.me.id] : [])
  const [attach, setAttach] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [ready, setReady] = useState<{ blob: Blob; filename: string } | null>(null)

  const model = useMemo(
    () => (billTo.length ? buildInvoiceModel({ data, billTo, mode, note, preparedBy: data.me?.name || displayName }) : null),
    [data, billTo, mode, note, displayName],
  )
  const receiptCount = model ? data.expenses.filter(e => [...model.shareLines, ...model.paidLines].some(l => l.expenseId === e.id)).reduce((n, e) => n + e.receipts.length, 0) : 0

  async function fullReport(kind: 'xlsx' | 'pdf') {
    setBusy(kind)
    try {
      const result = computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: mode === 'pending' })
      const blob = kind === 'xlsx' ? await buildXlsx({ data, result, mode }) : await buildPdf({ data, result, mode })
      downloadBlob(blob, exportName(data, mode, kind))
    } catch (e) { toast(friendly(e)) } finally { setBusy(null) }
  }

  async function makeInvoice() {
    if (!model) return
    setBusy('invoice')
    try {
      let images: Awaited<ReturnType<typeof loadInvoiceImages>>['images'] = []
      let skipped = 0
      if (attach && receiptCount) {
        const r = await loadInvoiceImages(data, model, downloadReceiptBlob, (d, t) => setBusy(`Adding receipts ${Math.min(d + 1, t)} of ${t}…`))
        images = r.images; skipped = r.skipped
      } else setBusy('Building invoice…')
      const blob = await buildInvoicePdf(model, images, skipped)
      setReady({ blob, filename: `${slug(data.group.name)}-invoice-${slug(model.billToLabel)}-${mode}-${todayStr()}.pdf` })
    } catch (e) { toast(friendly(e)) } finally { setBusy(null) }
  }

  const canShare = (() => {
    if (!ready || typeof navigator === 'undefined' || !navigator.canShare) return false
    try { return navigator.canShare({ files: [new File([ready.blob], ready.filename, { type: 'application/pdf' })] }) } catch { return false }
  })()
  async function share() {
    if (!ready) return
    try { await navigator.share({ files: [new File([ready.blob], ready.filename, { type: 'application/pdf' })], title: `Invoice: ${data.group.name}` }) } catch { /* cancelled */ }
  }

  const toggle = (id: string) => setBillTo(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const due = model?.totals.due ?? 0

  return (
    <>
      <div className="sect" style={{ marginTop: 8 }}>
        <h2>Reports & invoices</h2>
        <div className="muted small">Pending includes amounts still waiting on a card statement. Final counts only confirmed {cur} amounts.</div>
        <div className="seg" role="group" style={{ margin: '10px 0' }}>
          <button aria-pressed={mode === 'pending'} onClick={() => setMode('pending')}>Pending</button>
          <button aria-pressed={mode === 'final'} onClick={() => setMode('final')}>Final</button>
        </div>
      </div>

      <div className="panel">
        <h2>Full group report</h2>
        <div className="muted small">Every transaction with its details and split, each person’s balance, the payment plan, and why each amount is owed. Excel also lists each receipt file next to its transaction.</div>
        <div className="row2" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy !== null} onClick={() => fullReport('xlsx')}>{busy === 'xlsx' ? 'Building…' : 'Excel'}</button>
          <button className="btn primary" disabled={busy !== null} onClick={() => fullReport('pdf')}>{busy === 'pdf' ? 'Building…' : 'PDF'}</button>
        </div>
      </div>

      <div className="panel">
        <h2>Invoice to send</h2>
        <div className="muted small">An itemized PDF for one person, or several billed together (a couple, a family). It credits everything they paid themselves and shows what they still owe.</div>
        <div className="lbl">Bill to</div>
        {data.travelers.map(t => (
          <label className="radio" key={t.id}>
            <input type="checkbox" checked={billTo.includes(t.id)} onChange={() => toggle(t.id)} />
            <Avatar name={t.name} color={t.color} /><span>{t.name}</span>
          </label>
        ))}
        {model && (
          <div className={'notice ' + (due > 0 ? '' : 'ok')} style={due > 0 ? { background: 'var(--soft)', color: 'var(--ink)' } : undefined} role="status">
            {due > 0 ? <><b>{model.billToLabel}</b> {billTo.length > 1 ? 'owe' : 'owes'} <b>{fmtMoney(due, cur)}</b>: {fmtMoney(model.totals.share, cur)} share − {fmtMoney(model.totals.paid, cur)} already paid{model.totals.made ? ` − ${fmtMoney(model.totals.made, cur)} settled` : ''}.</>
              : due < 0 ? <><b>{model.billToLabel}</b> {billTo.length > 1 ? 'are' : 'is'} owed <b>{fmtMoney(-due, cur)}</b>. The invoice will show a credit.</>
              : <><b>{model.billToLabel}</b> {billTo.length > 1 ? 'are' : 'is'} all square.</>}
          </div>
        )}
        <label className="lbl" htmlFor="note">Note or payment details (optional)</label>
        <textarea id="note" value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="e.g. Interac e-transfer to name@example.com within 14 days" />
        <label className="switch" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={attach} disabled={!receiptCount} onChange={e => setAttach(e.target.checked)} />
          <span>Attach receipt photos ({receiptCount} for these expenses)</span>
        </label>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={!billTo.length || busy !== null} onClick={makeInvoice}>
          {busy === 'invoice' || (busy && busy.startsWith('Adding')) || busy === 'Building invoice…' ? busy : 'Create invoice PDF'}
        </button>
        <div className="muted small" style={{ marginTop: 8 }}>The PDF shows names, vendors and amounts for this group. Only send it to people you’re happy to share that with.</div>
      </div>

      <div className="muted small">Looking for receipts? Find them in the <Link to={`/g/${data.group.id}/receipts`}>Receipts tab</Link>.</div>

      {ready && (
        <Sheet title="Invoice ready" onClose={() => setReady(null)}>
          <div className="panel">
            <b style={{ overflowWrap: 'anywhere' }}>{ready.filename}</b>
            <div className="muted small">{(ready.blob.size / 1024).toFixed(0)} KB · PDF</div>
          </div>
          <div className="row2">
            <button className="btn primary" onClick={() => downloadBlob(ready.blob, ready.filename)}>Download</button>
            {canShare && <button className="btn" onClick={share}>Share…</button>}
          </div>
        </Sheet>
      )}
    </>
  )
}
