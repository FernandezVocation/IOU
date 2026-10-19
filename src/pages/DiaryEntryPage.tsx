import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { friendly, fmtDate, fmtTime } from '../lib/format'
import { DIARY_COLS, signedPhotoUrls, type DiaryEntry, type DiaryPhoto } from '../lib/diary'
import { Spinner, useToast } from '../components/ui'

export default function DiaryEntryPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [e, setE] = useState<DiaryEntry | null | undefined>(undefined)
  const [photos, setPhotos] = useState<DiaryPhoto[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [trip, setTrip] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const r = await supabase.from('diary_entries').select(DIARY_COLS).eq('id', id).maybeSingle()
      if (r.error) { setError(friendly(r.error)); setE(null); return }
      const row = (r.data as DiaryEntry | null) ?? null
      setE(row)
      if (!row) return
      const [p, t] = await Promise.all([
        supabase.from('diary_photos').select('id, entry_id, path, name, mime, caption').eq('entry_id', id).order('path'),
        row.itinerary_id ? supabase.from('itineraries').select('name').eq('id', row.itinerary_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const list = (p.data ?? []) as DiaryPhoto[]
      setPhotos(list); setTrip((t.data as { name: string } | null)?.name ?? '')
      setUrls(await signedPhotoUrls(list.map(x => x.path)))
    })()
  }, [id])

  if (e === undefined) return <div className="app"><Spinner /></div>
  if (!e) return <div className="app">{error && <div className="notice err" role="alert">{error}</div>}<div className="empty"><b>Entry not found</b>It may have been deleted, or it is private to someone else.</div><Link className="btn block" to="/diary">Back to the diary</Link></div>
  const mine = e.created_by === user?.id

  async function remove() {
    if (!e || !window.confirm('Delete this diary entry and its photos?')) return
    const paths = photos.map(p => p.path)
    const d = await supabase.from('diary_entries').delete().eq('id', e.id)
    if (d.error) { setError(friendly(d.error)); return }
    if (paths.length) await supabase.storage.from('diary').remove(paths)
    toast('Entry deleted.')
    nav(e.itinerary_id ? '/diary?trip=' + e.itinerary_id : '/diary', { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to={e.itinerary_id ? '/diary?trip=' + e.itinerary_id : '/diary'}>← Diary</Link><h1>{e.title}</h1>
        <div className="sub">{fmtDate(e.entry_on)}{e.entry_at ? ' · ' + fmtTime(e.entry_at) : ''}{e.place ? ' · ' + e.place : ''}</div></div></div>
      {error && <div className="notice err" role="alert">{error}</div>}
      <div className="panel">
        <div>{e.shared ? <em className="pv amt">Shared with {trip || 'the trip'}</em> : <em className="pv">Only me</em>}</div>
        {e.description && <p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}
        {e.people.length > 0 && <p className="muted small">With {e.people.join(', ')}</p>}
        {e.notes && <><span className="lbl">Notes</span><p style={{ whiteSpace: 'pre-wrap' }}>{e.notes}</p></>}
        {photos.length > 0 && (
          <div className="vgallery" aria-label="Photos">
            {photos.map(p => urls[p.path]
              ? <a key={p.id} href={urls[p.path]} target="_blank" rel="noopener noreferrer"><img src={urls[p.path]} alt={p.caption || p.name} loading="lazy" /></a>
              : <span key={p.id} className="muted small">{p.name}</span>)}
          </div>
        )}
      </div>
      {mine && (
        <div className="prow" style={{ marginTop: 14 }}>
          <Link className="btn" to={`/diary/${e.id}/edit`}>Edit</Link>
          <button className="btn danger" onClick={remove}>Delete</button>
        </div>
      )}
    </div>
  )
}
