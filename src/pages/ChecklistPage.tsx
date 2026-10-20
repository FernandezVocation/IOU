import { useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { useChecklistData } from '../lib/useChecklist'
import { NO_FILTERS, counts, customTypeLabels, filterItems, iconByLabel, todayISO, type ChecklistItem, type Filters, type GroupBy } from '../lib/checklist'
import { tickItem } from '../lib/progress'
import { Spinner, useToast } from '../components/ui'
import GroupIcon from '../components/GroupIcon'
import { ChecklistFilters, ChecklistRows } from '../components/ChecklistRows'
import ChecklistItemSheet from '../components/ChecklistItemSheet'
import ChecklistExport from '../components/ChecklistExport'
import ChecklistSettings from '../components/ChecklistSettings'

/** One list: quick add, filters, and the items. */
export default function ChecklistPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const me = user?.id ?? ''
  const toast = useToast()
  const { data, error, loading, reload } = useChecklistData(id, me)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [quick, setQuick] = useState('')
  const [sheet, setSheet] = useState<{ item?: ChecklistItem } | null>(null)
  const [settings, setSettings] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const ctx = useMemo(() => ({ today: todayISO(), me }), [me])

  if (loading) return <Spinner />
  if (error || !data) return <div className="app"><Link className="backlink" to="/checklists">← Checklists</Link><div className="notice err" role="alert">{error ?? 'Not found.'}</div></div>

  const l = data.list
  const shown = filterItems(data.items, filters, ctx)
  const c = counts(data.items, ctx.today)

  async function add(e: FormEvent) {
    e.preventDefault()
    const t = quick.trim()
    if (!t) return
    if (l.default_type === 'custom' && !l.default_label) { setSheet({}); return }
    setBusy(true)
    const r = await supabase.from('checklist_items').insert({ checklist_id: l.id, title: t.slice(0, 120), type: l.default_type, type_label: l.default_type === 'custom' ? l.default_label : '', created_by: me })
    setBusy(false)
    if (r.error) { toast(friendly(r.error)); return }
    setQuick(''); reload()
  }
  async function tick(i: ChecklistItem) {
    const r = await tickItem(i, me)
    if (r.error) { toast(friendly(r.error)); return }
    reload()
  }

  return (
    <div className="app">
      <div className="top wrapped">
        <div className="crumbs"><Link className="backlink" to="/checklists">← Checklists</Link></div>
        <div className="ck-title-row">
          <GroupIcon group={{ kind: 'Checklist', icon: l.icon, color: l.color }} size={40} />
          <div style={{ minWidth: 0 }}>
            <h1>{l.name}</h1>
            <div className="sub">{c.done} of {c.total} done{c.overdue > 0 ? ` · ${c.overdue} overdue` : ''}{data.groupName ? ` · ${data.groupName}` : ''}</div>
          </div>
          <button className="btn small" onClick={() => setExporting(true)}>Export</button>
          <button className="btn small" onClick={() => setSettings(true)}>People</button>
        </div>
      </div>

      <form onSubmit={add} className="prow ck-quick">
        <input type="text" value={quick} onChange={e => setQuick(e.target.value)} maxLength={120} placeholder="Add an item" aria-label="Add an item" />
        <button className="btn primary" disabled={busy || !quick.trim()}>Add</button>
        <button type="button" className="btn" onClick={() => setSheet({})}>Details</button>
      </form>

      <ChecklistFilters filters={filters} onChange={setFilters} groupBy={groupBy} onGroupBy={setGroupBy} people={data.people} customLabels={customTypeLabels(data.items)} icons={iconByLabel(data.items)} me={me} />

      {data.items.length === 0 && <div className="empty"><b>Nothing here yet</b>Add the first item above. Each item can be a to-do, a purchase, something to pack, something to book, or your own type.</div>}
      {data.items.length > 0 && shown.length === 0 && <div className="empty"><b>No items match</b>Clear the filters to see everything.</div>}
      <ChecklistRows items={shown} people={data.people} ctx={ctx} groupBy={groupBy} onTick={tick} onOpen={i => setSheet({ item: i })} />

      {sheet && <ChecklistItemSheet data={data} item={sheet.item} allItems={data.items} onClose={() => setSheet(null)} onSaved={reload} />}
      {exporting && <ChecklistExport items={data.items} title={l.name} people={data.people} ctx={ctx} startFilters={filters} startGroupBy={groupBy} onClose={() => setExporting(false)} />}
      {settings && <ChecklistSettings data={data} reload={reload} onClose={() => setSettings(false)} />}
    </div>
  )
}
