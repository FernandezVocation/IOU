import { useState } from 'react'
import ChecklistTypeIcon from './ChecklistTypeIcon'
import {
  NO_FILTERS, STATUSES, TYPES, dueText, groupItems, isFiltered, isOverdue, statusLabel, typeLabel, whoName,
  type ChecklistItem, type Ctx, type Filters, type GroupBy, type Person,
} from '../lib/checklist'

/** The list itself: a round tick, the title, and small chips for type, date and people. */
export function ChecklistRows({ items, people, ctx, groupBy, listNames, onTick, onOpen }: {
  items: ChecklistItem[]; people: Person[]; ctx: Ctx; groupBy: GroupBy
  listNames?: Record<string, string>
  onTick: (i: ChecklistItem) => void; onOpen: (i: ChecklistItem) => void
}) {
  const sections = groupItems(items, groupBy, ctx, people)
  return (
    <div className="ck-list">
      {sections.map(s => (
        <section key={s.key} aria-label={s.label || 'Items'}>
          {s.label && <h3 className="ck-head">{s.label} <span className="muted small">{s.items.length}</span></h3>}
          {s.items.map(i => {
            const who = i.assigned_user || i.assigned_name ? whoName(i.assigned_name, i.assigned_user, people) : ''
            const doneBy = i.status === 'completed' && (i.completed_by_user || i.completed_by_name) ? whoName(i.completed_by_name, i.completed_by_user, people) : ''
            const late = isOverdue(i, ctx.today)
            return (
              <div className={'ck-row' + (i.status === 'completed' ? ' done' : '')} key={i.id}>
                <button className={'ck-tick ' + i.status} aria-label={i.status === 'completed' ? `Reopen ${i.title}` : `Mark ${i.title} completed`} aria-pressed={i.status === 'completed'} onClick={() => onTick(i)}>
                  {i.status === 'completed' ? '✓' : i.status === 'in_progress' ? '◐' : ''}
                </button>
                <button className="ck-main" onClick={() => onOpen(i)} aria-label={`Open ${i.title}`}>
                  <span className="ck-title"><ChecklistTypeIcon type={i.type} icon={i.type_icon} />{i.title}{i.qty > 1 && <span className="muted"> ×{i.qty}</span>}</span>
                  <span className="ck-meta">
                    <span className="ck-chip">{typeLabel(i)}</span>
                    {i.status === 'in_progress' && <span className="ck-chip prog">In progress</span>}
                    {i.due_on && <span className={'ck-chip' + (late ? ' late' : '')}>{late ? 'Overdue · ' : ''}{dueText(i.due_on)}</span>}
                    {who && <span className="ck-chip">{who}</span>}
                    {i.type === 'packing' && i.packed_in && <span className="ck-chip">in {i.packed_in}</span>}
                    {i.type === 'purchase' && i.est_amount != null && <span className="ck-chip">{i.est_currency} {i.est_amount}</span>}
                    {doneBy && <span className="ck-chip ok">Done by {doneBy}</span>}
                    {listNames?.[i.checklist_id] && <span className="ck-chip list">{listNames[i.checklist_id]}</span>}
                  </span>
                </button>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

type FieldProps = {
  filters: Filters; onChange: (f: Filters) => void; groupBy: GroupBy; onGroupBy: (g: GroupBy) => void
  people: Person[]; customLabels: string[]; me: string; icons?: Record<string, string>; idp?: string
}

/** The filter and grouping controls themselves, shared by the list screens and the export sheet. */
export function FilterFields({ filters, onChange, groupBy, onGroupBy, people, customLabels, me, icons = {}, idp = 'ckf' }: FieldProps) {
  const set = (p: Partial<Filters>) => onChange({ ...filters, ...p })
  return (
    <>
      <span className="lbl" style={{ marginTop: 0 }}>Type</span>
      <div className="chips" role="group" aria-label="Filter by type">
        <button className="chip" aria-pressed={filters.type === 'all'} onClick={() => set({ type: 'all' })}>All</button>
        {TYPES.filter(t => t.id !== 'custom').map(t => <button key={t.id} className="chip" aria-pressed={filters.type === t.id} onClick={() => set({ type: t.id })}><ChecklistTypeIcon type={t.id} size={16} /> {t.label}</button>)}
        {customLabels.map(l => <button key={l} className="chip" aria-pressed={filters.type === 'c:' + l} onClick={() => set({ type: 'c:' + l })}><ChecklistTypeIcon type="custom" size={16} icon={icons[l]} /> {l}</button>)}
      </div>
      <span className="lbl">Status</span>
      <div className="chips" role="group" aria-label="Filter by status">
        {([['all', 'All'], ['open', 'Not done']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={filters.status === k} onClick={() => set({ status: k })}>{l}</button>)}
        {STATUSES.map(s => <button key={s.id} className="chip" aria-pressed={filters.status === s.id} onClick={() => set({ status: s.id })}>{s.label}</button>)}
      </div>
      <label className="lbl" htmlFor={idp + '-as'}>Assigned to</label>
      <select id={idp + '-as'} value={filters.assignee} onChange={e => set({ assignee: e.target.value })}>
        <option value="all">Anyone</option><option value="me">Me</option><option value="none">Unassigned</option>
        {people.filter(p => p.user !== me).map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>
      <label className="lbl" htmlFor={idp + '-db'}>Completed by</label>
      <select id={idp + '-db'} value={filters.doneBy} onChange={e => set({ doneBy: e.target.value })}>
        <option value="all">Anyone</option>
        {people.map(p => <option key={p.key} value={p.key}>{p.user === me ? 'Me' : p.name}</option>)}
      </select>
      <label className="lbl" htmlFor={idp + '-wh'}>Due date</label>
      <select id={idp + '-wh'} value={filters.when} onChange={e => set({ when: e.target.value as Filters['when'] })}>
        <option value="all">Any time</option><option value="overdue">Overdue</option><option value="today">Today</option>
        <option value="week">Next 7 days</option><option value="none">No date</option><option value="range">Between dates…</option>
      </select>
      {filters.when === 'range' && (
        <div className="prow" style={{ marginTop: 8 }}>
          <input type="date" aria-label="From" value={filters.from} onChange={e => set({ from: e.target.value })} />
          <input type="date" aria-label="To" value={filters.to} onChange={e => set({ to: e.target.value })} />
        </div>
      )}
      <label className="lbl" htmlFor={idp + '-gb'}>Group by</label>
      <select id={idp + '-gb'} value={groupBy} onChange={e => onGroupBy(e.target.value as GroupBy)}>
        <option value="none">Nothing</option><option value="status">Status</option><option value="due">Due date</option>
        <option value="assignee">Assigned to</option><option value="type">Type</option>
      </select>
    </>
  )
}

/** Collapsible filter and grouping panel, used by one list and by the "All items" view. */
export function ChecklistFilters(p: FieldProps) {
  const { filters, onChange } = p
  const [open, setOpen] = useState(false)
  const active = isFiltered(filters)
  return (
    <div className="ck-filters">
      <div className="prow">
        <input type="search" aria-label="Search items" placeholder="Search" value={filters.q} onChange={e => onChange({ ...filters, q: e.target.value })} />
        <button className="btn" aria-expanded={open} onClick={() => setOpen(o => !o)}>Filters{active ? ' •' : ''}</button>
      </div>
      {open && (
        <div className="panel ck-panel">
          <FilterFields {...p} />
          {active && <button className="btn small" style={{ marginTop: 12 }} onClick={() => onChange(NO_FILTERS)}>Clear filters</button>}
        </div>
      )}
    </div>
  )
}

export { statusLabel }
