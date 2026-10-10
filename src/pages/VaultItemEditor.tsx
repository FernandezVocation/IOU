import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { prepVaultFile, safeFileName, TYPES, typeOf, type ItemType, type VaultFile } from '../lib/vault'
import { useToast } from '../components/ui'
import { useVault } from './VaultShell'

interface NewFile { blob: Blob; type: string; name: string; label: string; preview: string }

const strOrNull = (s: string) => (s.trim() ? s.trim() : null)

export default function VaultItemEditor() {
  const { iid = '' } = useParams()
  const { data, reload } = useVault()
  const nav = useNavigate()
  const toast = useToast()
  const v = data.vault
  const existing = iid === 'new' ? undefined : data.items.find(i => i.id === iid)
  const back = '/vault/' + v.id
  const picker = useRef<HTMLInputElement>(null)

  const [type, setType] = useState<ItemType>(existing?.type ?? 'ticket')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? '')
  const [startsAt, setStartsAt] = useState((existing?.starts_at ?? '').slice(0, 5))
  const [endsOn, setEndsOn] = useState(existing?.ends_on ?? '')
  const [endsAt, setEndsAt] = useState((existing?.ends_at ?? '').slice(0, 5))
  const [showEnd, setShowEnd] = useState(!!(existing?.ends_on || existing?.ends_at))
  const [place, setPlace] = useState(existing?.place ?? '')
  const [address, setAddress] = useState(existing?.address ?? '')
  const [website, setWebsite] = useState(existing?.website ?? '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [priv, setPriv] = useState(existing?.private ?? false)
  const [kept, setKept] = useState<VaultFile[]>(existing?.files ?? [])
  const [keptLabels, setKeptLabels] = useState<Record<string, string>>(Object.fromEntries((existing?.files ?? []).map(f => [f.id, f.label])))
  const [added, setAdded] = useState<NewFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const places = useMemo(() => [...new Set(data.items.map(i => i.place.trim()).filter(Boolean))].sort(), [data.items])
  const t = typeOf(type)
  const stay = type === 'stay'
  const [touchedPriv, setTouchedPriv] = useState(!!existing)

  if (iid !== 'new' && !existing) return <div className="app"><div className="empty"><b>Item not found</b></div><Link className="btn block" to={back}>Back to the vault</Link></div>
  if (existing && !data.canChange(existing)) return <div className="app"><div className="notice err" role="alert">Only the person who added this, or a vault owner or co-admin, can change it.</div><Link className="btn block" to={`${back}/item/${existing.id}`}>Back</Link></div>

  function pickType(id: ItemType) {
    setType(id)
    // Documents start private: passports and insurance cards are not for everyone. The choice is still theirs.
    if (!touchedPriv) setPriv(id === 'document')
  }

  async function onFiles(list: FileList | null) {
    if (!list) return
    const out: NewFile[] = []
    for (const f of Array.from(list)) {
      try { const p = await prepVaultFile(f); out.push({ ...p, label: '', preview: p.type.startsWith('image/') ? URL.createObjectURL(p.blob) : '' }) }
      catch (e) { setError((e as Error).message) }
    }
    setAdded(a => [...a, ...out])
    if (picker.current) picker.current.value = ''
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Give it a title.'); return }
    if (endsOn && startsOn && endsOn < startsOn) { setError('The end date is before the start.'); return }
    setBusy(true); setError(null)
    const row = {
      type, title: title.trim(), starts_on: strOrNull(startsOn), starts_at: strOrNull(startsAt), ends_on: showEnd ? strOrNull(endsOn) : null, ends_at: showEnd ? strOrNull(endsAt) : null,
      place: place.trim(), address: address.trim(), website: website.trim(), notes: notes.trim(), private: priv,
    }
    let id = existing?.id
    if (existing) {
      const { error } = await supabase.from('vault_items').update(row).eq('id', existing.id)
      if (error) { setBusy(false); setError(friendly(error)); return }
    } else {
      const { data: ins, error } = await supabase.from('vault_items').insert({ ...row, vault_id: v.id, created_by: data.userId }).select('id').single()
      if (error || !ins) { setBusy(false); setError(friendly(error)); return }
      id = (ins as { id: string }).id
    }
    let problem = false
    // Removed files
    const gone = (existing?.files ?? []).filter(f => !kept.some(k => k.id === f.id))
    if (gone.length) {
      const d = await supabase.from('vault_files').delete().in('id', gone.map(f => f.id))
      if (d.error) problem = true
      else await supabase.storage.from('vault').remove(gone.map(f => f.path))
    }
    // Labels changed on kept files
    for (const f of kept) if ((keptLabels[f.id] ?? '') !== f.label) {
      const u = await supabase.from('vault_files').update({ label: keptLabels[f.id] ?? '' }).eq('id', f.id)
      if (u.error) problem = true
    }
    // New files
    for (const f of added) {
      const path = `${v.id}/${id}/${crypto.randomUUID()}-${safeFileName(f.name)}`
      const up = await supabase.storage.from('vault').upload(path, f.blob, { contentType: f.type, upsert: false })
      if (up.error) { problem = true; continue }
      const r = await supabase.from('vault_files').insert({ vault_id: v.id, item_id: id, path, name: f.name.slice(0, 120), mime: f.type, label: f.label.trim().slice(0, 60) })
      if (r.error) { problem = true; await supabase.storage.from('vault').remove([path]) }
    }
    await reload()
    setBusy(false)
    toast(problem ? 'Saved, but a file failed to upload. Open the item to retry.' : existing ? 'Updated.' : 'Added to the vault.')
    nav(`${back}/item/${id}`, { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to={existing ? `${back}/item/${existing.id}` : back}>← {existing ? existing.title : v.name}</Link><h1>{existing ? 'Edit item' : 'Add to the vault'}</h1></div></div>
      <form onSubmit={submit} className="panel">
        <span className="lbl" style={{ marginTop: 0 }} id="vtype">What is it?</span>
        <div className="vtypes" role="group" aria-labelledby="vtype">
          {TYPES.map(x => (
            <button type="button" key={x.id} aria-pressed={type === x.id} onClick={() => pickType(x.id)}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: x.icon }} />
              {x.label}
            </button>
          ))}
        </div>

        <label className="lbl" htmlFor="vt">Title</label>
        <input id="vt" type="text" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder={type === 'stay' ? 'Hotel Roma Centro' : type === 'ticket' ? 'Italo · Florence to Rome' : 'Name'} autoFocus={!existing} />

        <div className="row2">
          <div><label className="lbl" htmlFor="vd">{stay ? 'Check-in date' : 'Date'}</label><input type="date" id="vd" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="vh">{stay ? 'Check-in time' : 'Time'}</label><input type="time" id="vh" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>Times are local to the place, exactly as on the booking. Nothing is converted.</div>
        {(stay || showEnd) ? (
          <div className="row2">
            <div><label className="lbl" htmlFor="ved">{stay ? 'Check-out date' : 'Ends on'}</label><input type="date" id="ved" value={endsOn} onChange={e => { setShowEnd(true); setEndsOn(e.target.value) }} /></div>
            <div><label className="lbl" htmlFor="veh">{stay ? 'Check-out time' : 'Ends at'}</label><input type="time" id="veh" value={endsAt} onChange={e => { setShowEnd(true); setEndsAt(e.target.value) }} /></div>
          </div>
        ) : <button type="button" className="linkbtn" onClick={() => setShowEnd(true)}>+ Add an end date or time</button>}

        <label className="lbl" htmlFor="vp">Place</label>
        <input id="vp" type="text" value={place} maxLength={80} list="vplaces" autoComplete="off" onChange={e => setPlace(e.target.value)} placeholder="Florence" />
        <datalist id="vplaces">{places.map(p => <option key={p} value={p} />)}</datalist>
        <label className="lbl" htmlFor="va">Address</label>
        <input id="va" type="text" value={address} maxLength={200} onChange={e => setAddress(e.target.value)} placeholder="Piazza della Stazione" />
        <div className="muted small" style={{ marginTop: 4 }}>Used for the Map and Directions links.</div>
        <label className="lbl" htmlFor="vw">Website</label>
        <input id="vw" type="text" inputMode="url" value={website} maxLength={300} onChange={e => setWebsite(e.target.value)} placeholder="italotreno.it" autoCapitalize="none" />
        <label className="lbl" htmlFor="vn2">Notes</label>
        <textarea id="vn2" rows={3} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder={t.timed ? 'Booking reference, gate, who is on it' : ''} />

        <span className="lbl">Ticket, booking or code</span>
        <input ref={picker} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => onFiles(e.target.files)} aria-label="Attach photos or PDFs" />
        <button type="button" className="btn block" onClick={() => picker.current?.click()}>Add photos, screenshots or PDFs</button>
        {kept.map(f => (
          <div className="vfedit" key={f.id}>
            <span className="vfname">{f.name || 'File'}</span>
            <input type="text" value={keptLabels[f.id] ?? ''} maxLength={60} placeholder="Label, e.g. Adult 1" aria-label={`Label for ${f.name || 'file'}`} onChange={e => setKeptLabels(l => ({ ...l, [f.id]: e.target.value }))} />
            <button type="button" className="btn small" onClick={() => setKept(k => k.filter(x => x.id !== f.id))}>Remove</button>
          </div>
        ))}
        {added.map((f, i) => (
          <div className="vfedit" key={i}>
            {f.preview ? <img src={f.preview} alt="" /> : <span className="vfname">{f.name}</span>}
            <input type="text" value={f.label} maxLength={60} placeholder="Label, e.g. Adult 1" aria-label={`Label for ${f.name}`} onChange={e => setAdded(a => a.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <button type="button" className="btn small" onClick={() => setAdded(a => a.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div className="muted small" style={{ marginTop: 6 }}>Photos are shrunk to fit. Keep the original QR screenshot for the sharpest scan.</div>

        <span className="lbl" id="vvis">Who can see it?</span>
        <div className="seg" role="group" aria-labelledby="vvis">
          <button type="button" aria-pressed={!priv} onClick={() => { setTouchedPriv(true); setPriv(false) }}>Everyone in the vault</button>
          <button type="button" aria-pressed={priv} onClick={() => { setTouchedPriv(true); setPriv(true) }}>Only me</button>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>Documents start as Only me. Private items are hidden from everyone else, including the owner, and never appear in read-only links.</div>

        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  )
}
