import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { Avatar, Sheet, useArm, useToast } from './ui'
import { myGroups } from '../lib/myGroups'
import GroupLookPicker from './GroupLookPicker'
import { useVault } from '../pages/VaultShell'

interface G { id: string; name: string }

/** People, invite link, group link and appearance for one vault. */
export default function VaultSettings({ onClose }: { onClose: () => void }) {
  const { data, reload } = useVault()
  const nav = useNavigate()
  const toast = useToast()
  const arm = useArm()
  const v = data.vault
  const personal = !!v.personal
  const [name, setName] = useState(v.name)
  const [groups, setGroups] = useState<G[]>([])
  const [linked, setLinked] = useState<G | null>(null)
  const [pick, setPick] = useState('')
  const [addPeople, setAddPeople] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      if (v.group_id) {
        const g = await supabase.from('groups').select('id, name').eq('id', v.group_id).maybeSingle()
        setLinked((g.data as G | null) ?? null)
      } else setLinked(null)
      if (data.isAdmin && !v.group_id) {
        const [m, vs] = await Promise.all([
          myGroups(data.userId, true),
          supabase.from('vaults').select('group_id').not('group_id', 'is', null),
        ])
        const taken = new Set(((vs.data ?? []) as Array<{ group_id: string }>).map(x => x.group_id))
        setGroups(m.filter(g => !taken.has(g.id)))
      }
    })()
  }, [v.group_id, data.isAdmin])

  const link = `${window.location.origin}/vj/${v.invite_code}`
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
    <Sheet title={personal ? 'My vault settings' : 'Vault people and settings'} onClose={onClose}>
      {personal && <div className="notice">This is your private vault. Only you can see it. Nobody can join it, and it can’t be linked to a group.</div>}
      {!personal && (
        <>
      <div className="sect" style={{ marginTop: 0 }}>
        <h2>People</h2>
        <div className="muted small">Everyone can add items and change the ones they add. Owners and co-admins can change any item they can see. Private items are visible only to the person who added them.</div>
        {data.people.map(p => (
          <div className="prow" key={p.user_id}>
            <Avatar name={p.name} color="#5F6B66" />
            <span style={{ flex: 1 }}>{p.name}{p.user_id === data.userId ? ' (you)' : ''}</span>
            {p.role === 'owner' ? <span className="tag">owner</span> : data.isOwner ? (
              <select aria-label={`Role for ${p.name}`} value={p.role} disabled={busy}
                onChange={e => run(supabase.rpc('set_vault_role', { p_vault: v.id, p_user: p.user_id, p_role: e.target.value }))}>
                <option value="member">Member</option><option value="admin">Co-admin</option>
              </select>
            ) : <span className="tag">{p.role === 'admin' ? 'co-admin' : 'member'}</span>}
            {data.isAdmin && p.role !== 'owner' && p.user_id !== data.userId && (
              <button className={'btn small danger' + (arm.is(p.user_id) ? ' armed' : '')} disabled={busy}
                onClick={() => arm.is(p.user_id) ? run(supabase.from('vault_members').delete().eq('vault_id', v.id).eq('user_id', p.user_id), 'Removed.') : arm.arm(p.user_id)}>
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
        {linked ? (
          <>
            <div className="muted small">Linked to <b>{linked.name}</b>. That group has a Vault tab, and tickets here get an Add as expense shortcut.</div>
            {data.isAdmin && <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(supabase.rpc('unlink_vault', { p_vault: v.id }), 'Unlinked. The items stay here.')}>Unlink from {linked.name}</button>}
          </>
        ) : data.isAdmin && groups.length > 0 ? (
          <>
            <div className="muted small">Link this vault to one of your groups (a group has one vault).</div>
            <select aria-label="Group to link" value={pick} onChange={e => setPick(e.target.value)} style={{ marginTop: 8 }}>
              <option value="">Choose a group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {pick && (
              <fieldset style={{ border: 0, padding: 0, margin: '10px 0 0' }}>
                <legend className="lbl" style={{ padding: 0 }}>Give the group’s people access to this vault?</legend>
                <label className="radio"><input type="radio" name="vp" checked={addPeople} onChange={() => setAddPeople(true)} />Yes, add everyone in the group</label>
                <label className="radio"><input type="radio" name="vp" checked={!addPeople} onChange={() => setAddPeople(false)} />No, just link it</label>
              </fieldset>
            )}
            <button className="btn primary" style={{ marginTop: 8 }} disabled={busy || !pick} onClick={() => run(supabase.rpc('link_vault', { p_vault: v.id, p_group: pick, p_add_members: addPeople }), 'Linked.')}>Link vault</button>
          </>
        ) : <div className="muted small">Not linked to a group.</div>}
      </div>

        </>
      )}

      {data.isAdmin && (
        <div className="sect">
          <h2>Name and look</h2>
          <label className="lbl" htmlFor="vsn" style={{ marginTop: 0 }}>Vault name</label>
          <input id="vsn" type="text" value={name} maxLength={80} onChange={e => setName(e.target.value)}
            onBlur={() => { const n = name.trim(); if (n && n !== v.name) run(supabase.from('vaults').update({ name: n }).eq('id', v.id)); else setName(v.name) }} />
          <GroupLookPicker kind="Vault" icon={v.icon} color={v.color} onChange={n => run(supabase.from('vaults').update({ icon: n.icon, color: n.color }).eq('id', v.id))} />
        </div>
      )}

      <div className="sect">
        {!data.isOwner && (
          <button className={'btn danger block' + (arm.is('leave') ? ' armed' : '')} disabled={busy}
            onClick={async () => { if (!arm.is('leave')) { arm.arm('leave'); return } if (await run(supabase.from('vault_members').delete().eq('vault_id', v.id).eq('user_id', data.userId))) nav('/vaults', { replace: true }) }}>
            {arm.is('leave') ? 'Tap again to leave' : 'Leave this vault'}
          </button>
        )}
        {data.isOwner && (
          <button className={'btn danger block' + (arm.is('del') ? ' armed' : '')} disabled={busy}
            onClick={async () => { if (!arm.is('del')) { arm.arm('del'); return } const paths = data.items.flatMap(i => i.files.map(f => f.path)); if (await run(supabase.from('vaults').delete().eq('id', v.id))) { if (paths.length) await supabase.storage.from('vault').remove(paths); nav('/vaults', { replace: true }) } }}>
            {arm.is('del') ? 'Tap again to delete the vault and everything in it' : 'Delete this vault'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
