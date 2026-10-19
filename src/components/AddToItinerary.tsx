import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { categoryForVaultType } from '../lib/itinerary'
import type { VaultItem } from '../lib/vault'
import { Sheet } from './ui'

interface Row { id: string; name: string; vault_id: string | null }

/**
 * Pick an itinerary for a vault item. The editor opens filled in from the item (nothing is saved yet), every field is
 * changeable, and the new itinerary item stays linked to the vault item. Itineraries linked to this vault come first.
 */
export default function AddToItinerary({ item, onClose }: { item: VaultItem; onClose: () => void }) {
  const nav = useNavigate()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [pick, setPick] = useState('')

  useEffect(() => {
    supabase.from('itineraries').select('id, name, vault_id').order('created_at', { ascending: false }).then(({ data }) => {
      const list = ((data ?? []) as Row[]).sort((a, b) => Number(b.vault_id === item.vault_id) - Number(a.vault_id === item.vault_id))
      setRows(list)
      if (list.length) setPick(list[0].id)
    })
  }, [item.vault_id])

  function go() {
    if (!pick) return
    const g = categoryForVaultType(item.type)
    const q = new URLSearchParams({ from: item.id, category: g.category })
    const set = (k: string, v: string | null) => { if (v) q.set(k, v) }
    set('subtype', g.subtype)
    set('title', item.title); set('description', item.description)
    set('date', item.starts_on); set('time', item.starts_at?.slice(0, 5) ?? null)
    set('end_date', item.ends_on); set('end_time', item.ends_at?.slice(0, 5) ?? null)
    set('place', item.place); set('address', item.address); set('website', item.website); set('notes', item.notes)
    nav(`/itinerary/${pick}/item/new?${q.toString()}`)
  }

  const chosen = rows?.find(r => r.id === pick)
  return (
    <Sheet title="Add to itinerary" onClose={onClose}>
      {rows === null && <div className="muted small">Loading…</div>}
      {rows?.length === 0 && (
        <div className="empty"><b>No itineraries yet</b>Create one first, then come back to add this.</div>
      )}
      {!!rows?.length && (
        <>
          <label className="lbl" htmlFor="ati" style={{ marginTop: 0 }}>Which itinerary</label>
          <select id="ati" value={pick} onChange={e => setPick(e.target.value)}>
            {rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <div className="notice" style={{ marginTop: 10 }}>The next screen is filled in from “{item.title}”. Everything is yours to change before you add it. The new item stays linked to this vault item. It is a copy, so a later change in one place doesn’t change the other.</div>
          {chosen && chosen.vault_id !== item.vault_id && <div className="notice err" style={{ marginTop: 8 }}>This itinerary isn’t linked to this vault, so the link to the vault item may not be offered. Link the vault in the itinerary’s settings first.</div>}
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={go}>Continue</button>
        </>
      )}
    </Sheet>
  )
}
