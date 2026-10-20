import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { Avatar, Sheet, useArm, useToast } from './ui'
import GroupLookPicker from './GroupLookPicker'
import { TYPES, type ItemType } from '../lib/checklist'
import type { ChecklistData } from '../lib/useChecklist'

interface G { id: string; name: string }
interface LinkRow { id: string; label: string; token: string; include_notes: boolean; expires_at: string | null }
export const checklistShareUrl = (token: string) => `${window.location.origin}/c/${token}`

/** People, invite link, group link, appearance, read-only links and delete for one list. */
export default function ChecklistSettings({ data, reload, onClose }: { data: ChecklistData; reload: () => void; onClose: () => void }) {
  const nav = useNavigate()
  const toast = useToast()
  const arm = useArm()
  const l = data.list
  const [name, setName] = useState(l.name)
  const [groups, setGroups] = useState<G[]>([])
  const [pickG, setPickG] = useState('')
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<LinkRow[] | null>(null)
  const [label, setLabel] = useState('')
  const [notes, setNotes] = useState(false)

  const loadLinks = useCallback(async () => {
    if (!data.isAdmin) return
    const r = await supabase.from('checklist_links').select('id, label, token, include_notes, expires_at').eq('checklist_id', l.id).order('created_at', { ascending: false })
    if (r.error) { toast(friendly(r.error)); return }
    setLinks(r.data as LinkRow[])
  }, [l.id, data.isAdmin, toast])
  useEffect(() => { loadLinks() }, [loadLinks])

  useEffect(() => {
    if (!data.isAdmin || l.group_id) return
    supabase.from('group_members').select('groups(id, name)').then(({ data: d }) => {
      type Row = { groups: G | G[] | null }
      setGroups(((d ?? []) as unknown as Row[]).map(r => Array.isArray(r.groups) ? r.groups[0] : r.groups).filter((g): g is G => !!g))
    })
  }, [l.group_id, data.isAdmin])

  async function run(p: PromiseLike<{ error: { message?: string } | null }>, ok?: string) {
    setBusy(true)
    const { error } = await p
    setBusy(false)
    if (error) { toast(friendly(error)); return false }
    await reload()
    if (ok) toast(ok)
    return true
  }
  async function copy(text: string, msg: string) {
    try { await navigator.clipboard.writeText(text); toast(msg) } catch { toast('Could not copy. Press and hold the link to copy it.') }
  }
  async function makeLink() {
    if (!label.trim()) { toast('Give the link a name, like “Mom”.'); return }
    setBusy(true)
    const { data: tok, error } = await supabase.rpc('create_checklist_link', { p_cl: l.id, p_label: label.trim(), p_include_notes: notes, p_expires_at: null })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    setLabel(''); await loadLinks(); copy(checklistShareUrl(tok as string), 'Link copied.')
  }

  const invite = `${window.location.origin}/cj/${l.invite_code}`
  return (
    <Sheet title="List people and settings" onClose={onClose}>
      <div className="sect" style={{ marginTop: 0 }}>
        <h2>People</h2>
        <div className="muted small">{l.group_id ? `Everyone in ${data.groupName ?? 'the group'} sees this list automatically. ` : ''}Anyone who can see the list can add items, tick items off and say who has them. Only the person who added an item, or an admin, can edit or delete it.</div>
        {data.members.map(p => (
          <div className="prow" key={p.user_id}>
            <Avatar name={p.name} color="#5F6B66" />
            <span style={{ flex: 1 }}>{p.name}{p.user_id === data.userId ? ' (you)' : ''}</span>
            {p.role === 'owner' ? <span className="tag">owner</span> : data.isOwner ? (
              <select aria-label={`Role for ${p.name}`} value={p.role} disabled={busy} onChange={e => run(supabase.rpc('set_checklist_role', { p_cl: l.id, p_user: p.user_id, p_role: e.target.value }))}>
                <option value="member">Member</option><option value="admin">Co-admin</option>
              </select>
            ) : <span className="tag">{p.role === 'admin' ? 'co-admin' : 'member'}</span>}
            {data.isAdmin && p.role !== 'owner' && p.user_id !== data.userId && (
              <button className={'btn small danger' + (arm.is(p.user_id) ? ' armed' : '')} disabled={busy}
                onClick={() => arm.is(p.user_id) ? run(supabase.from('checklist_members').delete().eq('checklist_id', l.id).eq('user_id', p.user_id), 'Removed.') : arm.arm(p.user_id)}>
                {arm.is(p.user_id) ? 'Confirm' : 'Remove'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="sect">
        <h2>Invite link</h2>
        <div className="muted small">For people with an account. Whoever opens this while signed in joins as a member.</div>
        <div className="prow"><input type="text" readOnly value={invite} aria-label="Invite link" onFocus={e => e.currentTarget.select()} />
          <button className="btn" onClick={() => copy(invite, 'Invite link copied.')}>Copy</button></div>
      </div>

      {data.isAdmin && (
        <div className="sect">
          <h2>Read-only links</h2>
          <div className="muted small">For people without an account: they can look, not change. Prices, booking codes and links to expenses, vault or itinerary items are never included.</div>
          <label className="lbl" htmlFor="ckl">Who is it for?</label>
          <input id="ckl" type="text" value={label} maxLength={80} placeholder="Mom" onChange={e => setLabel(e.target.value)} />
          <label className="radio" style={{ marginTop: 8 }}><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} />Include notes</label>
          <button className="btn primary block" style={{ marginTop: 8 }} disabled={busy} onClick={makeLink}>Create link and copy</button>
          {links?.map(k => (
            <div className="prow" key={k.id}>
              <span style={{ flex: 1 }}><b>{k.label}</b><br /><span className="muted small">{k.include_notes ? 'Notes included' : 'No notes'}</span></span>
              <button className="btn small" onClick={() => copy(checklistShareUrl(k.token), 'Link copied.')}>Copy</button>
              <button className={'btn small danger' + (arm.is(k.id) ? ' armed' : '')} disabled={busy}
                onClick={async () => { if (!arm.is(k.id)) { arm.arm(k.id); return } if (await run(supabase.from('checklist_links').delete().eq('id', k.id), 'Link turned off.')) { arm.clear(); loadLinks() } }}>
                {arm.is(k.id) ? 'Confirm' : 'Turn off'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="sect">
        <h2>Group</h2>
        {l.group_id ? (
          <>
            <div className="muted small">Linked to <b>{data.groupName ?? 'a group'}</b>.</div>
            {data.isAdmin && <button className="btn" style={{ marginTop: 8 }} disabled={busy} onClick={() => run(supabase.rpc('unlink_checklist_group', { p_cl: l.id }), 'Unlinked. Only the people on the list can see it now.')}>Unlink group</button>}
          </>
        ) : data.isAdmin && groups.length > 0 ? (
          <>
            <div className="muted small">Link this list to a group so everyone in it sees it.</div>
            <select aria-label="Group to link" value={pickG} onChange={e => setPickG(e.target.value)} style={{ marginTop: 8 }}>
              <option value="">Choose a group</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button className="btn primary" style={{ marginTop: 8 }} disabled={busy || !pickG} onClick={() => run(supabase.rpc('link_checklist_group', { p_cl: l.id, p_group: pickG }), 'Linked.')}>Link group</button>
          </>
        ) : <div className="muted small">Not linked to a group.</div>}
      </div>

      {data.isAdmin && (
        <div className="sect">
          <h2>Name and look</h2>
          <label className="lbl" htmlFor="ckn" style={{ marginTop: 0 }}>List name</label>
          <input id="ckn" type="text" value={name} maxLength={80} onChange={e => setName(e.target.value)}
            onBlur={() => { const n = name.trim(); if (n && n !== l.name) run(supabase.from('checklists').update({ name: n }).eq('id', l.id)); else setName(l.name) }} />
          <label className="lbl" htmlFor="ckdt">New items start as</label>
          <select id="ckdt" value={l.default_type} onChange={e => run(supabase.from('checklists').update({ default_type: e.target.value as ItemType }).eq('id', l.id))}>
            {TYPES.filter(t => t.id !== 'custom').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <div className="muted small" style={{ marginTop: 4 }}>Only the starting choice. Every item can still be any type.</div>
          <GroupLookPicker kind="Checklist" icon={l.icon} color={l.color} onChange={n => run(supabase.from('checklists').update({ icon: n.icon, color: n.color }).eq('id', l.id))} />
        </div>
      )}

      <div className="sect">
        {!data.isOwner && (
          <button className={'btn danger block' + (arm.is('leave') ? ' armed' : '')} disabled={busy}
            onClick={async () => { if (!arm.is('leave')) { arm.arm('leave'); return } if (await run(supabase.from('checklist_members').delete().eq('checklist_id', l.id).eq('user_id', data.userId))) nav('/checklists', { replace: true }) }}>
            {arm.is('leave') ? 'Tap again to leave' : 'Leave this list'}
          </button>
        )}
        {data.isOwner && (
          <button className={'btn danger block' + (arm.is('del') ? ' armed' : '')} disabled={busy}
            onClick={async () => { if (!arm.is('del')) { arm.arm('del'); return } if (await run(supabase.from('checklists').delete().eq('id', l.id))) nav('/checklists', { replace: true }) }}>
            {arm.is('del') ? 'Tap again to delete the list and every item' : 'Delete this list'}
          </button>
        )}
      </div>
    </Sheet>
  )
}
