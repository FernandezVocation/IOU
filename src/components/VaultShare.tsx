import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { whenLabel } from '../lib/vault'
import { Sheet, useArm, useToast } from './ui'
import { useVault } from '../pages/VaultShell'

interface LinkRow { id: string; label: string; token: string; scope: 'vault' | 'items'; created_at: string }
export const vaultShareUrl = (token: string) => `${window.location.origin}/v/${token}`

/** Read-only links: none, the whole vault, or chosen items. Private items are never offered. */
export default function VaultShare({ onClose }: { onClose: () => void }) {
  const { data } = useVault()
  const toast = useToast()
  const arm = useArm()
  const [links, setLinks] = useState<LinkRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState<'vault' | 'items'>('vault')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)
  const shareable = data.items.filter(i => !i.private)

  const load = useCallback(async () => {
    const l = await supabase.from('vault_links').select('id, label, token, scope, created_at').eq('vault_id', data.vault.id).order('created_at', { ascending: false })
    if (l.error) { toast(friendly(l.error)); return }
    setLinks(l.data as LinkRow[])
    const li = await supabase.from('vault_link_items').select('link_id').eq('vault_id', data.vault.id)
    const c: Record<string, number> = {}
    for (const x of (li.data ?? []) as Array<{ link_id: string }>) c[x.link_id] = (c[x.link_id] ?? 0) + 1
    setCounts(c)
  }, [data.vault.id, toast])
  useEffect(() => { load() }, [load])

  async function copy(token: string) {
    try { await navigator.clipboard.writeText(vaultShareUrl(token)); toast('Link copied.') } catch { toast('Could not copy. Use Share instead.') }
  }
  async function create() {
    if (!label.trim()) { toast('Give the link a name, like “Mom”.'); return }
    if (scope === 'items' && picked.size === 0) { toast('Choose at least one item.'); return }
    setBusy(true)
    const { data: tok, error } = await supabase.rpc('create_vault_link', { p_vault: data.vault.id, p_label: label.trim(), p_scope: scope, p_item_ids: scope === 'items' ? [...picked] : [], p_expires_at: null })
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    setLabel(''); setPicked(new Set()); setFresh(tok as string)
    await load()
    copy(tok as string)
  }
  async function off(id: string) {
    setBusy(true)
    const { error } = await supabase.from('vault_links').delete().eq('id', id)
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    arm.clear(); toast('Link turned off.'); await load()
  }
  async function offAll() {
    setBusy(true)
    const { error } = await supabase.from('vault_links').delete().eq('vault_id', data.vault.id)
    setBusy(false)
    if (error) { toast(friendly(error)); return }
    arm.clear(); toast('All links turned off.'); await load()
  }
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <Sheet title="Read-only links" onClose={onClose}>
      <div className="muted small">Anyone with a link can look but not change anything, and needs no account. Private items are never included. Turning a link off ends access at once.</div>

      <div className="sect">
        <h2>New link</h2>
        <label className="lbl" htmlFor="vl" style={{ marginTop: 0 }}>Who is it for?</label>
        <input id="vl" type="text" value={label} maxLength={80} placeholder="Mom" onChange={e => setLabel(e.target.value)} />
        <span className="lbl" id="vsc">What can they see?</span>
        <div className="seg" role="group" aria-labelledby="vsc">
          <button type="button" aria-pressed={scope === 'vault'} onClick={() => setScope('vault')}>Whole vault</button>
          <button type="button" aria-pressed={scope === 'items'} onClick={() => setScope('items')}>Specific items</button>
        </div>
        {scope === 'vault' && <div className="muted small" style={{ marginTop: 6 }}>Every item that isn’t private, now and as you add more.</div>}
        {scope === 'items' && (
          <div style={{ marginTop: 8 }}>
            {shareable.length === 0 && <div className="muted small">No items can be shared yet.</div>}
            {shareable.map(i => (
              <label className="radio" key={i.id}><input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} />{i.title}<span className="muted small"> {whenLabel(i)}</span></label>
            ))}
          </div>
        )}
        <div className="notice" style={{ marginTop: 10 }}>Tickets and QR codes are included, so whoever holds the link could use them. Share only with people you trust.</div>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={busy} onClick={create}>Create link and copy</button>
        {fresh && <div className="muted small" style={{ marginTop: 6, wordBreak: 'break-all' }}>{vaultShareUrl(fresh)}</div>}
      </div>

      <div className="sect">
        <h2>Links that are on</h2>
        {links === null && <div className="muted small">Loading…</div>}
        {links?.length === 0 && <div className="muted small">None. Nobody has read-only access.</div>}
        {links?.map(l => (
          <div className="prow" key={l.id}>
            <span style={{ flex: 1 }}><b>{l.label}</b><br /><span className="muted small">{l.scope === 'vault' ? 'Whole vault' : `${counts[l.id] ?? 0} item${(counts[l.id] ?? 0) === 1 ? '' : 's'}`}</span></span>
            <button className="btn small" onClick={() => copy(l.token)}>Copy</button>
            {typeof navigator !== 'undefined' && 'share' in navigator && <button className="btn small" onClick={() => navigator.share({ title: data.vault.name, url: vaultShareUrl(l.token) }).catch(() => { /* cancelled */ })}>Share</button>}
            <button className={'btn small danger' + (arm.is(l.id) ? ' armed' : '')} disabled={busy} onClick={() => arm.is(l.id) ? off(l.id) : arm.arm(l.id)}>{arm.is(l.id) ? 'Confirm' : 'Turn off'}</button>
          </div>
        ))}
        {!!links?.length && <button className={'btn danger block' + (arm.is('all') ? ' armed' : '')} style={{ marginTop: 10 }} disabled={busy} onClick={() => arm.is('all') ? offAll() : arm.arm('all')}>{arm.is('all') ? 'Tap again to turn off every link' : 'No vault access: turn off all links'}</button>}
      </div>
    </Sheet>
  )
}
