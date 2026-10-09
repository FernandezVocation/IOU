import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { computeLedger } from '../lib/ledger'
import { fmtMoney, fromMinor, parseNum, toMinor } from '../lib/money'
import { friendly, todayStr } from '../lib/format'
import { METHODS, autoConfirms, paymentHistory, paymentPerms } from '../lib/payments'
import type { Payment } from '../lib/types'
import { ConfirmDialog, Sheet, useToast } from './ui'
import { useGroup } from '../pages/GroupShell'
import { useAuth } from '../lib/auth'

/** Record or edit a payment: any amount (partial is fine), any date, with method and note. */
export default function PaymentSheet({ payment, from, to, onClose }: { payment?: Payment; from?: string; to?: string; onClose: () => void }) {
  const { data, reload } = useGroup()
  const { user } = useAuth()
  const toast = useToast()
  const cur = data.group.currency
  const me = user?.id ?? ''
  const t0 = data.travelers
  const defFrom = payment?.from_id ?? from ?? t0[0]?.id ?? ''
  const defTo = payment?.to_id ?? to ?? t0.find(t => t.id !== defFrom)?.id ?? ''
  const [fromId, setFromId] = useState(defFrom)
  const [toId, setToId] = useState(defTo)
  const m0 = payment?.method ?? ''
  const [pick, setPick] = useState(m0 === '' ? '' : METHODS.includes(m0) ? m0 : '__other')
  const [other, setOther] = useState(METHODS.includes(m0) ? '' : m0)
  const [date, setDate] = useState(payment?.paid_on ?? todayStr())
  const [note, setNote] = useState(payment?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // What is owed from -> to right now, not counting this payment (so the hint is right while editing).
  const owedMinor = useMemo(() => {
    const others = data.payments.filter(p => p.id !== payment?.id)
    const R = computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: others, rates: data.rates, includeEstimates: true })
    const pair = R.pairs.find(p => p.debtor === fromId && p.creditor === toId)
    return pair ? pair.net : 0
  }, [data, cur, payment?.id, fromId, toId])

  const [amount, setAmount] = useState(() => {
    if (payment) return String(payment.amount)
    return owedMinor > 0 ? String(fromMinor(owedMinor, cur)) : ''
  })
  const amt = parseNum(amount)
  const amtMinor = amt > 0 ? toMinor(amt, cur) : 0
  const name = (id: string) => data.travelers.find(t => t.id === id)?.name ?? 'Someone'
  const perms = payment ? paymentPerms(data, payment, me) : null
  const readOnly = payment ? !perms!.canEdit : false
  const confirmsNow = autoConfirms(data, toId, me)
  const toHasAccount = !!data.travelers.find(t => t.id === toId)?.user_id

  const remaining = owedMinor - amtMinor
  const hint = !amtMinor ? null
    : owedMinor === 0 ? `${name(fromId)} doesn’t currently owe ${name(toId)} anything, so this will count as a credit.`
    : remaining > 0 ? `Partial payment: ${fmtMoney(remaining, cur)} will still be owed after this.`
    : remaining === 0 ? 'This settles what is owed in full.'
    : `That is ${fmtMoney(-remaining, cur)} more than is owed. The extra becomes a credit for ${name(fromId)}.`

  async function save() {
    if (!(amt > 0)) { toast('Enter an amount greater than zero.'); return }
    if (fromId === toId) { toast('Choose two different people.'); return }
    if (!date) { toast('Pick a date.'); return }
    setBusy(true)
    const method = pick === '__other' ? other.trim() : pick
    const { error } = await supabase.rpc('save_payment', { p_id: payment?.id ?? crypto.randomUUID(), p_group: data.group.id, p: { from_id: fromId, to_id: toId, amount: amt, paid_on: date, method, note: note.trim() } })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    toast(payment ? 'Payment updated.' : confirmsNow ? 'Payment recorded and confirmed.' : 'Payment recorded as Sent. It counts once it’s confirmed as received.')
    await reload(); onClose()
  }
  async function remove() {
    if (!payment) return
    setBusy(true)
    const { error } = await supabase.rpc('delete_payment', { p_id: payment.id })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    toast('Payment deleted.'); await reload(); onClose()
  }

  return (
    <Sheet title={payment ? 'Payment' : 'Record a payment'} onClose={onClose}>
      {readOnly && <div className="notice">{payment!.status === 'pending' ? 'Only the person who entered this, the people in it, or the trip owner can change it.' : 'This payment is confirmed. Only the person who received it, or the trip owner, can change it.'}</div>}
      <div className="row2">
        <div><label className="lbl" style={{ marginTop: 0 }} htmlFor="pf">Paid by</label>
          <select id="pf" value={fromId} onChange={e => setFromId(e.target.value)} disabled={readOnly}>{t0.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        <div><label className="lbl" style={{ marginTop: 0 }} htmlFor="pt">Paid to</label>
          <select id="pt" value={toId} onChange={e => setToId(e.target.value)} disabled={readOnly}>{t0.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      </div>

      <label className="lbl" htmlFor="pa">Amount ({cur})</label>
      <input className="inp big" id="pa" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={readOnly} />
      {owedMinor > 0 && !readOnly && (
        <div className="prow" style={{ margin: '6px 0 0' }}>
          <span className="muted small" style={{ flex: 1 }}>{name(fromId)} owes {name(toId)} {fmtMoney(owedMinor, cur)}</span>
          <button className="btn small" type="button" onClick={() => setAmount(String(fromMinor(owedMinor, cur)))}>Pay in full</button>
        </div>
      )}
      {hint && <div className={'status ' + (remaining < 0 ? 'bad' : 'ok')}>{hint}</div>}

      <div className="row2">
        <div><label className="lbl" htmlFor="pd">Date paid</label><input type="date" id="pd" value={date} onChange={e => setDate(e.target.value)} disabled={readOnly} /></div>
        <div><label className="lbl" htmlFor="pm">Method</label>
          <select id="pm" value={pick} onChange={e => setPick(e.target.value)} disabled={readOnly}>
            <option value="">Not specified</option>{METHODS.map(m => <option key={m}>{m}</option>)}<option value="__other">Other…</option>
          </select></div>
      </div>
      {pick === '__other' && <input type="text" className="inp" style={{ marginTop: 8 }} maxLength={40} placeholder="e.g. Wise, gift card" value={other} onChange={e => setOther(e.target.value)} aria-label="Other method" disabled={readOnly} />}

      <label className="lbl" htmlFor="pn">Note</label>
      <textarea id="pn" maxLength={300} placeholder="e.g. sent after dinner, reference 1234" value={note} onChange={e => setNote(e.target.value)} disabled={readOnly} />

      {!payment && (
        <div className="notice" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>
          {confirmsNow ? 'You’re the person receiving this, so it will be marked Received right away.'
            : `It will show as Sent until ${name(toId)} confirms they received it${toHasAccount ? '' : ` (they have no account, so another member of the trip can confirm for them)`}. Sent payments aren’t counted in balances until they’re received.`}
        </div>
      )}
      {payment && (
        <div className="panel">
          <span className={'tag ' + (payment.status === 'pending' ? 'pending' : 'paid')}>{payment.status === 'pending' ? 'Sent' : 'Received'}</span>
          {paymentHistory(data, payment, me).map(h => <div className="muted small" key={h} style={{ marginTop: 4 }}>{h}</div>)}
          {!readOnly && payment.status === 'confirmed' && <div className="muted small" style={{ marginTop: 6 }}>Changing who or how much sends this back to Pending, unless you are the receiver.</div>}
        </div>
      )}

      {!readOnly && <button className="btn primary block" style={{ marginTop: 14 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : payment ? 'Save changes' : 'Record payment'}</button>}
      {payment && perms!.canDelete && <button className="btn danger block" style={{ marginTop: 10 }} onClick={() => setConfirmDel(true)} disabled={busy}>Delete payment</button>}

      {confirmDel && payment && (
        <ConfirmDialog title="Delete this payment?" busy={busy} onCancel={() => setConfirmDel(false)} onConfirm={remove}>
          <b>{name(payment.from_id)} → {name(payment.to_id)}</b>, {fmtMoney(toMinor(payment.amount, cur), cur)} on {payment.paid_on}.
          {payment.status === 'confirmed' ? ' This payment is confirmed, so deleting it will make balances go back up.' : ''} This can’t be undone.
        </ConfirmDialog>
      )}
    </Sheet>
  )
}
