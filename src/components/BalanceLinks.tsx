import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { joinNames } from '../lib/invoice'
import { Avatar, useArm, useToast } from './ui'
import { useGroup } from '../pages/GroupShell'

interface LinkRow {
  id: string; scope?: 'group' | 'person'; label: string; token: string; created_at: string; expires_at: string | null
  last_viewed_at: string | null; view_count: number; share_link_travelers: Array<{ traveler_id: string }>
}
export const shareUrl = (token: string) => `${window.location.origin}/b/${token}`

const EXPIRY: Array<[string, string, number | null]> = [['never', 'Never expires', null], ['7', 'Expires in 7 days', 7], ['30', 'Expires in 30 days', 30], ['90', 'Expires in 90 days', 90]]

/** The owner creates read-only links for anyone, with or without an account: the whole group, or specific people. */
export default function BalanceLinks() {
  const { data } = useGroup()
  const toast = useToast()
  const arm = useArm()
  const [links, setLinks] = useState<LinkRow[] | null>(null)
  const [scope, setScope] = useState<'group' | 'person'>('person')
  const [pick, setPick] = useState<string[]>([])
  const [expiry, setExpiry] = useState('never')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from('share_links')
      .select('id, scope, label, token, created_at, expires_at, last_viewed_at, view_count, share_link_travelers(traveler_id)')
      .eq('group_id', data.group.id).order('created_at')
    if (error) toast(friendly(error)); else setLinks(rows as unknown as LinkRow[])
  }, [data.group.id, toast])
  useEffect(() => { load() }, [load])

  const noAccount = data.travelers.filter(t => !t.user_id)
  const nameOf = (id: string) => data.travelers.find(t => t.id === id)?.name ?? 'Someone'
  const toggle = (id: string) => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  async function create() {
    if (scope === 'person' && !pick.length) return
    setBusy(true)
    const days = EXPIRY.find(e => e[0] === expiry)?.[2] ?? null
    const label = scope === 'group' ? 'Whole group' : joinNames(data.travelers.filter(t => pick.includes(t.id)).map(t => t.name))
    const { error } = await supabase.rpc('create_share_link', { p_group: data.group.id, p_label: label, p_traveler_ids: scope === 'group' ? [] : pick, p_expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null, p_scope: scope })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    setPick([]); toast('Link created. Copy it and send it to them.'); load()
  }
  async function copy(token: string) {
    try { await navigator.clipboard.writeText(shareUrl(token)); toast('Link copied.') } catch { toast('Could not copy. Use Share instead.') }
  }
  async function share(l: LinkRow) {
    if (navigator.share) { try { await navigator.share({ title: `${data.group.name}: your balance`, text: `Check your balance for "${data.group.name}":`, url: shareUrl(l.token) }) } catch { /* cancelled */ } }
    else copy(l.token)
  }
  async function turnOff(id: string) {
    arm.clear()
    const { error } = await supabase.from('share_links').delete().eq('id', id)
    if (error) toast(friendly(error)); else { toast('Link turned off.'); load() }
  }

  return (
    <div className="sect">
      <h2>Read-only links</h2>
      <div className="muted small">Share a view of this group with anyone, even without an account. They can look but never change anything. Anyone who gets a link can open it, so send it only to the people it’s for. You can turn a link off at any time.</div>

      <div className="panel">
        <div className="lbl" style={{ marginTop: 0 }}>What should the link show?</div>
        <div className="seg" role="group" aria-label="What the link shows" style={{ marginBottom: 8 }}>
          <button aria-pressed={scope === 'person'} onClick={() => setScope('person')}>Specific people</button>
          <button aria-pressed={scope === 'group'} onClick={() => setScope('group')}>Entire group</button>
        </div>
        {scope === 'group' ? (
          <div className="muted small">Everything: every expense with its notes and how it was split, balances, payments and receipt photos. Notes and receipts can include personal or card details, so share this one carefully.</div>
        ) : (
          <>
            <div className="muted small" style={{ marginBottom: 6 }}>Only the expenses each person paid or is part of, with the notes on those expenses, just their own share, who they pay and who owes them. Nothing about anyone else’s expenses, and no receipts.</div>
            {data.travelers.map(t => (
              <label className="radio" key={t.id}>
                <input type="checkbox" checked={pick.includes(t.id)} onChange={() => toggle(t.id)} />
                <Avatar name={t.name} color={t.color} /><span>{t.name}{!t.user_id && <span className="muted small"> · no account</span>}</span>
              </label>
            ))}
            {noAccount.length > 0 && <button className="linkbtn" onClick={() => setPick(noAccount.map(t => t.id))}>Select everyone without an account</button>}
            <div className="muted small">Pick several to give a couple or family one shared link.</div>
          </>
        )}
        <select value={expiry} onChange={e => setExpiry(e.target.value)} aria-label="Link expiry" style={{ marginTop: 10 }}>
          {EXPIRY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={(scope === 'person' && !pick.length) || busy} onClick={create}>{busy ? 'Creating…' : scope === 'group' ? 'Create link for the entire group' : pick.length > 1 ? 'Create one link for these people' : 'Create link'}</button>
      </div>

      {links?.map(l => {
        const k = 'off:' + l.id
        const expired = l.expires_at !== null && new Date(l.expires_at) <= new Date()
        return (
          <div className="panel" key={l.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <b>{l.scope === 'group' ? 'Entire group' : l.share_link_travelers.map(x => nameOf(x.traveler_id)).join(', ') || l.label}</b>
              {expired && <span className="tag">expired</span>}
            </div>
            <div className="muted small">
              {l.last_viewed_at ? `Opened ${l.view_count} time${l.view_count === 1 ? '' : 's'}, last ${when(l.last_viewed_at)}` : 'Not opened yet'}
              {l.expires_at ? ` · expires ${when(l.expires_at)}` : ''}
            </div>
            <div className="row2" style={{ marginTop: 10 }}>
              <button className="btn small" onClick={() => copy(l.token)}>Copy link</button>
              <button className="btn small primary" onClick={() => share(l)}>Share</button>
            </div>
            <div className="prow" style={{ marginBottom: 0 }}>
              <a className="linkbtn" href={shareUrl(l.token)} target="_blank" rel="noopener noreferrer">Preview</a>
              <span style={{ flex: 1 }} />
              <button className={'btn small danger' + (arm.is(k) ? ' armed' : '')} onClick={() => arm.is(k) ? turnOff(l.id) : arm.arm(k)}>{arm.is(k) ? 'Tap again to turn off' : 'Turn off'}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
