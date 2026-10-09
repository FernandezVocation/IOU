import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly } from '../lib/format'
import { Spinner } from '../components/ui'

interface Preview { id: string | null; name: string; currency: string; already_member: boolean; member_count: number; travelers: Array<{ id: string; name: string }> }

export default function JoinPage() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const { displayName } = useAuth()
  const [pv, setPv] = useState<Preview | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [choice, setChoice] = useState<string>('__new')
  const [newName, setNewName] = useState(displayName)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('group_preview', { p_code: code }).then(({ data, error }) => {
      if (error) { setError(friendly(error)); return }
      const p = data as Preview | null
      if (p?.already_member && p.id) { nav('/g/' + p.id, { replace: true }); return }
      setPv(p)
    })
  }, [code, nav])

  async function join() {
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('join_group', {
      p_code: code,
      p_traveler_id: choice === '__new' ? null : choice,
      p_new_name: choice === '__new' ? newName.trim() : null,
    })
    setBusy(false)
    if (error) { setError(friendly(error)); return }
    nav('/g/' + (data as string), { replace: true })
  }

  if (error && pv === undefined) return <div className="app"><div className="notice err" role="alert">{error}</div><Link to="/">Back to your trips</Link></div>
  if (pv === undefined) return <Spinner />
  if (pv === null) return (
    <div className="app"><div className="empty"><b>This invite is no longer valid</b>Ask the trip owner for a fresh link.</div><Link className="btn block" to="/">Back to your trips</Link></div>
  )

  return (
    <div className="app">
      <div className="top"><div><h1>Join {pv.name}</h1><div className="sub">Settles in {pv.currency} · {pv.member_count} {pv.member_count === 1 ? 'person' : 'people'} so far</div></div></div>
      <div className="panel">
        <h2>Who are you on this trip?</h2>
        <div className="muted small">If the group already added your name, pick it so your expenses line up.</div>
        {pv.travelers.map(t => (
          <label className="radio" key={t.id}><input type="radio" name="who" checked={choice === t.id} onChange={() => setChoice(t.id)} />{t.name}</label>
        ))}
        <label className="radio"><input type="radio" name="who" checked={choice === '__new'} onChange={() => setChoice('__new')} />I’m someone new</label>
        {choice === '__new' && <input type="text" value={newName} onChange={e => setNewName(e.target.value)} maxLength={40} aria-label="Your name" placeholder="Your name" />}
        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 16 }} onClick={join} disabled={busy || (choice === '__new' && !newName.trim())}>{busy ? 'Joining…' : 'Join trip'}</button>
      </div>
    </div>
  )
}
