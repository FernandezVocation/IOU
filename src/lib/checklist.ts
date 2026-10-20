/** Checklists: types, filtering, sorting and grouping. Pure functions, no network. */
export type ItemType = 'todo' | 'purchase' | 'packing' | 'booking' | 'custom'
export type Status = 'todo' | 'in_progress' | 'completed'

export interface ChecklistItem {
  id: string; checklist_id: string; type: ItemType; type_label: string; title: string; notes: string; status: Status
  due_on: string | null; assigned_name: string; assigned_user: string | null
  completed_by_name: string; completed_by_user: string | null; completed_at: string | null
  est_amount: number | null; est_currency: string | null; qty: number; packed_in: string; booking_ref: string
  expense_id: string | null; itinerary_item_id: string | null; vault_item_id: string | null
  created_by: string; created_at: string
}
export interface Checklist {
  id: string; name: string; icon: string | null; color: string | null; default_type: ItemType; default_label: string
  group_id: string | null; invite_code: string; created_by: string | null; created_at: string
}
/** Someone who can be assigned: a person with an account (user set) or a name only. */
export interface Person { key: string; name: string; user: string | null }

export const CHECKLIST_COLS = 'id, name, icon, color, default_type, default_label, group_id, invite_code, created_by, created_at'
export const ITEM_COLS = 'id, checklist_id, type, type_label, title, notes, status, due_on, assigned_name, assigned_user, completed_by_name, completed_by_user, completed_at, est_amount, est_currency, qty, packed_in, booking_ref, expense_id, itinerary_item_id, vault_item_id, created_by, created_at'

export const TYPES: Array<{ id: ItemType; label: string; hint: string }> = [
  { id: 'todo', label: 'To-do', hint: 'A task to get done' },
  { id: 'purchase', label: 'Purchase', hint: 'Something to buy' },
  { id: 'packing', label: 'Packing', hint: 'Something to pack' },
  { id: 'booking', label: 'To book', hint: 'Something to reserve' },
  { id: 'custom', label: 'Custom', hint: 'Your own type' },
]
export const STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'todo', label: 'To do' }, { id: 'in_progress', label: 'In progress' }, { id: 'completed', label: 'Completed' },
]
export const statusLabel = (s: Status) => STATUSES.find(x => x.id === s)?.label ?? s
export const typeLabel = (i: Pick<ChecklistItem, 'type' | 'type_label'>) =>
  i.type === 'custom' ? (i.type_label || 'Custom') : TYPES.find(t => t.id === i.type)?.label ?? i.type

/** Identity of whoever an item is assigned to or completed by. */
export const assigneeKey = (i: Pick<ChecklistItem, 'assigned_name' | 'assigned_user'>) => i.assigned_user ? 'u:' + i.assigned_user : i.assigned_name ? 'n:' + i.assigned_name.toLowerCase() : ''
export const doneByKey = (i: Pick<ChecklistItem, 'completed_by_name' | 'completed_by_user'>) => i.completed_by_user ? 'u:' + i.completed_by_user : i.completed_by_name ? 'n:' + i.completed_by_name.toLowerCase() : ''
export const personKey = (p: { name: string; user: string | null }) => p.user ? 'u:' + p.user : 'n:' + p.name.toLowerCase()

/** Names to show for an item's assignee / completer, using the person list when the account is known. */
export function whoName(name: string, user: string | null, people: Person[]): string {
  if (user) return people.find(p => p.user === user)?.name || name || 'Someone'
  return name
}

/** One entry per person: people with accounts first, then name-only people, no duplicates. */
export function mergePeople(lists: Person[][]): Person[] {
  const seen = new Map<string, Person>()
  for (const l of lists) for (const p of l) if (p.name.trim() && !seen.has(personKey(p))) seen.set(personKey(p), p)
  // an account person and a name-only person with the same name are the same human
  const byUserName = new Set([...seen.values()].filter(p => p.user).map(p => p.name.toLowerCase()))
  return [...seen.values()].filter(p => p.user || !byUserName.has(p.name.toLowerCase()))
    .sort((a, b) => Number(!!b.user) - Number(!!a.user) || a.name.localeCompare(b.name))
}

export type When = 'all' | 'overdue' | 'today' | 'week' | 'none' | 'range'
export interface Filters {
  type: 'all' | ItemType | string          // 'all', a built-in type, or the label of a custom type as 'c:Label'
  status: 'all' | 'open' | Status           // 'open' = not completed
  assignee: 'all' | 'me' | 'none' | string  // a person key
  doneBy: 'all' | string
  when: When
  from: string; to: string
  q: string
}
export const NO_FILTERS: Filters = { type: 'all', status: 'all', assignee: 'all', doneBy: 'all', when: 'all', from: '', to: '', q: '' }
export const isFiltered = (f: Filters) => JSON.stringify(f) !== JSON.stringify(NO_FILTERS)

export const todayISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + n))
}
export const isOverdue = (i: Pick<ChecklistItem, 'due_on' | 'status'>, today: string) => !!i.due_on && i.status !== 'completed' && i.due_on < today

export interface Ctx { today: string; me: string | null }

