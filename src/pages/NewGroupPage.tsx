import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { COMMON_CURRENCIES, friendly } from '../lib/format'
import { isValidCurrency } from '../lib/money'

export default function NewGroupPage() {
  const nav = useNavigate()
  const { displayName } = useAuth()
  const [name, setName] = useState('')
  const [pick, setPick] = useState('CAD')
  const [other, setOther] = useState('')
  const [me, setMe] = useState(displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const currency = pick === '__other' ? other.trim().toUpperCase() : pick
    if (!isValidCurrency(currency)) { setError('Enter a valid 3-letter currency code, like PLN.'); return }
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('create_group', { p_name: name.trim(), p_currency: currency, p_my_name: me.trim() })
    setBusy(false)
    if (error) { setError(friendly(error)); return }
    nav('/g/' + (data as string), { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to="/">← Your trips</Link><h1>New trip</h1></div></div>
      <form onSubmit={submit} className="panel">
        <label className="lbl" style={{ marginTop: 0 }} htmlFor="n">Trip name</label>
        <input id="n" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Lisbon, September" required />
        <label className="lbl" htmlFor="c">Settle currency</label>
        <select id="c" value={pick} onChange={e => setPick(e.target.value)}>
          {COMMON_CURRENCIES.map(c => <option key={c}>{c}</option>)}
          <option value="__other">Other…</option>
        </select>
        {pick === '__other' && <input type="text" value={other} onChange={e => setOther(e.target.value)} maxLength={3} placeholder="e.g. PLN" style={{ marginTop: 8, textTransform: 'uppercase' }} aria-label="Currency code" />}
        <div className="muted small" style={{ marginTop: 6 }}>Everyone settles up in this currency, and all balances are shown in it. It is locked once the first expense is added.</div>
        <label className="lbl" htmlFor="me">Your name on this trip</label>
        <input id="me" type="text" value={me} onChange={e => setMe(e.target.value)} maxLength={40} required />
        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Creating…' : 'Create trip'}</button>
      </form>
    </div>
  )
}
