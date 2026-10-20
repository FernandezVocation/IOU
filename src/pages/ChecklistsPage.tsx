import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly } from '../lib/format'
import { CHECKLIST_COLS, ITEM_COLS, NO_FILTERS, counts, customTypeLabels, filterItems, iconByLabel, mergePeople, todayISO, type Checklist, type ChecklistItem, type Filters, type GroupBy, type Person } from '../lib/checklist'
import { tickItem } from '../lib/progress'
import { Spinner, useToast } from '../components/ui'
import TopNav from '../components/TopNav'
import ThemeToggle from '../components/ThemeToggle'
import GroupIcon from '../components/GroupIcon'
import { ChecklistFilters, ChecklistRows } from '../components/ChecklistRows'
import ChecklistExport from '../components/ChecklistExport'
import ChecklistItemSheet from '../components/ChecklistItemSheet'
import { useChecklistData } from '../lib/useChecklist'

const LS = 'iou.checklistLayout'
const read = (): 'lists' | 'all' => { try { return localStorage.getItem(LS) === 'all' ? 'all' : 'lists' } catch { return 'lists' } }

/** Opens the full item form for an item from another list, loading that list first. */
function OpenItem({ item, userId, allItems, onClose, onSaved }: { item: ChecklistItem; userId: string; allItems: ChecklistItem[]; onClose: () => void; onSaved: () => void }) {
  const { data } = useChecklistData(item.checklist_id, userId)
  if (!data) return null
  return <ChecklistItemSheet data={data} item={data.items.find(i => i.id === item.id) ?? item} allItems={allItems} onClose={onClose} onSaved={onSaved} />
}

export default function ChecklistsPage() {
  const nav = useNavigate()
  const toast = useToast()
  const { displayName, user, signOut } = useAuth()
  const me = user?.id ?? ''
  const [view, setView] = useState<'lists' | 'all'>(read)
  const [lists, setLists] = useState<Checklist[] | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [filters, setFilters] = useState<Filters>({ ...NO_FILTERS, status: 'open' })
  const [groupBy, setGroupBy] = useState<GroupBy>('due')
  const [open, setOpen] = useState<ChecklistItem | null>(null)
  const [exporting, setExporting] = useState(false)
  const ctx = useMemo(() => ({ today: todayISO(), me }), [me])

  async function load() {
    const [c, it] = await Promise.all([
      supabase.from('checklists').select(CHECKLIST_COLS).order('created_at', { ascending: false }),
      supabase.from('checklist_items').select(ITEM_COLS),
    ])
    if (c.error || it.error) { setError(friendly(c.error ?? it.error)); return }
    const rows = c.data as Checklist[]
    setLists(rows); setItems((it.data ?? []) as ChecklistItem[])
    const gids = rows.map(x => x.group_id).filter(Boolean) as string[]
    if (gids.length) {
      const g = await supabase.from('groups').select('id, name').in('id', gids)
      setGroups(Object.fromEntries(((g.data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name])))
    }
  }
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  function pick(v: 'lists' | 'all') { setView(v); try { localStorage.setItem(LS, v) } catch { /* optional */ } }
  function join(e: FormEvent) {
    e.preventDefault()
    const c = code.trim().replace(/\/+$/, '').split('/').pop() ?? ''
    if (c) nav('/cj/' + encodeURIComponent(c))
  }

  const people: Person[] = useMemo(() => mergePeople([
    items.flatMap(i => [
      ...(i.assigned_name || i.assigned_user ? [{ key: '', name: i.assigned_name || 'Someone', user: i.assigned_user }] : []),
      ...(i.completed_by_name || i.completed_by_user ? [{ key: '', name: i.completed_by_name || 'Someone', user: i.completed_by_user }] : []),
    ]),
  ]).map(p => ({ ...p, key: p.user ? 'u:' + p.user : 'n:' + p.name.toLowerCase() })), [items])
  const names = Object.fromEntries((lists ?? []).map(l => [l.id, l.name]))
  const shown = filterItems(items, filters, ctx)

  async function tick(i: ChecklistItem) {
    const r = await tickItem(i, me)
    if (r.error) { toast(friendly(r.error)); return }
    load()
  }

  return (
    <>
    <div className="app">
      <div className="top">
        <div><h1>Checklists</h1><div className="sub">Signed in as {displayName || user?.email}</div></div>
        <button className="btn small" onClick={signOut}>Sign out</button>
      </div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {lists === null && !error && <Spinner />}
      <div className="seg" role="group" aria-label="View" style={{ marginBottom: 12 }}>
        <button type="button" aria-pressed={view === 'lists'} onClick={() => pick('lists')}>Lists</button>
        <button type="button" aria-pressed={view === 'all'} onClick={() => pick('all')}>All items</button>
      </div>

      {view === 'lists' && lists && (
        <>
          {lists.length === 0 && <div className="empty"><b>No lists yet</b>A list holds to-dos, purchases, packing and more. Make one for yourself, or for a group.</div>}
          <div className="glist">
            {lists.map(l => {
              const c = counts(items.filter(i => i.checklist_id === l.id), ctx.today)
              return (
                <div className="panel" key={l.id}>
                  <Link to={'/checklist/' + l.id}>
                    <GroupIcon group={{ kind: 'Checklist', icon: l.icon, color: l.color }} size={44} />
                    <span className="nm gname">{l.name}{l.group_id && groups[l.group_id] && <span className="lnkchip">Linked to {groups[l.group_id]}</span>}</span>
                    <span className="grt"><b>{c.done}/{c.total}</b><span className="muted small">{c.overdue > 0 ? `${c.overdue} overdue` : 'done'}</span></span>
                  </Link>
                </div>
              )
            })}
          </div>
          <Link className="btn primary block" to="/checklists/new" style={{ marginTop: 14 }}>Create a list</Link>
          <div className="sect">
            <h2>Join a list</h2>
            <form onSubmit={join} className="prow">
              <input type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Paste invite link or code" aria-label="Checklist invite link or code" />
              <button className="btn">Join</button>
            </form>
          </div>
        </>
      )}

      {view === 'all' && lists && (
        <>
          <ChecklistFilters filters={filters} onChange={setFilters} groupBy={groupBy} onGroupBy={setGroupBy} people={people} customLabels={customTypeLabels(items)} icons={iconByLabel(items)} me={me} />
          {items.length > 0 && <button className="btn small" style={{ marginBottom: 8 }} onClick={() => setExporting(true)}>Export</button>}
          {shown.length === 0 && <div className="empty"><b>Nothing to show</b>{items.length ? 'Clear the filters to see everything.' : 'Items from all your lists appear here.'}</div>}
          <ChecklistRows items={shown} people={people} ctx={ctx} groupBy={groupBy} listNames={names} onTick={tick} onOpen={setOpen} />
        </>
      )}
      <div className="sect"><ThemeToggle /></div>
    </div>
    {exporting && <ChecklistExport items={items} title="All checklist items" people={people} ctx={ctx} listNames={names} startFilters={filters} startGroupBy={groupBy} onClose={() => setExporting(false)} />}
    {open && <OpenItem item={open} userId={me} allItems={items} onClose={() => setOpen(null)} onSaved={load} />}
    <TopNav />
    </>
  )
}
