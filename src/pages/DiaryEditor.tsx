import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly, todayStr } from '../lib/format'
import { prepVaultFile } from '../lib/vault'
import { DIARY_COLS, diaryPath, MAX_DIARY_PHOTOS, signedPhotoUrls, splitPeople, type DiaryEntry, type DiaryPhoto } from '../lib/diary'
import { Spinner, useToast } from '../components/ui'

interface Added { blob: Blob; type: string; name: string; preview: string }

export default function DiaryEditor() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const picker = useRef<HTMLInputElement>(null)
  const [loaded, setLoaded] = useState(!id)
  const [trips, setTrips] = useState<Array<{ id: string; name: string }>>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [place, setPlace] = useState('')
  const [day, setDay] = useState(todayStr())
  const [time, setTime] = useState('')
  const [people, setPeople] = useState('')
  const [notes, setNotes] = useState('')
  const [trip, setTrip] = useState(sp.get('trip') ?? '')
  const [shared, setShared] = useState(false)
  const [kept, setKept] = useState<DiaryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [added, setAdded] = useState<Added[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const t = await supabase.from('itineraries').select('id, name').order('name')
      setTrips((t.data ?? []) as Array<{ id: string; name: string }>)
      if (!id) return
      const r = await supabase.from('diary_entries').select(DIARY_COLS).eq('id', id).maybeSingle()
      const e = r.data as DiaryEntry | null
      if (!e || e.created_by !== user?.id) { setError('You can only edit your own entries.'); setLoaded(true); return }
      setTitle(e.title); setDescription(e.description); setPlace(e.place); setDay(e.entry_on); setTime(e.entry_at?.slice(0, 5) ?? '')
      setPeople(e.people.join(', ')); setNotes(e.notes); setTrip(e.itinerary_id ?? ''); setShared(e.shared)
      const p = await supabase.from('diary_photos').select('id, entry_id, path, name, mime, caption').eq('entry_id', id).order('path')
      const list = (p.data ?? []) as DiaryPhoto[]
      setKept(list); setUrls(await signedPhotoUrls(list.map(x => x.path))); setLoaded(true)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id])

  async function pick(files: FileList | null) {
    if (!files) return
    const room = MAX_DIARY_PHOTOS - kept.length - added.length
    const out: Added[] = []
    for (const f of Array.from(files).slice(0, Math.max(0, room))) {
      if (!f.type.startsWith('image/')) { setError('Only photos can be added to a diary entry.'); continue }
      try { const p = await prepVaultFile(f); out.push({ ...p, preview: URL.createObjectURL(p.blob) }) } catch (e) { setError((e as Error).message) }
    }
    if (files.length > room) setError(`An entry holds up to ${MAX_DIARY_PHOTOS} photos.`)
    setAdded(a => [...a, ...out])
    if (picker.current) picker.current.value = ''
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault()
    if (!title.trim()) { setError('Give the entry a title.'); return }
    if (!user) return
    setBusy(true); setError(null)
    const row = {
      title: title.trim(), description: description.trim(), place: place.trim(), entry_on: day || todayStr(), entry_at: time || null,
      people: splitPeople(people), notes: notes.trim(), itinerary_id: trip || null, shared: trip ? shared : false,
    }
    let eid = id
    if (id) {
      const { error } = await supabase.from('diary_entries').update(row).eq('id', id)
      if (error) { setBusy(false); setError(friendly(error)); return }
    } else {
      const { data, error } = await supabase.from('diary_entries').insert({ ...row, created_by: user.id }).select('id').single()
      if (error || !data) { setBusy(false); setError(friendly(error)); return }
      eid = (data as { id: string }).id
    }
    let problem = false
    const keptIds = new Set(kept.map(k => k.id))
    const gone = await supabase.from('diary_photos').select('id, path').eq('entry_id', eid!)
    const removed = ((gone.data ?? []) as Array<{ id: string; path: string }>).filter(x => !keptIds.has(x.id))
    if (removed.length) {
      const d = await supabase.from('diary_photos').delete().in('id', removed.map(x => x.id))
      if (d.error) problem = true; else await supabase.storage.from('diary').remove(removed.map(x => x.path))
    }
    for (const f of added) {
      const path = diaryPath(eid!, f.name)
      const up = await supabase.storage.from('diary').upload(path, f.blob, { contentType: f.type, upsert: false })
      if (up.error) { problem = true; continue }
      const r = await supabase.from('diary_photos').insert({ entry_id: eid, path, name: f.name.slice(0, 120), mime: f.type })
      if (r.error) { problem = true; await supabase.storage.from('diary').remove([path]) }
    }
    setBusy(false)
    toast(problem ? 'Saved, but a photo failed to upload. Open the entry to retry.' : id ? 'Updated.' : 'Entry saved.')
    nav('/diary/' + eid, { replace: true })
  }

  if (!loaded) return <div className="app"><Spinner /></div>
  const count = kept.length + added.length
  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to={id ? '/diary/' + id : '/diary'}>← Diary</Link><h1>{id ? 'Edit entry' : 'New diary entry'}</h1></div></div>
      <form onSubmit={submit} className="panel">
        {error && <div className="notice err" role="alert">{error}</div>}
        <label className="lbl" htmlFor="dt">Title</label>
        <input id="dt" type="text" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} autoFocus={!id} />
        <label className="lbl" htmlFor="dd">Description</label>
        <textarea id="dd" rows={5} value={description} maxLength={5000} onChange={e => setDescription(e.target.value)} placeholder="What happened?" />
        <label className="lbl" htmlFor="dp">Place</label>
        <input id="dp" type="text" value={place} maxLength={80} onChange={e => setPlace(e.target.value)} />
        <div className="row2">
          <div><label className="lbl" htmlFor="dday">Date</label><input type="date" id="dday" value={day} onChange={e => setDay(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="dtm">Time</label><input type="time" id="dtm" value={time} onChange={e => setTime(e.target.value)} /></div>
        </div>
        <label className="lbl" htmlFor="dpe">People</label>
        <input id="dpe" type="text" value={people} onChange={e => setPeople(e.target.value)} placeholder="Comma separated, e.g. Ann, Ed" />
        <label className="lbl" htmlFor="dn">Notes</label>
        <textarea id="dn" rows={3} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} />
        <label className="lbl" htmlFor="dtrip">Trip</label>
        <select id="dtrip" value={trip} onChange={e => setTrip(e.target.value)}>
          <option value="">No trip (personal)</option>
          {trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {trip && (
          <label className="chk"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Share this entry with everyone on the trip</label>
        )}
        <div className="muted small">{trip && shared ? 'People on the trip can read this entry and its photos. Only you can change it.' : 'Only you can see this entry.'}</div>

        <span className="lbl">Photos ({count}/{MAX_DIARY_PHOTOS})</span>
        <div className="vgallery">
          {kept.map(p => (
            <span key={p.id} className="vthumb">{urls[p.path] ? <img src={urls[p.path]} alt={p.name} /> : p.name}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setKept(k => k.filter(x => x.id !== p.id))}>×</button></span>
          ))}
          {added.map((a, i) => (
            <span key={a.preview} className="vthumb"><img src={a.preview} alt={a.name} />
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAdded(l => l.filter((_, j) => j !== i))}>×</button></span>
          ))}
        </div>
        <input ref={picker} type="file" accept="image/*" multiple hidden aria-label="Add photos" onChange={e => pick(e.target.files)} />
        <button type="button" className="btn" disabled={count >= MAX_DIARY_PHOTOS} onClick={() => picker.current?.click()}>Add photos</button>

        <button className="btn primary block" disabled={busy} style={{ marginTop: 14 }}>{busy ? 'Saving…' : 'Save entry'}</button>
      </form>
    </div>
  )
}
