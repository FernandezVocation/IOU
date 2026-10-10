import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import GroupLookPicker from '../components/GroupLookPicker'

interface G { id: string; name: string; role: string }

export default function NewVaultPage() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [name, setName] = useState('')
  const [look, setLook] = useState<{ icon: string; color: string } | null>(null)
  const [groups, setGroups] = useState<G[]>([])
  const [groupId, setGroupId] = useState(sp.get('group') ?? '')
  const [addPeople, setAddPeople] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Groups the signed-in person owns or co-administers and that have no vault yet.
  useEffect(() => {
    (async () => {
      const [m, v] = await Promise.all([
        supabase.from('group_members').select('group_id, role, groups(id, name)').in('role', ['owner', 'admin']),
        supabase.from('vaults').select('group_id').not('group_id', 'is', null),
      ])
      const taken = new Set(((v.data ?? []) as Array<{ group_id: string }>).map(x => x.group_id))
      type Row = { group_id: string; role: string; groups: { id: string; name: string } | { id: string; name: string }[] | null }
      const list = ((m.data ?? []) as unknown as Row[]).map(r => ({ r, g: Array.isArray(r.groups) ? r.groups[0] : r.groups }))
        .filter(x => x.g && !taken.has(x.g.id)).map(x => ({ id: x.g!.id, name: x.g!.name, role: x.r.role }))
      setGroups(list)
      if (groupId && !list.some(g => g.id === groupId)) setGroupId('')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chosen = groups.find(g => g.id === groupId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('create_vault', {
      p_name: name.trim(), p_icon: look?.icon ?? null, p_color: look?.color ?? null,
      p_group: groupId || null, p_add_members: groupId ? addPeople : false,
    })
    setBusy(false)
    if (error) { setError(friendly(error)); return }
    nav('/vault/' + (data as string), { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to="/vaults">← Your vaults</Link><h1>New vault</h1></div></div>
      <form onSubmit={submit} className="panel">
        <label className="lbl" style={{ marginTop: 0 }} htmlFor="vn">Vault name</label>
        <input id="vn" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Italy 2026, Documents, Wedding" required />
        <span className="lbl">Icon and colour</span>
        <GroupLookPicker kind="Vault" icon={look?.icon} color={look?.color} onChange={setLook} />
        {groups.length > 0 && (
          <>
            <label className="lbl" htmlFor="vg">Link to a group (optional)</label>
            <select id="vg" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">Not linked</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="muted small" style={{ marginTop: 6 }}>A linked group gets a Vault tab, and tickets get an Add as expense shortcut. A group has one vault, and a vault links to one group.</div>
          </>
        )}
        {chosen && (
          <fieldset className="radios" style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
            <legend className="lbl" style={{ padding: 0 }}>Give {chosen.name}’s people access to this vault?</legend>
            <label className="radio"><input type="radio" name="addp" checked={addPeople} onChange={() => setAddPeople(true)} />Yes, add everyone in the group as vault members</label>
            <label className="radio"><input type="radio" name="addp" checked={!addPeople} onChange={() => setAddPeople(false)} />No, just link it. I’ll manage access on the vault.</label>
          </fieldset>
        )}
        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Creating…' : 'Create vault'}</button>
      </form>
    </div>
  )
}
