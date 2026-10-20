import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { Avatar, Sheet, useArm, useToast } from './ui'
import { myGroups } from '../lib/myGroups'
import GroupLookPicker from './GroupLookPicker'
import { useItinerary } from '../pages/ItineraryShell'

interface G { id: string; name: string }

/** People, invite link, group and vault links, and appearance for one itinerary. */
export default function ItinerarySettings({ onClose }: { onClose: () => void }) {
  const { data, reload } = useItinerary()
  const nav = useNavigate()
  const toast = useToast()
  const arm = useArm()
  const it = data.itinerary
  const [name, setName] = useState(it.name)
  const [groups, setGroups] = useState<G[]>([])
  const [vaults, setVaults] = useState<G[]>([])
  const [pickG, setPickG] = useState('')
  const [pickV, setPickV] = useState('')
  const [addPeople, setAddPeople] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      if (!data.isAdmin) return
      const [m, v] = await Promise.all([
        !it.group_id ? myGroups(data.userId, true) : Promise.resolve([] as G[]),
        !it.vault_id ? supabase.from('vaults').select('id, name').eq('personal', false).order('name') : Promise.resolve({ data: [] }),
      ])
      setGroups(m)
      setVaults((v.data ?? []) as G[])
    })()
  }, [it.group_id, it.vault_id, data.isAdmin])

  const link = `${window.location.origin}/ij/${it.invite_code}`
  async function run(p: PromiseLike<{ error: { message?: string } | null }>, ok?: string) {
    setBusy(true)
    const { error } = await p
    setBusy(false)
    if (error) { toast(friendly(error)); return false }
    await reload()
    if (ok) toast(ok)
    return true
  }

  return (
    <Sheet title="Itinerary people and settings" onClose={onClose}>
      <div className="sect" style={{ marginTop: 0 }}>
        <h2>People</h2>
        <div className="muted small">Everyone can add items and change the ones they add. Owners and co-admins can change any item they can see. Only me items are visible only to the person who added them.</div>
        {data.people.map(p => (
          <div className="prow" key={p.user_id}>
            <Avatar name={p.name} color="#5F6B66" />
            <span style={{ flex: 1 }}>{p.name}{p.user_id === data.userId ? ' (you)' : ''}</span>
            {p.role === 'owner' ? <span className="tag">owner</span> : data.isOwner ? (
              <select aria-label={`Role for ${p.name}`} value={p.role} disabled={busy}
                onChange={e => run(supabase.rpc('set_itinerary_role', { p_it: it.id, p_user: p.user_id, p_role: e.target.value }))}>
                <option value="member">Member</option><option value="admin">Co-admin</option>
              </select>
            ) : <span className="tag">{p.role === 'admin' ? 'co-admin' : 'member'}</span>}
            {data.isAdmin && p.role !== 'owner' && p.user_id !== data.userId && (
              <button className={'btn small danger' + (arm.is(p.user_id) ? ' armed' : '')} disabled={busy}
                onClick={() => arm.is(p.user_id) ? run(supabase.from('itinerary_members').delete().eq('itinerary_id', it.id).eq('user_id', p.user_id), 'Removed.') : arm.arm(p.user_id)}>
                {arm.is(p.user_id) ? 'Confirm' : 'Remove'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sect">
        <h2>Invite link</h2>
        <div className="muted small">Anyone who opens this while signed in joins as a member.</div>
        <div className="prow"><input type="text" readOnly value={link} aria-label="Invite link" onFocus={e => e.currentTarget.select()} />
          <button className="btn" onClick={async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied.') } catch { toast('Could not copy. Press and hold the link to copy it.') } }}>Copy</button></div>
      </div>

      <div className="sect">
        <h2>Group</h2>
        {it.group_id ? (
          <>
            <div className="muted small">Linked to <b>{data.groupName ?? 'a group'}</b>. Its travelers can be picked as the people involved.</div>
            {data.isAdmin && <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(supabase.rpc('unlink_itinerary_group', { p_it: it.id }), 'Unlinked. The items stay here.')}>Unlink group</button>}
          </>
        ) : data.isAdmin && groups.length > 0 ? (
          <>
            <div className="muted small">Link this itinerary to one of your groups.</div>
            <select aria-label="Group to link" value={pickG} onChange={e => setPickG(e.target.value)} style={{ marginTop: 8 }}>
              <option value="">Choose a group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {pickG && (
              <fieldset style={{ border: 0, padding: 0, margin: '10px 0 0' }}>
                <legend className="lbl" style={{ padding: 0 }}>Give the group’s people access to this itinerary?</legend>
                <label className="radio"><input type="radio" name="ip" checked={addPeople} onChange={() => setAddPeople(true)} />Yes, add everyone in the group</label>
                <label className="radio"><input type="radio" name="ip" checked={!addPeople} onChange={() => setAddPeople(false)} />No, just link it</label>
              </fieldset>
            )}
            <button className="btn primary" style={{ marginTop: 8 }} disabled={busy || !pickG} onClick={() => run(supabase.rpc('link_itinerary_group', { p_it: it.id, p_group: pickG, p_add_members: addPeople }), 'Linked.')}>Link group</button>
          </>
        ) : <div className="muted small">Not linked to a group.</div>}
      </div>

      <div className="sect">
        <h2>Vault</h2>
        {it.vault_id ? (
          <>
            <div className="muted small">Linked to <b>{data.vaultName ?? 'a vault'}</b>. Items can point at its tickets.</div>
            {data.isAdmin && <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(supabase.rpc('unlink_itinerary_vault', { p_it: it.id }), 'Unlinked. Existing item links stay.')}>Unlink vault</button>}
          </>
        ) : data.isAdmin && vaults.length > 0 ? (
          <>
            <div className="muted small">Link this itinerary to a vault you are in.</div>
            <select aria-label="Vault to link" value={pickV} onChange={e => setPickV(e.target.value)} style={{ marginTop: 8 }}>
              <option value="">Choose a vault</option>
              {vaults.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button className="btn primary" style={{ marginTop: 8 }} disabled={busy || !pickV} onClick={() => run(supabase.rpc('link_itinerary_vault', { p_it: it.id, p_vault: pickV }), 'Linked.')}>Link vault</button>
          </>
        ) : <div className="muted small">Not linked to a vault.</div>}
      </div>

      {data.isAdmin && (
        <div className="sect">
          <h2>Name and look</h2>
          <label className="lbl" htmlFor="isn" style={{ marginTop: 0 }}>Itinerary name</label>
          <input id="isn" type="text" value={name} maxLength={80} onChange={e => setName(e.target.value)}
            onBlur={() => { const n = name.trim(); if (n && n !== it.name) run(supabase.from('itineraries').update({ name: n }).eq('id', it.id)); else setName(it.name) }} />
          <GroupLookPicker kind="Itinerary" icon={it.icon} color={it.color} onChange={n => run(supabase.from('itineraries').update({ icon: n.icon, color: n.color }).eq('id', it.id))} />
        </div>
      )}

      <div className="sect">
        {!data.isOwner && (
          <button className={'btn danger block' + (arm.is('leave') ? ' armed' : '')} disabled={busy}
            onClick={async () => { if (!arm.is('leave')) { arm.arm('leave'); return } if (await run(supabase.from('itinerary_members').delete().eq('itinerary_id', it.id).eq('user_id', data.userId))) nav('/itineraries', { replace: true }) }}>
            {arm.is('leave') ? 'Tap again to leave' : 'Leave this itinerary'}
          </button>
        )}
        {data.isOwner && (
          <button className={'btn danger block' + (arm.is('del') ? ' armed' : '')} disabled={busy}
            onClick={async () => { if (!arm.is('del')) { arm.arm('del'); return } if (await run(supabase.from('itineraries').delete().eq('id', it.id))) nav('/itineraries', { replace: true }) }}>
            {arm.is('del') ? 'Tap again to delete the itinerary and everything in it' : 'Delete this itinerary'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
