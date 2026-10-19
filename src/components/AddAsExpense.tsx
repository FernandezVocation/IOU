import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Sheet } from './ui'

/** From a personal vault item: pick which group the expense belongs to, then open the expense form filled in and linked. */
export default function AddAsExpense({ query, title, onClose }: { query: string; title: string; onClose: () => void }) {
  const nav = useNavigate()
  const [groups, setGroups] = useState<Array<{ id: string; name: string }> | null>(null)
  const [pick, setPick] = useState('')
  useEffect(() => {
    supabase.from('groups').select('id, name').order('created_at', { ascending: false }).then(({ data }) => {
      const list = (data ?? []) as Array<{ id: string; name: string }>
      setGroups(list); if (list.length) setPick(list[0].id)
    })
  }, [])
  return (
    <Sheet title="Add as expense" onClose={onClose}>
      {groups === null && <div className="muted small">Loading…</div>}
      {groups?.length === 0 && <div className="empty"><b>No groups yet</b>Create or join a group first.</div>}
      {!!groups?.length && (
        <>
          <label className="lbl" htmlFor="aex" style={{ marginTop: 0 }}>Which group</label>
          <select id="aex" value={pick} onChange={e => setPick(e.target.value)}>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="notice" style={{ marginTop: 10 }}>The expense opens filled in from “{title}” and stays linked to it. The group sees the expense, but only you see the link to this private item.</div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => nav(`/g/${pick}/expense/new?${query}`)}>Continue</button>
        </>
      )}
    </Sheet>
  )
}
