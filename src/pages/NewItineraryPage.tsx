import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { useAuth } from '../lib/auth'
import { myGroups } from '../lib/myGroups'
import GroupLookPicker from '../components/GroupLookPicker'

interface G { id: string; name: string }

export default function NewItineraryPage() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [sp] = useSearchParams()
  const [name, setName] = useState('')
  const [look, setLook] = useState<{ icon: string; color: string } | null>(null)
  const [groups, setGroups] = useState<G[]>([])
  const [vaults, setVaults] = useState<G[]>([])
  const [groupId, setGroupId] = useState(sp.get('group') ?? '')
  const [vaultId, setVaultId] = useState(sp.get('vault') ?? '')
  const [addPeople, setAddPeople] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Groups the signed-in person owns or co-administers, and any vault they are in.
  useEffect(() => {
    (async () => {
      const [m, v] = await Promise.all([
        myGroups(user?.id ?? '', true),
        supabase.from('vaults').select('id, name').eq('personal', false).order('name'),
      ])
      const gl = m
      const vl = (v.data ?? []) as G[]
      setGroups(gl); setVaults(vl)
      if (groupId && !gl.some(g => g.id === groupId)) setGroupId('')
      if (vaultId && !vl.some(x => x.id === vaultId)) setVaultId('')
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chosen = groups.find(g => g.id === groupId)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { data, error } = await supabase.rpc('create_itinerary', {
      p_name: name.trim(), p_icon: look?.icon ?? null, p_color: look?.color ?? null,
      p_group: groupId || null, p_vault: vaultId || null, p_add_members: groupId ? addPeople : false,
    })
    setBusy(false)
    if (error) { setError(friendly(error)); return }
    nav('/itinerary/' + (data as string), { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to="/itineraries">← Your itineraries</Link><h1>New itinerary</h1></div></div>
      <form onSubmit={submit} className="panel">
        <label className="lbl" style={{ marginTop: 0 }} htmlFor="in">Itinerary name</label>
        <input id="in" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Italy 2026, Conference in Austin" required />
        <span className="lbl">Icon and colour</span>
        <GroupLookPicker kind="Itinerary" icon={look?.icon} color={look?.color} onChange={setLook} />
        {groups.length > 0 && (
          <>
            <label className="lbl" htmlFor="ig">Link to a group (optional)</label>
            <select id="ig" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">Not linked</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="muted small" style={{ marginTop: 6 }}>Linking lets you pick the group’s travelers as the people involved. A group can have more than one itinerary.</div>
          </>
        )}
        {vaults.length > 0 && (
          <>
            <label className="lbl" htmlFor="iv">Link to a vault (optional)</label>
            <select id="iv" value={vaultId} onChange={e => setVaultId(e.target.value)}>
              <option value="">Not linked</option>
              {vaults.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="muted small" style={{ marginTop: 6 }}>Items can then point at that vault’s tickets. Only people who can see a ticket in the vault see the link.</div>
          </>
        )}
        {chosen && (
          <fieldset className="radios" style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
            <legend className="lbl" style={{ padding: 0 }}>Give {chosen.name}’s people access to this itinerary?</legend>
            <label className="radio"><input type="radio" name="addp" checked={addPeople} onChange={() => setAddPeople(true)} />Yes, add everyone in the group as members</label>
            <label className="radio"><input type="radio" name="addp" checked={!addPeople} onChange={() => setAddPeople(false)} />No, just link it. I’ll manage access on the itinerary.</label>
          </fieldset>
        )}
        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Creating…' : 'Create itinerary'}</button>
      </form>
    </div>
  )
}
