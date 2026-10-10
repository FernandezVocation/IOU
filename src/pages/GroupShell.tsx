import { createContext, useContext } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useGroupData } from '../lib/useGroupData'
import type { GroupData } from '../lib/types'
import { Spinner } from '../components/ui'
import { canEditGroup } from '../lib/access'

interface GroupCtx { data: GroupData; reload: () => Promise<void> }
const Ctx = createContext<GroupCtx | null>(null)
/** Exposed so tests can render a screen without the network-backed provider. */
export const GroupContext = Ctx

export function useGroup(): GroupCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGroup must be used inside a group route')
  return v
}

/** "You" for the signed-in traveler, otherwise their name. */
export function who(data: GroupData, id: string, you = true): string {
  const t = data.travelers.find(x => x.id === id)
  if (!t) return 'Someone'
  return you && data.me?.id === id ? 'You' : t.name
}
export const verbOwe = (data: GroupData, id: string) => (data.me?.id === id ? 'owe' : 'owes')

/** Loads the group once and shares it (live) with every screen under /g/:id. */
export function GroupProvider() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { data, error, loading, reload } = useGroupData(id, user?.id ?? '')
  if (loading && !data) return <Spinner label="Loading group…" />
  if (!data) {
    return (
      <div className="app">
        <div className="notice err" role="alert">{error ?? 'Could not load this group.'}</div>
        <Link className="btn block" to="/">Back to your groups</Link>
      </div>
    )
  }
  return <Ctx.Provider value={{ data, reload }}>{error && <div className="notice err" role="alert" style={{ margin: 12 }}>{error}</div>}<Outlet /></Ctx.Provider>
}

const icon = {
  list: <svg className="i" viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>,
  scale: <svg className="i" viewBox="0 0 24 24"><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z" /></svg>,
  receipt: <svg className="i" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" /></svg>,
  pie: <svg className="i" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></svg>,
  more: <svg className="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>,
  plus: <svg className="i" viewBox="0 0 24 24" style={{ stroke: 'currentColor', width: 26, height: 26 }}><path d="M12 5v14M5 12h14" /></svg>,
}

export function TabsShell() {
  const { data } = useGroup()
  const base = '/g/' + data.group.id
  const hasPeople = data.travelers.length > 0
  const canEdit = canEditGroup(data)
  return (
    <>
      <div className="app">
        <div className="top">
          <div>
            <Link className="backlink" to="/">← Your groups</Link> <Link className="backlink" to="/overview" style={{ marginLeft: 12 }}>Overview</Link>
            <h1>{data.group.name}</h1>
            <div className="sub">Balances in {data.group.currency} · {data.travelers.length} {data.travelers.length === 1 ? 'person' : 'people'}</div>
          </div>
        </div>
        {!canEdit && <div className="notice" role="status">You have view-only access. Ask the group owner if you need to add expenses.</div>}
        <Outlet />
      </div>
      {canEdit && <Link className={'fab' + (hasPeople ? '' : ' off')} to={base + '/expense/new'} aria-label="Add expense">{icon.plus}</Link>}
      <nav className="tabs" aria-label="Sections">
        <div className="in">
          <NavLink to={base} end>{icon.list}<span>Expenses</span></NavLink>
          <NavLink to={base + '/breakdown'}>{icon.pie}<span>Breakdown</span></NavLink>
          <NavLink to={base + '/balances'}>{icon.scale}<span>Balances</span></NavLink>
          <NavLink to={base + '/receipts'}>{icon.receipt}<span>Receipts</span></NavLink>
          <NavLink to={base + '/more'}>{icon.more}<span>More</span></NavLink>
        </div>
      </nav>
    </>
  )
}
