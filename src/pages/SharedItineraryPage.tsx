import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import GroupIcon from '../components/GroupIcon'
import { buildIconMap } from '../lib/itineraryIcons'
import CategoryIcon from '../components/CategoryIcon'
import { Spinner, ToastProvider } from '../components/ui'
import { friendly } from '../lib/format'
import { fetchSharedItinerary, type SharedItinerary } from '../lib/sharedItinerary'
import { arrange, directionsUrl, kindLabel, mapUrl, placeOf, websiteUrl, whenLabel, type ItineraryItem, type SharedItineraryItem } from '../lib/itinerary'

type State = { s: 'loading' } | { s: 'invalid' } | { s: 'error'; msg: string } | { s: 'ok'; v: SharedItinerary }

/** Public, read-only page behind a secret link. No sign-in, no editing. */
export default function SharedItineraryPage() {
  return <ToastProvider><Inner /></ToastProvider>
}

const asItem = (i: SharedItineraryItem): ItineraryItem => ({ ...i, itinerary_id: 'shared', private: false, vault_item_id: null, created_by: '' })

function Inner() {
  const { token = '' } = useParams()
  const [state, setState] = useState<State>({ s: 'loading' })
  const [open, setOpen] = useState<SharedItineraryItem | null>(null)

  const load = useCallback(async () => {
    try {
      const v = await fetchSharedItinerary(token)
      setState(v ? { s: 'ok', v } : { s: 'invalid' })
    } catch (e) { setState({ s: 'error', msg: friendly(e) }) }
  }, [token])

  useEffect(() => {
    load()
    const meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex,nofollow'; document.head.appendChild(meta)
    return () => meta.remove()
  }, [load])

  const icons = useMemo(() => buildIconMap(state.s === 'ok' ? (state.v.icons ?? []) : []), [state])
  const sections = useMemo(() => state.s === 'ok' ? arrange(state.v.items.map(asItem), 'date') : [], [state])

  if (state.s === 'loading') return <Spinner />
  if (state.s === 'invalid') return (
    <div className="auth"><h1>Link not available</h1><p className="muted">This link isn’t valid any more. It may have been turned off. Ask the person who shared it for a fresh one.</p></div>
  )
  if (state.s === 'error') return <div className="auth"><div className="notice err" role="alert">{state.msg}</div><button className="btn" onClick={load}>Try again</button></div>

  const v = state.v

  return (
    <div className="app">
      <div className="top">
        <div>
          <div className="gh">
            <GroupIcon group={{ kind: 'Itinerary', icon: v.itinerary.icon, color: v.itinerary.color }} size={44} />
            <div><h1>{v.itinerary.name}</h1><div className="sub">Read-only · shared with {v.label} · times are local to each place</div></div>
          </div>
        </div>
      </div>
      <div className="notice">Read-only link: plans only. Tickets, photos and QR codes aren’t included, so ask the owner to send those directly.</div>
      {v.items.length === 0 && <div className="empty"><b>Nothing shared yet</b></div>}
      {sections.map(s => (
        <section key={s.key} className="vsec" aria-label={s.label}>
          <h2 className="vday">{s.label}{s.sub && <span>{s.sub}</span>}</h2>
          {s.items.map(it => {
            const full = v.items.find(x => x.id === it.id)!
            const route = it.from_place && it.to_place ? `${it.from_place} → ${it.to_place}` : ''
            return (
              <button key={it.id} className="vrow vbtn" onClick={() => setOpen(full)}>
                <span className="vtime">{it.starts_at ? whenLabel({ starts_on: null, starts_at: it.starts_at, ends_on: null, ends_at: null }) : '–'}</span>
                <CategoryIcon category={it.category} categoryLabel={it.category_label} subtype={it.subtype} icons={icons} size={38} />
                <span className="vtx"><b>{it.title}{full.has_ticket && <span className="tkt" aria-label="Has a ticket"><svg className="i" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z" /></svg></span>}</b><span>{[kindLabel(it), route || placeOf(it)].filter(Boolean).join(' · ')}</span></span>
                {it.description && <span className="vdesc" title={it.description}>{it.description}</span>}
              </button>
            )
          })}
        </section>
      ))}

      {open && (() => {
        const it = asItem(open), site = websiteUrl(open.website), map = mapUrl(it), dir = directionsUrl(it)
        return (
          <div className="sheet" role="dialog" aria-modal="true" aria-label={open.title}>
            <div className="in">
              <header><span /><h2>{open.title}</h2><button className="btn small" onClick={() => setOpen(null)}>Close</button></header>
              {open.description && <span className="vdesc big">{open.description}</span>}
              <div className="sub">{kindLabel(open)}{whenLabel(open) ? ` · ${whenLabel(open)}` : ''}</div>
              {(map || dir || site) && <div className="vlinks">
                {map && <a className="btn" href={map} target="_blank" rel="noopener noreferrer">Map</a>}
                {dir && <a className="btn" href={dir} target="_blank" rel="noopener noreferrer">Directions</a>}
                {site && <a className="btn" href={site} target="_blank" rel="noopener noreferrer">Website</a>}
              </div>}
              <div className="panel vfacts">
                {open.from_place && <div><span>From</span><b>{open.from_place}</b></div>}
                {open.to_place && <div><span>To</span><b>{open.to_place}</b></div>}
                {open.place && <div><span>Place</span><b>{open.place}</b></div>}
                {open.address && <div><span>Address</span><b>{open.address}</b></div>}
                {open.vendor && <div><span>Vendor</span><b>{open.vendor}</b></div>}
                {open.people.length > 0 && <div><span>Who</span><b>{open.people.join(', ')}</b></div>}
                {v.include_notes && open.notes && <div><span>Notes</span><b style={{ whiteSpace: 'pre-wrap' }}>{open.notes}</b></div>}
              </div>
              {open.has_ticket && <div className="muted small" style={{ marginTop: 8 }}>A ticket is saved for this in the vault. Tickets aren’t shown on read-only links.</div>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
