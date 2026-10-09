import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { joinNames } from '../lib/invoice'
import { Avatar, useArm, useToast } from './ui'
import { useGroup } from '../pages/GroupShell'

interface LinkRow {
  id: string; label: string; token: string; created_at: string; expires_at: string | null
  last_viewed_at: string | null; view_count: number; share_link_travelers: Array<{ traveler_id: string }>
}
export const shareUrl = (token: string) => `${window.location.origin}/b/${token}`

const EXPIRY: Array<[string, string, number | null]> = [['never', 'Never expires', null], ['7', 'Expires in 7 days', 7], ['30', 'Expires in 30 days', 30], ['90', 'Expires in 90 days', 90]]

/** Members create read-only balance links for people who don't have accounts. */
export default function BalanceLinks() {
  const { data } = useGroup()
  const toast = useToast()
  const arm = useArm()
  const [links, setLinks] = useState<LinkRow[] | null>(null)
  const [pick, setPick] = useState<string[]>([])
  const [expiry, setExpiry] = useState('never')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from('share_links')
      .select('id, label, token, created_at, expires_at, last_viewed_at, view_count, share_link_travelers(traveler_id)')
      .eq('group_id', data.group.id).order('created_at')
    if (error) toast(friendly(error)); else setLinks(rows as unknown as LinkRow[])
  }, [data.group.id, toast])
  useEffect(() => { load() }, [load])

  const noAccount = data.travelers.filter(t => !t.user_id)
  const nameOf = (id: string) => data.travelers.find(t => t.id === id)?.name ?? 'Someone'
  const toggle = (id: string) => setPick(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))
  const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  async function create() {
    if (!pick.length) return
    setBusy(true)
    const days = EXPIRY.find(e => e[0] === expiry)?.[2] ?? null
    const label = joinNames(data.travelers.filter(t => pick.includes(t.id)).map(t => t.name))
    const { error } = await supabase.rpc('create_share_link', { p_group: data.group.id, p_label: label, p_traveler_ids: pick, p_expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null })
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
      <h2>Balance links</h2>
      <div className="muted small">For people without an account. Send someone a private link and they can check their own balance, with every item and how to pay. It’s read-only: they can’t change anything, and they never see receipts or notes. They can see the trip’s expenses and how each is split, and anyone who gets the link can open it, so send it only to the person it’s for.</div>

      <div className="panel">
        <div className="lbl" style={{ marginTop: 0 }}>Create a link for</div>
        {data.travelers.map(t => (
          <label className="radio" key={t.id}>
            <input type="checkbox" checked={pick.includes(t.id)} onChange={() => toggle(t.id)} />
            <Avatar name={t.name} color={t.color} /><span>{t.name}{!t.user_id && <span className="muted small"> · no account</span>}</span>
          </label>
        ))}
        {noAccount.length > 0 && <button className="linkbtn" onClick={() => setPick(noAccount.map(t => t.id))}>Select everyone without an account</button>}
        <div className="muted small">Pick several to give a couple or family one shared link.</div>
        <select value={expiry} onChange={e => setExpiry(e.target.value)} aria-label="Link expiry" style={{ marginTop: 10 }}>
          {EXPIRY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={!pick.length || busy} onClick={create}>{busy ? 'Creating…' : pick.length > 1 ? 'Create one link for these people' : 'Create link'}</button>
      </div>

      {links?.map(l => {
        const k = 'off:' + l.id
        const expired = l.expires_at !== null && new Date(l.expires_at) <= new Date()
        return (
          <div className="panel" key={l.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <b>{l.share_link_travelers.map(x => nameOf(x.traveler_id)).join(', ') || l.label}</b>
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
