import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import ChecklistTypeIcon from './ChecklistTypeIcon'
import { Sheet, ConfirmDialog, useToast } from './ui'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { ICONS } from '../lib/groupLook'
import { CUSTOM_ICONS, STATUSES, TYPES, bookingQuery, customTypeLabels, iconByLabel, purchaseQuery, whoName, type ChecklistItem, type ItemType, type Status } from '../lib/checklist'
import type { ChecklistData } from '../lib/useChecklist'

const LS = 'iou.customChecklistTypes'
function remembered(): string[] { try { return JSON.parse(localStorage.getItem(LS) ?? '[]') as string[] } catch { return [] } }
function remember(label: string) {
  if (!label) return
  try { localStorage.setItem(LS, JSON.stringify([...new Set([label, ...remembered()])].slice(0, 30))) } catch { /* optional */ }
}

interface Opt { id: string; title: string }

/** Add or change one item. People who did not add it can still change status, assignee and who completed it. */
export default function ChecklistItemSheet({ data, item, allItems, onClose, onSaved }: {
  data: ChecklistData; item?: ChecklistItem; allItems: ChecklistItem[]; onClose: () => void; onSaved: () => void
}) {
  const toast = useToast()
  const { list, people, userId } = data
  const editable = !item || data.canChange(item)
  const [type, setType] = useState<ItemType>(item?.type ?? list.default_type)
  const [label, setLabel] = useState(item?.type_label ?? (list.default_type === 'custom' ? list.default_label : ''))
  const [icon, setIcon] = useState(item?.type_icon ?? '')
  const [title, setTitle] = useState(item?.title ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [due, setDue] = useState(item?.due_on ?? '')
  const [status, setStatus] = useState<Status>(item?.status ?? 'todo')
  const [assignee, setAssignee] = useState(item ? (item.assigned_user ? 'u:' + item.assigned_user : item.assigned_name ? 'n:' + item.assigned_name.toLowerCase() : '') : '')
  const [doneBy, setDoneBy] = useState(item ? (item.completed_by_user ? 'u:' + item.completed_by_user : item.completed_by_name ? 'n:' + item.completed_by_name.toLowerCase() : 'u:' + userId) : 'u:' + userId)
  const [amount, setAmount] = useState(item?.est_amount != null ? String(item.est_amount) : '')
  const [cur, setCur] = useState(item?.est_currency ?? '')
  const [qty, setQty] = useState(String(item?.qty ?? 1))
  const [packedIn, setPackedIn] = useState(item?.packed_in ?? '')
  const [ref, setRef] = useState(item?.booking_ref ?? '')
  const [expenseId, setExpenseId] = useState(item?.expense_id ?? '')
  const [planId, setPlanId] = useState(item?.itinerary_item_id ?? '')
  const [vaultId, setVaultId] = useState(item?.vault_item_id ?? '')
  const [expenses, setExpenses] = useState<Opt[]>([])
  const [plans, setPlans] = useState<Opt[]>([])
  const [vaults, setVaults] = useState<Opt[]>([])
  const [trips, setTrips] = useState<Opt[]>([])
  const [trip, setTrip] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  const iconsByName = useMemo(() => iconByLabel(allItems), [allItems])
  const known = useMemo(() => [...new Set([...customTypeLabels(allItems), ...remembered()])].sort((a, b) => a.localeCompare(b)), [allItems])

  // Things this item can point at. Each list is optional, so a failure just leaves that picker empty.
  useEffect(() => {
    (async () => {
      const [v, p, e, tr] = await Promise.all([
        supabase.from('vault_items').select('id, title').order('title').limit(300),
        supabase.from('itinerary_items').select('id, title').order('title').limit(300),
        list.group_id ? supabase.from('expenses').select('id, vendor, description').eq('group_id', list.group_id).order('spent_on', { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
        supabase.from('itineraries').select('id, name').order('name'),
      ])
      const tl = ((tr.data ?? []) as Array<{ id: string; name: string }>).map(x => ({ id: x.id, title: x.name }))
      setTrips(tl); if (tl.length) setTrip(tl[0].id)
      setVaults(((v.data ?? []) as Opt[]))
      setPlans(((p.data ?? []) as Opt[]))
      setExpenses(((e.data ?? []) as Array<{ id: string; vendor: string; description: string }>).map(x => ({ id: x.id, title: x.vendor || x.description || 'Expense' })))
    })().catch(() => { /* pickers stay empty */ })
  }, [list.group_id])

  const person = (k: string) => people.find(p => p.key === k)
  const showMoney = type === 'purchase'
  const showQty = type === 'purchase' || type === 'packing'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Give the item a title.'); return }
    if (type === 'custom' && !label.trim()) { setError('Name your custom type.'); return }
    const amt = amount.trim() ? Number(amount) : null
    if (amt != null && !(amt >= 0)) { setError('Enter a valid price.'); return }
    if (amt != null && !/^[A-Za-z]{3}$/.test(cur.trim())) { setError('Add a 3-letter currency, like CAD, next to the price.'); return }
    setBusy(true); setError(null)
    const row = {
      type, type_label: type === 'custom' ? label.trim() : '', type_icon: type === 'custom' ? icon : '', title: title.trim(), notes: notes.trim(), due_on: due || null,
      est_amount: showMoney ? amt : null, est_currency: showMoney && amt != null ? cur.trim().toUpperCase() : null,
      qty: showQty ? Math.min(999, Math.max(1, Math.round(Number(qty) || 1))) : 1,
      packed_in: type === 'packing' ? packedIn.trim() : '', booking_ref: type === 'booking' || type === 'purchase' ? ref.trim() : '',
      expense_id: expenseId || null, itinerary_item_id: planId || null, vault_item_id: vaultId || null,
    }
    let id = item?.id
    if (item) {
      if (editable) {
        const r = await supabase.from('checklist_items').update(row).eq('id', item.id)
        if (r.error) { setBusy(false); setError(friendly(r.error)); return }
      }
    } else {
      const r = await supabase.from('checklist_items').insert({ ...row, checklist_id: list.id, created_by: userId }).select('id').single()
      if (r.error || !r.data) { setBusy(false); setError(friendly(r.error)); return }
      id = (r.data as { id: string }).id
    }
    const a = person(assignee), d = person(doneBy)
    const p = await supabase.rpc('set_checklist_item_progress', {
      p_item: id, p_status: status,
      p_assigned_name: a?.name ?? '', p_assigned_user: a?.user ?? null,
      p_completed_by_name: status === 'completed' ? (d?.name ?? '') : '', p_completed_by_user: status === 'completed' ? (d?.user ?? null) : null,
    })
    setBusy(false)
    if (p.error) { setError(friendly(p.error)); return }
    if (type === 'custom') remember(label.trim())
    toast(item ? 'Saved.' : 'Added.')
    onSaved(); onClose()
  }

  async function remove() {
    if (!item) return
    setBusy(true)
    const r = await supabase.from('checklist_items').delete().eq('id', item.id)
    setBusy(false)
    if (r.error) { setError(friendly(r.error)); setConfirmDel(false); return }
    toast('Deleted.'); onSaved(); onClose()
  }

  return (
    <Sheet title={item ? 'Item' : 'New item'} onClose={onClose}>
      <form onSubmit={submit} className="panel">
        {!editable && <div className="notice">You didn’t add this item, so you can change who it’s with and whether it’s done. The rest is the author’s or an admin’s to change.</div>}
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
          <span className="lbl" style={{ marginTop: 0 }}>Type</span>
          <div className="chips" role="group" aria-label="Item type">
            {TYPES.map(t => <button type="button" key={t.id} className="chip" aria-pressed={type === t.id} onClick={() => setType(t.id)}><ChecklistTypeIcon type={t.id} size={16} icon={t.id === 'custom' ? icon : undefined} /> {t.label}</button>)}
          </div>
          {type === 'custom' && (
            <>
              <label className="lbl" htmlFor="ck-label">Name of this type</label>
              <input id="ck-label" list="ck-labels" type="text" value={label} onChange={e => { setLabel(e.target.value); const k = iconsByName[e.target.value]; if (k) setIcon(k) }} maxLength={40} placeholder="Gift, Chore, Visa…" />
              <datalist id="ck-labels">{known.map(k => <option key={k} value={k} />)}</datalist>
              <span className="lbl" id="ck-icl">Icon</span>
              <div className="ck-icons" role="group" aria-labelledby="ck-icl">
                {CUSTOM_ICONS.map(id => {
                  const d = ICONS.find(x => x.id === id)
                  return d ? (
                    <button type="button" key={id} className="ck-icopick" aria-pressed={(icon || 'star') === id} aria-label={d.label} title={d.label} onClick={() => setIcon(id)}>
                      <ChecklistTypeIcon type="custom" icon={id} size={22} />
                    </button>
                  ) : null
                })}
              </div>
            </>
          )}
          <label className="lbl" htmlFor="ck-title">Title</label>
          <input id="ck-title" type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder={type === 'purchase' ? 'Travel adapter' : type === 'packing' ? 'Passport' : 'What needs doing'} required autoFocus={!item} />
          <label className="lbl" htmlFor="ck-notes">Notes</label>
          <textarea id="ck-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} />
          <label className="lbl" htmlFor="ck-due">Due date</label>
          <input id="ck-due" type="date" value={due} onChange={e => setDue(e.target.value)} />
          {showMoney && (
            <div className="prow" style={{ marginTop: 10 }}>
              <div style={{ flex: 2 }}><label className="lbl" htmlFor="ck-amt" style={{ marginTop: 0 }}>Estimated price</label><input id="ck-amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
              <div style={{ flex: 1 }}><label className="lbl" htmlFor="ck-cur" style={{ marginTop: 0 }}>Currency</label><input id="ck-cur" value={cur} onChange={e => setCur(e.target.value.toUpperCase())} maxLength={3} placeholder="CAD" /></div>
            </div>
          )}
          {showQty && (<><label className="lbl" htmlFor="ck-qty">Quantity</label><input id="ck-qty" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value.replace(/\D/g, ''))} /></>)}
          {type === 'packing' && (<><label className="lbl" htmlFor="ck-pk">Packed in</label><input id="ck-pk" value={packedIn} onChange={e => setPackedIn(e.target.value)} maxLength={60} placeholder="Carry-on, blue suitcase, daypack" /></>)}
          {(type === 'booking' || type === 'purchase') && (<><label className="lbl" htmlFor="ck-ref">Booking code (optional)</label><input id="ck-ref" value={ref} onChange={e => setRef(e.target.value)} maxLength={60} /></>)}
        </fieldset>

        <label className="lbl" htmlFor="ck-status">Status</label>
        <select id="ck-status" value={status} onChange={e => setStatus(e.target.value as Status)}>
          {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <label className="lbl" htmlFor="ck-as">Assigned to</label>
        <select id="ck-as" value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>
          {people.map(p => <option key={p.key} value={p.key}>{p.name}{p.user === userId ? ' (me)' : p.user ? '' : ' (no account)'}</option>)}
        </select>
        {status === 'completed' && (
          <>
            <label className="lbl" htmlFor="ck-db">Completed by</label>
            <select id="ck-db" value={doneBy} onChange={e => setDoneBy(e.target.value)}>
              {people.map(p => <option key={p.key} value={p.key}>{p.user === userId ? 'Me' : p.name}</option>)}
            </select>
          </>
        )}

        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
          {list.group_id && expenses.length > 0 && (<><label className="lbl" htmlFor="ck-ex">Linked expense</label>
            <select id="ck-ex" value={expenseId} onChange={e => setExpenseId(e.target.value)}><option value="">None</option>{expenses.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></>)}
          {plans.length > 0 && (<><label className="lbl" htmlFor="ck-pl">Linked itinerary item</label>
            <select id="ck-pl" value={planId} onChange={e => setPlanId(e.target.value)}><option value="">None</option>{plans.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></>)}
          {vaults.length > 0 && (<><label className="lbl" htmlFor="ck-vt">Linked vault item</label>
            <select id="ck-vt" value={vaultId} onChange={e => setVaultId(e.target.value)}><option value="">None</option>{vaults.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></>)}
        </fieldset>

        {item && type === 'purchase' && list.group_id && !item.expense_id && (
          <Link className="btn block" style={{ marginTop: 12 }} to={`/g/${list.group_id}/expense/new?${purchaseQuery(item)}`}>Mark purchased: add the expense</Link>
        )}
        {item && type === 'booking' && !item.itinerary_item_id && trips.length > 0 && (
          <div className="prow" style={{ marginTop: 12 }}>
            <select aria-label="Itinerary to add to" value={trip} onChange={e => setTrip(e.target.value)}>{trips.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
            <Link className="btn" to={`/itinerary/${trip}/item/new?${bookingQuery(item)}&checklist=${item.id}`}>Convert to itinerary item</Link>
          </div>
        )}
        {item && (item.assigned_name || item.assigned_user) && <div className="muted small" style={{ marginTop: 8 }}>Assigned to {whoName(item.assigned_name, item.assigned_user, people)}</div>}
        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 16 }} disabled={busy}>{busy ? 'Saving…' : item ? 'Save' : 'Add item'}</button>
        {item && editable && <button type="button" className="btn danger block" style={{ marginTop: 10 }} onClick={() => setConfirmDel(true)}>Delete item</button>}
      </form>
      {confirmDel && <ConfirmDialog title="Delete this item?" busy={busy} onConfirm={remove} onCancel={() => setConfirmDel(false)}>This can’t be undone.</ConfirmDialog>}
    </Sheet>
  )
}
