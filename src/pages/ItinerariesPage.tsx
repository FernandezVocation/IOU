import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly } from '../lib/format'
import { Spinner } from '../components/ui'
import TopNav from '../components/TopNav'
import ThemeToggle from '../components/ThemeToggle'
import GroupIcon from '../components/GroupIcon'

interface Row { id: string; name: string; icon: string | null; color: string | null; group_id: string | null; vault_id: string | null; created_at: string }

export default function ItinerariesPage() {
  const nav = useNavigate()
  const { displayName, user, signOut } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')

  useEffect(() => {
    (async () => {
      const r = await supabase.from('itineraries').select('id, name, icon, color, group_id, vault_id, created_at').order('created_at', { ascending: false })
      if (r.error) { setError(friendly(r.error)); return }
      const list = r.data as Row[]
      setRows(list)
      const gids = list.map(x => x.group_id).filter(Boolean) as string[]
      if (gids.length) {
        const g = await supabase.from('groups').select('id, name').in('id', gids)
        setGroups(Object.fromEntries(((g.data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name])))
      }
      if (list.length) {
        const it = await supabase.from('itinerary_items').select('itinerary_id').in('itinerary_id', list.map(x => x.id))
        const c: Record<string, number> = {}
        for (const x of (it.data ?? []) as Array<{ itinerary_id: string }>) c[x.itinerary_id] = (c[x.itinerary_id] ?? 0) + 1
        setCounts(c)
      }
    })()
  }, [])

  function join(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().replace(/\/+$/, '').split('/').pop() ?? ''
    if (c) nav('/ij/' + encodeURIComponent(c))
  }

  return (
    <>
    <div className="app">
      <div className="top">
        <div>
          <h1>Your itineraries</h1>
          <div className="sub">Signed in as {displayName || user?.email}</div>
        </div>
        <button className="btn small" onClick={signOut}>Sign out</button>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {rows === null && !error && <Spinner />}
      {rows && rows.length === 0 && (
        <div className="empty"><b>No itineraries yet</b>An itinerary is a timeline of flights, stays, meals and plans. Create one, or paste an invite link below to join a friend’s.</div>
      )}
      <div className="glist">
        {rows?.map(r => (
          <div className="panel" key={r.id}>
            <Link to={'/itinerary/' + r.id}>
              <GroupIcon group={{ kind: 'Itinerary', icon: r.icon, color: r.color }} size={44} />
              <span className="nm gname">{r.name}{r.group_id && groups[r.group_id] && <span className="lnkchip">Linked to {groups[r.group_id]}</span>}</span>
              <span className="grt"><b>{counts[r.id] ?? 0}</b><span className="muted small">{(counts[r.id] ?? 0) === 1 ? 'item' : 'items'}</span></span>
            </Link>
          </div>
        ))}
      </div>
      <Link className="btn primary block" to="/itineraries/new" style={{ marginTop: 14 }}>Create an itinerary</Link>
      <div className="sect">
        <h2>Join an itinerary</h2>
        <form onSubmit={join} className="prow">
          <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Paste invite link or code" aria-label="Itinerary invite link or code" />
          <button className="btn">Join</button>
        </form>
      </div>
      <div className="sect"><ThemeToggle /></div>
    </div>
    <TopNav />
    </>
  )
}
