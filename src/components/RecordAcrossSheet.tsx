import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { METHODS } from '../lib/payments'
import { allocateAcrossTrips, type Person, type PersonTrip } from '../lib/overview'
import { fmtMoney, fromMinor, parseNum, toMinor } from '../lib/money'
import { friendly, todayStr } from '../lib/format'
import { Sheet, useToast } from './ui'

type Dir = 'theyPaid' | 'iPaid'

/** Record one payment with a person and spread it over the trips where money is owed. */
export default function RecordAcrossSheet({ person, onClose, onSaved }: { person: Person; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const first = person.currencies.find(c => c.net !== 0) ?? person.currencies[0]
  const [dir, setDir] = useState<Dir>(first && first.net < 0 ? 'iPaid' : 'theyPaid')
  const [cur, setCur] = useState(first?.currency ?? '')
  const [date, setDate] = useState(todayStr())
  const [pick, setPick] = useState('')
  const [other, setOther] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Trips where this person owes me (they paid) or I owe them (I paid), in this currency.
  const trips = useMemo<PersonTrip[]>(() => {
    const c = person.currencies.find(x => x.currency === cur)
    return (c?.trips ?? []).filter(t => (dir === 'theyPaid' ? t.net > 0 : t.net < 0)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [person, cur, dir])
  const key = (t: PersonTrip) => t.groupId + ':' + t.theirId
  const totalOwed = trips.reduce((s, t) => s + Math.abs(t.net), 0)
  // Trips where money is owed the OTHER way are already subtracted in the overall figure, so the
  // amount to settle is the NET, not the one-directional total. (Jack owes 100 + 50, you owe him 25 -> settle 125.)
  const netFor = (c: string) => person.currencies.find(x => x.currency === c)?.net ?? 0
  const targetFor = (d: Dir, c: string, gross: number) => { const n = netFor(c); return (d === 'theyPaid' ? n > 0 : n < 0) ? Math.min(Math.abs(n), gross) : gross }
  const target = targetFor(dir, cur, totalOwed)
  const offset = totalOwed - target

  const fill = (list: PersonTrip[], minor: number) => {
    const { allocs } = allocateAcrossTrips(list.map(t => ({ key: key(t), max: Math.abs(t.net) })), minor)
    return Object.fromEntries(list.map(t => [key(t), allocs[key(t)] ? String(fromMinor(allocs[key(t)], cur)) : '']))
  }
  const [amount, setAmount] = useState(() => (target ? String(fromMinor(target, cur)) : ''))
  const [alloc, setAlloc] = useState<Record<string, string>>(() => fill(trips, target))

  const reset = (d: Dir, c: string) => {
    const c2 = person.currencies.find(x => x.currency === c)
    const list = (c2?.trips ?? []).filter(t => (d === 'theyPaid' ? t.net > 0 : t.net < 0)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const tot = targetFor(d, c, list.reduce((s, t) => s + Math.abs(t.net), 0))
    setDir(d); setCur(c); setAmount(tot ? String(fromMinor(tot, c)) : '')
    const { allocs } = allocateAcrossTrips(list.map(t => ({ key: t.groupId + ':' + t.theirId, max: Math.abs(t.net) })), tot)
    setAlloc(Object.fromEntries(list.map(t => [t.groupId + ':' + t.theirId, allocs[t.groupId + ':' + t.theirId] ? String(fromMinor(allocs[t.groupId + ':' + t.theirId], c)) : ''])))
  }
  const currenciesFor = (d: Dir) => person.currencies.filter(c => c.trips.some(t => (d === 'theyPaid' ? t.net > 0 : t.net < 0))).map(c => c.currency)
  const pickDir = (d: Dir) => { const cs = currenciesFor(d); reset(d, cs.includes(cur) ? cur : cs[0] ?? cur) }

  const onAmount = (v: string) => {
    setAmount(v)
    const n = parseNum(v)
    setAlloc(fill(trips, n > 0 ? toMinor(n, cur) : 0))
  }
  const onAlloc = (k: string, v: string) => {
    const next = { ...alloc, [k]: v }
    setAlloc(next)
    const sum = trips.reduce((s, t) => s + (parseNum(next[key(t)]) > 0 ? toMinor(parseNum(next[key(t)]), cur) : 0), 0)
    setAmount(sum ? String(fromMinor(sum, cur)) : '')
  }

  const rows = trips.map(t => ({ t, k: key(t), n: parseNum(alloc[key(t)]) }))
  const bad = rows.find(r => (alloc[r.k] ?? '') !== '' && (!(r.n >= 0) || toMinor(r.n, cur) > Math.abs(r.t.net)))
  const sum = rows.reduce((s, r) => s + (r.n > 0 ? toMinor(r.n, cur) : 0), 0)
  const dirs: Dir[] = (['theyPaid', 'iPaid'] as Dir[]).filter(d => currenciesFor(d).length)

  async function save() {
    if (bad) { toast('A group can’t take more than is owed there.'); return }
    if (!sum) { toast('Enter an amount.'); return }
    setBusy(true)
    const method = pick === '__other' ? other.trim() : pick
    const items = rows.filter(r => r.n > 0).map(r => ({
      group_id: r.t.groupId, from_id: dir === 'theyPaid' ? r.t.theirId : r.t.myId, to_id: dir === 'theyPaid' ? r.t.myId : r.t.theirId,
      amount: r.n, paid_on: date, method, note: note.trim(),
    }))
    const { data, error } = await supabase.rpc('save_payments_batch', { p_items: items })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    const res = data as Array<{ status: string }>
    const confirmed = res.filter(x => x.status === 'confirmed').length
    toast(`Recorded in ${res.length} group${res.length === 1 ? '' : 's'}${confirmed === res.length ? ', confirmed.' : `: ${confirmed} confirmed, ${res.length - confirmed} pending.`}`)
    onSaved(); onClose()
  }

  return (
    <Sheet title={`Payment with ${person.name}`} onClose={onClose}>
      {dirs.length === 0 && <div className="empty"><b>Nothing to record</b>There’s no outstanding balance with {person.name}. Pending payments are confirmed inside each group.</div>}
      {dirs.length > 0 && (
        <>
          <div className="seg" role="group" aria-label="Direction">
            {dirs.map(d => <button key={d} aria-pressed={dir === d} onClick={() => pickDir(d)}>{d === 'theyPaid' ? `${person.name} paid me` : `I paid ${person.name}`}</button>)}
          </div>
          <label className="lbl" htmlFor="rc">Currency</label>
          <select id="rc" value={cur} onChange={e => reset(dir, e.target.value)}>{currenciesFor(dir).map(c => <option key={c}>{c}</option>)}</select>
          <div className="muted small" style={{ marginTop: 6 }}>Each group settles in its own currency, so a payment can only be spread over groups in the same one.</div>

          <label className="lbl" htmlFor="ra">Total amount ({cur})</label>
          <input className="inp big" id="ra" inputMode="decimal" value={amount} onChange={e => onAmount(e.target.value)} placeholder="0.00" />
          <div className="muted small" style={{ marginTop: 6 }}>{dir === 'theyPaid' ? `${person.name} owes you` : `You owe ${person.name}`} {fmtMoney(target, cur)}{offset > 0 ? ` overall (${fmtMoney(totalOwed, cur)} across ${trips.length} group${trips.length === 1 ? '' : 's'}, less ${fmtMoney(offset, cur)} the other way in your other groups)` : ` across ${trips.length} group${trips.length === 1 ? '' : 's'}`}. Anything less is a partial payment.</div>

          <div className="lbl">Applied to</div>
          <div className="panel" style={{ marginTop: 0 }}>
            {rows.map(r => (
              <div className="srow eq" key={r.k} style={{ gridTemplateColumns: '1fr 110px' }}>
                <span><b>{r.t.groupName}</b><br /><span className="muted small">{fmtMoney(Math.abs(r.t.net), cur)} owed</span></span>
                <input className="inp sv" inputMode="decimal" value={alloc[r.k] ?? ''} onChange={e => onAlloc(r.k, e.target.value)} aria-label={`Amount for ${r.t.groupName}`} placeholder="0.00" />
              </div>
            ))}
            <div className={'status ' + (bad ? 'bad' : 'ok')}>{bad ? `${bad.t.groupName}: more than the ${fmtMoney(Math.abs(bad.t.net), cur)} owed there.` : `Recording ${fmtMoney(sum, cur)}${sum && sum < target ? `, leaving ${fmtMoney(target - sum, cur)} owed` : sum && sum === target ? ', settling everything' : sum > target ? `, ${fmtMoney(sum - target, cur)} more than is owed overall (the extra becomes a credit)` : ''}.${offset > 0 && sum >= target ? ' Some groups will still show a small balance each way; they cancel out.' : ''}`}</div>
          </div>

          <div className="row2">
            <div><label className="lbl" htmlFor="rd">Date paid</label><input type="date" id="rd" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="lbl" htmlFor="rm">Method</label>
              <select id="rm" value={pick} onChange={e => setPick(e.target.value)}><option value="">Not specified</option>{METHODS.map(m => <option key={m}>{m}</option>)}<option value="__other">Other…</option></select></div>
          </div>
          {pick === '__other' && <input type="text" className="inp" style={{ marginTop: 8 }} maxLength={40} value={other} onChange={e => setOther(e.target.value)} placeholder="Method" aria-label="Other method" />}
          <label className="lbl" htmlFor="rn">Note</label>
          <textarea id="rn" maxLength={300} value={note} onChange={e => setNote(e.target.value)} placeholder="Added to each group’s payment" />

          <div className="notice" style={{ background: 'var(--soft)', color: 'var(--ink)' }}>
            {dir === 'theyPaid' ? 'You’re the one receiving it, so it’s marked Received right away in every group.' : `Shows as Sent in each group until ${person.name} confirms they received it (or another member does, if they have no account).`}
          </div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={save} disabled={busy || !sum || !!bad}>{busy ? 'Recording…' : 'Record payment'}</button>
        </>
      )}
    </Sheet>
  )
}
