import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { TYPES, type ItemType } from '../lib/checklist'
import GroupLookPicker from '../components/GroupLookPicker'

interface G { id: string; name: string }

export default function NewChecklistPage() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [name, setName] = useState('')
  const [look, setLook] = useState<{ icon: string; color: string } | null>(null)
  const [groups, setGroups] = useState<G[]>([])
  const [groupId, setGroupId] = useState(sp.get('group') ?? '')
  const [type, setType] = useState<ItemType>('todo')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Any group the person is in: every member can add to a group's list.
  useEffect(() => {
    supabase.from('group_members').select('groups(id, name)').then(({ data }) => {
      type Row = { groups: G | G[] | null }
      const gl = ((data ?? []) as unknown as Row[]).map(r => Array.isArray(r.groups) ? r.groups[0] : r.groups).filter((g): g is G => !!g)
      setGroups(gl)
      if (groupId && !gl.some(g => g.id === groupId)) setGroupId('')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('create_checklist', {
      p_name: name.trim(), p_icon: look?.icon ?? null, p_color: look?.color ?? null,
      p_default_type: type, p_default_label: '', p_group: groupId || null,
    })
    setBusy(false)
    if (error) { setError(friendly(error)); return }
    nav('/checklist/' + (data as string), { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to="/checklists">← Checklists</Link><h1>New list</h1></div></div>
      <form onSubmit={submit} className="panel">
        <label className="lbl" style={{ marginTop: 0 }} htmlFor="cn">List name</label>
        <input id="cn" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Packing, Things to buy, Before we leave" required />
        <span className="lbl">Icon and colour</span>
        <GroupLookPicker kind="Checklist" icon={look?.icon} color={look?.color} onChange={setLook} />
        <span className="lbl">New items start as</span>
        <div className="chips" role="group" aria-label="Starting type">
          {TYPES.filter(t => t.id !== 'custom').map(t => <button type="button" key={t.id} className="chip" aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.label}</button>)}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>Just the starting choice. One list can mix to-dos, purchases, packing and more.</div>
        {groups.length > 0 && (
          <>
            <label className="lbl" htmlFor="cg">Link to a group (optional)</label>
            <select id="cg" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">Not linked: just for the people I invite</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="muted small" style={{ marginTop: 6 }}>Everyone in a linked group sees the list and can add to it. A group can have any number of lists.</div>
          </>
        )}
        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Creating…' : 'Create list'}</button>
      </form>
    </div>
  )
}
