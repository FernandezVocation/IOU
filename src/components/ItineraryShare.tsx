import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { whenLabel } from '../lib/itinerary'
import { Sheet, useArm, useToast } from './ui'
import { useItinerary } from '../pages/ItineraryShell'

interface LinkRow { id: string; label: string; token: string; scope: 'itinerary' | 'items'; include_notes: boolean; created_at: string }
export const itineraryShareUrl = (token: string) => `${window.location.origin}/i/${token}`

/** Read-only links: the whole itinerary or chosen items. Only me items are never offered. Notes are off unless switched on. */
export default function ItineraryShare({ onClose }: { onClose: () => void }) {
  const { data } = useItinerary()
  const toast = useToast()
  const arm = useArm()
  const [links, setLinks] = useState<LinkRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState<'itinerary' | 'items'>('itinerary')
  const [notes, setNotes] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const shareable = data.items.filter(i => !i.private)
  const id = data.itinerary.id

  const load = useCallback(async () => {
    const l = await supabase.from('itinerary_links').select('id, label, token, scope, include_notes, created_at').eq('itinerary_id', id).order('created_at', { ascending: false })
    if (l.error) { toast(friendly(l.error)); return }
    setLinks(l.data as LinkRow[])
    const li = await supabase.from('itinerary_link_items').select('link_id').eq('itinerary_id', id)
    const c: Record<string, number> = {}
    for (const x of (li.data ?? []) as Array<{ link_id: string }>) c[x.link_id] = (c[x.link_id] ?? 0) + 1
    setCounts(c)
  }, [id, toast])
  useEffect(() => { load() }, [load])

  async function copy(token: string) {
    try { await navigator.clipboard.writeText(itineraryShareUrl(token)); toast('Link copied.') } catch { toast('Could not copy. Use Share instead.') }
  }
  async function create() {
    if (!label.trim()) { toast('Give the link a name, like “Mom”.'); return }
    if (scope === 'items' && picked.size === 0) { toast('Choose at least one item.'); return }
    setBusy(true)
    const { data: tok, error } = await supabase.rpc('create_itinerary_link', { p_it: id, p_label: label.trim(), p_scope: scope, p_item_ids: scope === 'items' ? [...picked] : [], p_include_notes: notes, p_expires_at: null })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    setLabel(''); setPicked(new Set()); setFresh(tok as string)
    await load()
    copy(tok as string)
  }
  async function off(lid: string) {
    setBusy(true)
    const { error } = await supabase.from('itinerary_links').delete().eq('id', lid)
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    arm.clear(); toast('Link turned off.'); await load()
  }
  async function offAll() {
    setBusy(true)
    const { error } = await supabase.from('itinerary_links').delete().eq('itinerary_id', id)
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    arm.clear(); toast('All links turned off.'); await load()
  }
  const toggle = (x: string) => setPicked(p => { const n = new Set(p); if (n.has(x)) n.delete(x); else n.add(x); return n })

  return (
    <Sheet title="Read-only links" onClose={onClose}>
      <div className="muted small">Anyone with a link can look but not change anything, and needs no account. Only me items are never included. Turning a link off ends access at once.</div>

      <div className="sect">
        <h2>New link</h2>
        <label className="lbl" htmlFor="il" style={{ marginTop: 0 }}>Who is it for?</label>
        <input id="il" type="text" value={label} maxLength={80} placeholder="Mom" onChange={e => setLabel(e.target.value)} />
        <span className="lbl" id="isc">What can they see?</span>
        <div className="seg" role="group" aria-labelledby="isc">
          <button type="button" aria-pressed={scope === 'itinerary'} onClick={() => setScope('itinerary')}>Whole itinerary</button>
          <button type="button" aria-pressed={scope === 'items'} onClick={() => setScope('items')}>Specific items</button>
        </div>
        {scope === 'itinerary' && <div className="muted small" style={{ marginTop: 6 }}>Every item that isn’t Only me, now and as you add more.</div>}
        {scope === 'items' && (
          <div style={{ marginTop: 8 }}>
            {shareable.length === 0 && <div className="muted small">No items can be shared yet.</div>}
            {shareable.map(i => (
              <label className="radio" key={i.id}><input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} />{i.title}<span className="muted small"> {whenLabel(i)}</span></label>
            ))}
          </div>
        )}
        <label className="radio" style={{ marginTop: 10 }}><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} />Include notes and instructions</label>
        <div className="muted small" style={{ marginLeft: 26 }}>Off by default. Notes can hold door codes, booking numbers or instructions you may not want outsiders to see.</div>
        <div className="notice" style={{ marginTop: 10 }}>Vault tickets, QR codes and files are never part of an itinerary link. Linked items just show a small ticket icon.</div>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={busy} onClick={create}>Create link and copy</button>
        {fresh && <div className="muted small" style={{ marginTop: 6, wordBreak: 'break-all' }}>{itineraryShareUrl(fresh)}</div>}
      </div>

      <div className="sect">
        <h2>Links that are on</h2>
        {links === null && <div className="muted small">Loading…</div>}
        {links?.length === 0 && <div className="muted small">None. Nobody has read-only access.</div>}
        {links?.map(l => (
          <div className="prow" key={l.id}>
            <span style={{ flex: 1 }}><b>{l.label}</b><br /><span className="muted small">{(l.scope === 'itinerary' ? 'Whole itinerary' : `${counts[l.id] ?? 0} item${(counts[l.id] ?? 0) === 1 ? '' : 's'}`) + (l.include_notes ? ' · notes included' : ' · no notes')}</span></span>
            <button className="btn small" onClick={() => copy(l.token)}>Copy</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && <button className="btn small" onClick={() => navigator.share({ title: data.itinerary.name, url: itineraryShareUrl(l.token) }).catch(() => { /* cancelled */ })}>Share</button>}
            <button className={'btn small danger' + (arm.is(l.id) ? ' armed' : '')} disabled={busy} onClick={() => arm.is(l.id) ? off(l.id) : arm.arm(l.id)}>{arm.is(l.id) ? 'Confirm' : 'Turn off'}</button>
          </div>
        ))}
        {!!links?.length && <button className={'btn danger block' + (arm.is('all') ? ' armed' : '')} style={{ marginTop: 10 }} disabled={busy} onClick={() => arm.is('all') ? offAll() : arm.arm('all')}>{arm.is('all') ? 'Tap again to turn off every link' : 'Turn off all links'}</button>}
      </div>
    </Sheet>
  )
}
