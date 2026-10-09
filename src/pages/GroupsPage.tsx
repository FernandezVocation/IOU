import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly } from '../lib/format'
import { Spinner } from '../components/ui'
import TopNav from '../components/TopNav'
import ThemeToggle from '../components/ThemeToggle'

interface Row { id: string; name: string; currency: string; kind?: string; created_at: string }

export default function GroupsPage() {
  const nav = useNavigate()
  const { displayName, user, signOut } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [kindFilter, setKindFilter] = useState('All')

  useEffect(() => {
    supabase.from('groups').select('id, name, currency, kind, created_at').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setError(friendly(error)); else setRows(data as Row[]) })
  }, [])

  const kinds = [...new Set((rows ?? []).map(r => r.kind || 'Trip'))].sort()
  const shown = rows?.filter(r => kindFilter === 'All' || (r.kind || 'Trip') === kindFilter)

  function join(e: FormEvent) {
    e.preventDefault()
    // Accept a pasted full link or just the code.
    const c = code.trim().replace(/\/+$/, '').split('/').pop() ?? ''
    if (c) nav('/join/' + encodeURIComponent(c))
  }

  return (
    <>
    <div className="app">
      <div className="top">
        <div>
          <h1>Your groups</h1>
          <div className="sub">Signed in as {displayName || user?.email}</div>
        </div>
        <button className="btn small" onClick={signOut}>Sign out</button>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {rows === null && !error && <Spinner />}
      {rows && rows.length === 0 && (
        <div className="empty"><b>No groups yet</b>Create one, or paste an invite link below to join a friend’s group.</div>
      )}
      {kinds.length > 1 && (
        <div className="chips" role="group" aria-label="Filter by type">
          {['All', ...kinds].map(k => <button key={k} className="chip" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>{k}</button>)}
        </div>
      )}
      <div className="glist">
        {shown?.map(g => (
          <div className="panel" key={g.id}>
            <Link to={'/g/' + g.id}>
              <span className="nm">{g.name}</span>
              <span className="muted small"><span className="kind">{g.kind || 'Trip'}</span> {g.currency}</span>
            </Link>
          </div>
        ))}
      </div>
      <Link className="btn primary block" to="/new" style={{ marginTop: 14 }}>Create a group</Link>
      <div className="sect">
        <h2>Join a group</h2>
        <form onSubmit={join} className="prow">
          <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Paste invite link or code" aria-label="Invite link or code" />
          <button className="btn">Join</button>
        </form>
      </div>
      <div className="sect"><div className="panel"><ThemeToggle /></div></div>
    </div>
    <TopNav />
    </>
  )
}
