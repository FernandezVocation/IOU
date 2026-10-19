import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { itinerariesFor } from '../lib/useItinerary'
import { categoryForExpense } from '../lib/itinerary'
import type { Expense } from '../lib/types'
import { Sheet } from './ui'

/** From an expense: pick which of the group's itineraries it belongs in, then open the item form filled in. The expense is linked once the item is saved. */
export default function AddExpenseToItinerary({ expense, groupId, onClose }: { expense: Expense; groupId: string; onClose: () => void }) {
  const nav = useNavigate()
  const [rows, setRows] = useState<Array<{ id: string; name: string }> | null>(null)
  const [pick, setPick] = useState('')
  useEffect(() => {
    itinerariesFor(groupId).then(list => { setRows(list); if (list.length) setPick(list[0].id) })
  }, [groupId])

  function go() {
    const g = categoryForExpense(expense.category, expense.subcategory ?? '')
    const q = new URLSearchParams({ expense: expense.id, category: g.category, title: expense.vendor || expense.description || 'Expense', date: expense.spent_on })
    const set = (k: string, v: string | null | undefined) => { if (v) q.set(k, v) }
    set('category_label', g.category_label); set('subtype', g.subtype)
    set('description', expense.description); set('vendor', expense.vendor); set('ref', expense.booking_ref)
    set('time', expense.spent_at?.slice(0, 5)); set('place', expense.location); set('notes', expense.notes)
    nav(`/itinerary/${pick}/item/new?${q.toString()}`)
  }

  return (
    <Sheet title="Add to itinerary" onClose={onClose}>
      {rows === null && <div className="muted small">Loading…</div>}
      {rows?.length === 0 && <div className="empty"><b>No itinerary linked to this group</b>Create an itinerary and link it to this group first. An expense can only point to items in a linked itinerary.</div>}
      {!!rows?.length && (
        <>
          <label className="lbl" htmlFor="aei" style={{ marginTop: 0 }}>Which itinerary</label>
          <select id="aei" value={pick} onChange={e => setPick(e.target.value)}>{rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
          <div className="notice" style={{ marginTop: 10 }}>The item form opens filled in from this expense. Once you save it, the expense and the item are linked.</div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={go}>Continue</button>
        </>
      )}
    </Sheet>
  )
}