export function matches(i: ChecklistItem, f: Filters, c: Ctx): boolean {
  if (f.type !== 'all') {
    if (f.type.startsWith('c:')) { if (!(i.type === 'custom' && i.type_label === f.type.slice(2))) return false }
    else if (i.type !== f.type) return false
  }
  if (f.status === 'open') { if (i.status === 'completed') return false } else if (f.status !== 'all' && i.status !== f.status) return false
  if (f.assignee !== 'all') {
    const k = assigneeKey(i)
    if (f.assignee === 'me') { if (!c.me || k !== 'u:' + c.me) return false }
    else if (f.assignee === 'none') { if (k) return false }
    else if (k !== f.assignee) return false
  }
  if (f.doneBy !== 'all' && doneByKey(i) !== f.doneBy) return false
  switch (f.when) {
    case 'overdue': if (!isOverdue(i, c.today)) return false; break
    case 'today': if (i.due_on !== c.today) return false; break
    case 'week': if (!i.due_on || i.due_on < c.today || i.due_on > addDays(c.today, 6)) return false; break
    case 'none': if (i.due_on) return false; break
    case 'range':
      if (!i.due_on) return false
      if (f.from && i.due_on < f.from) return false
      if (f.to && i.due_on > f.to) return false
      break
  }
  const q = f.q.trim().toLowerCase()
  if (q && ![i.title, i.notes, i.packed_in, i.assigned_name, typeLabel(i)].some(s => s.toLowerCase().includes(q))) return false
  return true
}
export const filterItems = (items: ChecklistItem[], f: Filters, c: Ctx) => items.filter(i => matches(i, f, c))

const STATUS_ORDER: Record<Status, number> = { in_progress: 0, todo: 1, completed: 2 }
/** Open items first (in progress, then to do), by due date with undated last; completed at the bottom. */
export function sortItems(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort((a, b) =>
    (a.status === 'completed' ? 1 : 0) - (b.status === 'completed' ? 1 : 0)
    || (a.due_on ?? '9999').localeCompare(b.due_on ?? '9999')
    || STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    || a.created_at.localeCompare(b.created_at))
}

export type GroupBy = 'none' | 'status' | 'due' | 'assignee' | 'type'
export interface Section { key: string; label: string; items: ChecklistItem[] }

export function dueBucket(i: ChecklistItem, today: string): { key: string; label: string } {
  if (i.status === 'completed') return { key: '9', label: 'Completed' }
  if (!i.due_on) return { key: '5', label: 'No date' }
  if (i.due_on < today) return { key: '0', label: 'Overdue' }
  if (i.due_on === today) return { key: '1', label: 'Today' }
  if (i.due_on <= addDays(today, 6)) return { key: '2', label: 'This week' }
  return { key: '3', label: 'Later' }
}

export function groupItems(items: ChecklistItem[], by: GroupBy, c: Ctx, people: Person[]): Section[] {
  const sorted = sortItems(items)
  if (by === 'none') return [{ key: 'all', label: '', items: sorted }]
  const map = new Map<string, Section & { ord: string }>()
  for (const i of sorted) {
    let key: string, label: string, ord: string
    if (by === 'status') { key = i.status; label = statusLabel(i.status); ord = String(STATUS_ORDER[i.status]) }
    else if (by === 'due') { const b = dueBucket(i, c.today); key = b.key; label = b.label; ord = b.key }
    else if (by === 'type') { label = typeLabel(i); key = 't:' + label; ord = label.toLowerCase() }
    else {
      const k = assigneeKey(i)
      key = k || '~none'; label = k ? whoName(i.assigned_name, i.assigned_user, people) || 'Someone' : 'Unassigned'
      ord = k ? '1' + label.toLowerCase() : '2'
    }
    const s = map.get(key) ?? { key, label, items: [], ord }
    s.items.push(i); map.set(key, s)
  }
  return [...map.values()].sort((a, b) => a.ord.localeCompare(b.ord)).map(({ ord: _o, ...s }) => s)
}

export const customTypeLabels = (items: ChecklistItem[]) =>
  [...new Set(items.filter(i => i.type === 'custom' && i.type_label).map(i => i.type_label))].sort((a, b) => a.localeCompare(b))

export function counts(items: ChecklistItem[], today: string) {
  const done = items.filter(i => i.status === 'completed').length
  return { total: items.length, done, open: items.length - done, overdue: items.filter(i => isOverdue(i, today)).length }
}

/** "Oct 12" style date for a due date, or '' */
export function dueText(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Text the "Mark purchased" button hands to the expense form. */
export function purchaseQuery(i: ChecklistItem): string {
  const q = new URLSearchParams()
  q.set('vendor', i.title.slice(0, 120)); q.set('checklist', i.id)
  if (i.est_amount != null && i.est_amount > 0) q.set('amount', String(i.est_amount))
  if (i.notes) q.set('description', i.notes.slice(0, 200))
  if (i.booking_ref) q.set('ref', i.booking_ref)
  return q.toString()
}
/** Text the "Convert to itinerary item" button hands to the itinerary item form. */
export function bookingQuery(i: ChecklistItem): string {
  const q = new URLSearchParams()
  q.set('title', i.title.slice(0, 120))
  if (i.due_on) q.set('date', i.due_on)
  if (i.booking_ref) q.set('ref', i.booking_ref)
  if (i.notes) q.set('description', i.notes.slice(0, 200))
  return q.toString()
}
