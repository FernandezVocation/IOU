import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly } from '../lib/format'
import { Spinner } from '../components/ui'
import TopNav from '../components/TopNav'
import ThemeToggle from '../components/ThemeToggle'
import GroupIcon from '../components/GroupIcon'
import AllVaultItems from '../components/AllVaultItems'

interface Row { id: string; name: string; icon: string | null; color: string | null; group_id: string | null; created_at: string; personal: boolean }
type View = 'group' | 'private' | 'both'
const readView = (): View => { try { const v = localStorage.getItem('iou.vaultView'); return v === 'group' || v === 'private' ? v : 'both' } catch { return 'both' } }

type Layout = 'vaults' | 'items'
const readLayout = (): Layout => { try { return localStorage.getItem('iou.vaultLayout') === 'items' ? 'items' : 'vaults' } catch { return 'vaults' } }

export default function VaultsPage() {
  const nav = useNavigate()
  const { displayName, user, signOut } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [view, setViewState] = useState<View>(readView)
  const [opening, setOpening] = useState(false)
  const [layout, setLayoutState] = useState<Layout>(readLayout)
  const setLayout = (l: Layout) => { setLayoutState(l); try { localStorage.setItem('iou.vaultLayout', l) } catch { /* storage unavailable */ } }
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem('iou.vaultView', v) } catch { /* storage unavailable */ } }
  async function openPersonal() {
    setOpening(true)
    const { data, error } = await supabase.rpc('get_or_create_personal_vault')
    setOpening(false)
    if (error) { setError(friendly(error)); return }
    nav('/vault/' + (data as string))
  }

  useEffect(() => {
    (async () => {
      const v = await supabase.from('vaults').select('id, name, icon, color, group_id, created_at, personal').order('created_at', { ascending: false })
      if (v.error) { setError(friendly(v.error)); return }
      const list = v.data as Row[]
      setRows(list)
      const gids = list.map(r => r.group_id).filter(Boolean) as string[]
      if (gids.length) {
        const g = await supabase.from('groups').select('id, name').in('id', gids)
        setGroups(Object.fromEntries(((g.data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name])))
      }
      if (list.length) {
        const it = await supabase.from('vault_items').select('vault_id').in('vault_id', list.map(r => r.id))
        const c: Record<string, number> = {}
        for (const x of (it.data ?? []) as Array<{ vault_id: string }>) c[x.vault_id] = (c[x.vault_id] ?? 0) + 1
        setCounts(c)
      }
    })()
  }, [])

  function join(e: FormEvent) {
    e.preventDefault()
    // Accept a pasted full link or just the code.
    const c = code.trim().replace(/\/+$/, '').split('/').pop() ?? ''
    if (c) nav('/vj/' + encodeURIComponent(c))
  }

  const mine = rows?.find(r => r.personal)
  const groupRows = rows?.filter(r => !r.personal) ?? []
  const showGroup = view !== 'private', showPrivate = view !== 'group'

  return (
    <>
    <div className="app">
      <div className="top">
        <div>
          <h1>Your vaults</h1>
          <div className="sub">Signed in as {displayName || user?.email}</div>
        </div>
        <button className="btn small" onClick={signOut}>Sign out</button>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {rows === null && !error && <Spinner />}
      <div className="seg" role="group" aria-label="Which vaults">
        {([['both', 'Both'], ['group', 'Group'], ['private', 'Private']] as Array<[View, string]>).map(([k, l]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
      </div>
      <div className="seg" role="group" aria-label="Show" style={{ marginTop: 8 }}>
        {([['vaults', 'Vaults'], ['items', 'All items']] as Array<[Layout, string]>).map(([k, l]) => <button key={k} aria-pressed={layout === k} onClick={() => setLayout(k)}>{l}</button>)}
      </div>
      {rows && layout === 'items' && <AllVaultItems vaults={rows.map(r => ({ id: r.id, name: r.name, personal: r.personal }))} view={view} />}
      {rows && layout === 'vaults' && showGroup && groupRows.length === 0 && (
        <div className="empty"><b>No group vaults yet</b>A vault keeps tickets, passes, reservations and documents in one place. Create one, or paste an invite link below to join a friend’s.</div>
      )}
      <div className="glist" hidden={layout === 'items'}>
        {rows && showPrivate && (mine
          ? (
            <div className="panel" key={mine.id}>
              <Link to={'/vault/' + mine.id}>
                <GroupIcon group={{ kind: 'Vault', icon: mine.icon, color: mine.color }} size={44} />
                <span className="nm gname">{mine.name}<span className="lnkchip">Private · only you</span></span>
                <span className="grt"><b>{counts[mine.id] ?? 0}</b><span className="muted small">{(counts[mine.id] ?? 0) === 1 ? 'item' : 'items'}</span></span>
              </Link>
            </div>
          ) : (
            <div className="panel" key="mine">
              <button className="btn block" disabled={opening} onClick={openPersonal}>{opening ? 'Opening…' : 'Open My vault: private, only you'}</button>
              <div className="muted small" style={{ marginTop: 6 }}>For insurance, passports and tickets too personal for a group. Nobody else can join it or see it.</div>
            </div>
          ))}
        {showGroup && groupRows.map(v => (
          <div className="panel" key={v.id}>
            <Link to={'/vault/' + v.id}>
              <GroupIcon group={{ kind: 'Vault', icon: v.icon, color: v.color }} size={44} />
              <span className="nm gname">{v.name}{v.group_id && groups[v.group_id] && <span className="lnkchip">Linked to {groups[v.group_id]}</span>}</span>
              <span className="grt"><b>{counts[v.id] ?? 0}</b><span className="muted small">{(counts[v.id] ?? 0) === 1 ? 'item' : 'items'}</span></span>
            </Link>
          </div>
        ))}
      </div>
      <Link className="btn primary block" to="/vaults/new" style={{ marginTop: 14 }}>Create a vault</Link>
      <div className="sect">
        <h2>Join a vault</h2>
        <form onSubmit={join} className="prow">
          <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Paste invite link or code" aria-label="Vault invite link or code" />
          <button className="btn">Join</button>
        </form>
      </div>
      <div className="sect"><ThemeToggle /></div>
    </div>
    <TopNav />
    </>
  )
}
