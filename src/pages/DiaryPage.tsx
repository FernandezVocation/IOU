import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly, fmtDate, fmtTime } from '../lib/format'
import { DIARY_COLS, matchDiary, sortDiary, type DiaryEntry } from '../lib/diary'
import { Spinner } from '../components/ui'
import TopNav from '../components/TopNav'

export default function DiaryPage() {
  const [sp] = useSearchParams()
  const trip = sp.get('trip') ?? ''
  const [rows, setRows] = useState<DiaryEntry[] | null>(null)
  const [trips, setTrips] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      let qy = supabase.from('diary_entries').select(DIARY_COLS)
      if (trip) qy = qy.eq('itinerary_id', trip)
      const [r, t] = await Promise.all([qy, supabase.from('itineraries').select('id, name')])
      if (r.error) { setError(friendly(r.error)); return }
      const list = (r.data ?? []) as DiaryEntry[]
      setRows(list)
      setTrips(Object.fromEntries(((t.data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name])))
      if (list.length) {
        const p = await supabase.from('diary_photos').select('entry_id').in('entry_id', list.map(x => x.id))
        const c: Record<string, number> = {}
        for (const x of (p.data ?? []) as Array<{ entry_id: string }>) c[x.entry_id] = (c[x.entry_id] ?? 0) + 1
        setPhotos(c)
      }
    })()
  }, [trip])

  const shown = useMemo(() => sortDiary(matchDiary(rows ?? [], q)), [rows, q])
  const newTo = '/diary/new' + (trip ? '?trip=' + trip : '')
  const back = trip ? `/itinerary/${trip}` : '/itineraries'

  return (
    <>
    <div className="app">
      <div className="top"><div><Link className="backlink" to={back}>← {trip ? (trips[trip] ?? 'Itinerary') : 'Itineraries'}</Link><h1>{trip ? 'Trip diary' : 'My diary'}</h1><div className="sub">Entries are private to you until you share one with its trip.</div></div></div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {rows === null && !error && <Spinner />}
      {rows && rows.length === 0 && <div className="empty"><b>No entries yet</b>Write down what happened, who was there and add photos.</div>}
      {rows && rows.length > 0 && <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the diary" aria-label="Search the diary" />}
      <div className="vlist">
        {shown.map(e => (
          <div className="vrow" key={e.id}>
            <Link className="vmain" to={'/diary/' + e.id}>
              <span className="vtime">{e.entry_at ? fmtTime(e.entry_at) : '–'}<small>{fmtDate(e.entry_on).replace(/^[^,]+, /, '')}</small></span>
              <span className="vtx">
                <b>{e.title}{!e.shared && <em className="pv">Only me</em>}{e.shared && <em className="pv amt">Shared</em>}</b>
                <span>{[e.place, e.itinerary_id ? trips[e.itinerary_id] : '', photos[e.id] ? `${photos[e.id]} photo${photos[e.id] === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
              </span>
            </Link>
          </div>
        ))}
      </div>
      <Link className="btn primary block" to={newTo} style={{ marginTop: 14 }}>Write an entry</Link>
    </div>
    <TopNav />
    </>
  )
}
