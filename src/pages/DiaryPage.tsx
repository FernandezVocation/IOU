import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly, fmtDate, fmtTime } from '../lib/format'
import { byLink, DIARY_COLS, matchDiary, sortDiary, type DiaryEntry } from '../lib/diary'
import { Spinner } from '../components/ui'
import TopNav from '../components/TopNav'

export default function DiaryPage() {
  const [sp] = useSearchParams()
  const link = sp.get('trip') ?? sp.get('group') ?? ''
  const [filter, setFilter] = useState<string>(link || 'all')
  const [rows, setRows] = useState<DiaryEntry[] | null>(null)
  const [trips, setTrips] = useState<Record<string, string>>({})
  const [groups, setGroups] = useState<Record<string, string>>({})
  const [photos, setPhotos] = useState<Record<string, number>>({})
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const [r, t, g] = await Promise.all([supabase.from('diary_entries').select(DIARY_COLS), supabase.from('itineraries').select('id, name'), supabase.from('groups').select('id, name')])
      if (r.error) { setError(friendly(r.error)); return }
      const list = (r.data ?? []) as DiaryEntry[]
      setRows(list)
      setTrips(Object.fromEntries(((t.data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name])))
      setGroups(Object.fromEntries(((g.data ?? []) as Array<{ id: string; name: string }>).map(x => [x.id, x.name])))
      if (list.length) {
        const p = await supabase.from('diary_photos').select('entry_id').in('entry_id', list.map(x => x.id))
        const c: Record<string, number> = {}
        for (const x of (p.data ?? []) as Array<{ entry_id: string }>) c[x.entry_id] = (c[x.entry_id] ?? 0) + 1
        setPhotos(c)
      }
    })()
  }, [])

  const shown = useMemo(() => sortDiary(matchDiary(byLink(rows ?? [], filter), q)), [rows, q, filter])
  const newTo = '/diary/new' + (filter in trips ? '?trip=' + filter : filter in groups ? '?group=' + filter : '')
  const used = useMemo(() => {
    const ids = new Set((rows ?? []).flatMap(r => [r.itinerary_id, r.group_id].filter(Boolean) as string[]))
    return { trips: Object.keys(trips).filter(i => ids.has(i)), groups: Object.keys(groups).filter(i => ids.has(i)), standalone: (rows ?? []).some(r => !r.itinerary_id && !r.group_id) }
  }, [rows, trips, groups])

  return (
    <>
    <div className="app">
      <div className="top"><div><h1>Diary</h1><div className="sub">Entries are private to you until you share one with its trip or group.</div></div></div>
      {error && <div className="notice err" role="alert">{error}</div>}
      {rows === null && !error && <Spinner />}
      {rows && rows.length === 0 && <div className="empty"><b>No entries yet</b>Write down what happened, who was there and add photos.</div>}
      {rows && rows.length > 0 && (used.trips.length + used.groups.length > 0) && (
        <div className="chips" role="group" aria-label="Filter by link">
          <button className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
          {used.standalone && <button className="chip" aria-pressed={filter === 'standalone'} onClick={() => setFilter('standalone')}>Standalone</button>}
          {used.groups.map(i => <button key={i} className="chip" aria-pressed={filter === i} onClick={() => setFilter(i)}>{groups[i]}</button>)}
          {used.trips.map(i => <button key={i} className="chip" aria-pressed={filter === i} onClick={() => setFilter(i)}>{trips[i]}</button>)}
        </div>
      )}
      {rows && rows.length > 0 && <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search the diary" aria-label="Search the diary" />}
      <div className="vlist">
        {shown.map(e => (
          <div className="vrow" key={e.id}>
            <Link className="vmain" to={'/diary/' + e.id}>
              <span className="vtime">{e.entry_at ? fmtTime(e.entry_at) : '–'}<small>{fmtDate(e.entry_on).replace(/^[^,]+, /, '')}</small></span>
              <span className="vtx">
                <b>{e.title}{!e.shared && <em className="pv">Only me</em>}{e.shared && <em className="pv amt">Shared</em>}</b>
                <span>{[e.place, e.group_id ? groups[e.group_id] : '', e.itinerary_id ? trips[e.itinerary_id] : '', photos[e.id] ? `${photos[e.id]} photo${photos[e.id] === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}</span>
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
