import { useMemo, useState } from 'react'
import { spendLabel, type ItemSpend } from '../lib/itinerarySpend'
import { Link } from 'react-router-dom'
import GroupIcon from '../components/GroupIcon'
import CategoryIcon from '../components/CategoryIcon'
import { arrange, CATEGORIES, directionsUrl, filterItems, kindLabel, NO_FILTERS, peopleIn, placeOf, type Arrange, type Filters, type ItineraryItem } from '../lib/itinerary'
import { fmtDate, fmtTime } from '../lib/format'
import { useItinerary } from './ItineraryShell'
import ItinerarySettings from '../components/ItinerarySettings'
import ItineraryShare from '../components/ItineraryShare'
import ItineraryExport from '../components/ItineraryExport'

const pinIcon = <svg className="i" viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
const ticketIcon = <svg className="i" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 0 0-4V6H3z" /></svg>

function Row({ iid, it, by, cost }: { iid: string; it: ItineraryItem; by: Arrange; cost?: string }) {
  const dir = directionsUrl(it)
  const shortDate = it.starts_on ? fmtDate(it.starts_on).replace(/^[^,]+, /, '') : ''
  const route = it.from_place && it.to_place ? `${it.from_place} → ${it.to_place}` : ''
  const sub = [it.description, by === 'type' ? '' : kindLabel(it), by === 'place' ? '' : route || placeOf(it), it.people.length ? it.people.join(', ') : ''].filter(Boolean).join(' · ')
  return (
    <div className="vrow">
      <Link className="vmain" to={`/itinerary/${iid}/item/${it.id}`}>
        <span className="vtime">{it.starts_at ? fmtTime(it.starts_at) : '–'}<small>{by === 'date' ? '' : shortDate}</small></span>
        <CategoryIcon category={it.category} size={38} />
        <span className="vtx">
          <b>{it.title}{it.vault_item_id && <span className="tkt" title="Has a vault ticket" aria-label="Has a vault ticket">{ticketIcon}</span>}{it.private && <em className="pv">Only me</em>}{cost && <em className="pv amt">{cost}</em>}</b>
          <span>{sub}</span>
        </span>
      </Link>
      {dir && <a className="vgo" href={dir} target="_blank" rel="noopener noreferrer" aria-label={`Directions for ${it.title}`}>{pinIcon}</a>}
    </div>
  )
}

export default function ItineraryHome() {
  const { data } = useItinerary()
  const [by, setBy] = useState<Arrange>('date')
  const [f, setF] = useState<Filters>(NO_FILTERS)
  const [amounts, setAmounts] = useState(() => { try { return localStorage.getItem('iou.itinAmounts') === '1' } catch { return false } })
  const [sheet, setSheet] = useState<null | 'settings' | 'share' | 'export'>(null)
  const it = data.itinerary

  const present = useMemo(() => CATEGORIES.filter(c => data.items.some(i => i.category === c.id)), [data.items])
  const names = useMemo(() => peopleIn(data.items), [data.items])
  const spend = data.spend
  const anySpend = !!spend && Object.keys(spend.byItem).length > 0
  const costOf = (id: string) => { const x: ItemSpend | undefined = spend?.byItem[id]; return amounts && x && spend ? spendLabel(x, spend.currency) : undefined }
  function toggleAmounts() { const n = !amounts; setAmounts(n); try { localStorage.setItem('iou.itinAmounts', n ? '1' : '0') } catch { /* storage unavailable */ } }
  const sections = useMemo(() => arrange(filterItems(data.items, f), by), [data.items, f, by])

  return (
    <>
      <div className="app">
        <div className="top">
          <div>
            <Link className="backlink" to="/itineraries">← Your itineraries</Link>
            {it.group_id && <Link className="backlink" to={'/g/' + it.group_id} style={{ marginLeft: 12 }}>{data.groupName ?? 'Group'}</Link>}
            {it.vault_id && data.vaultName && <Link className="backlink" to={'/vault/' + it.vault_id} style={{ marginLeft: 12 }}>{data.vaultName}</Link>}
            <div className="gh">
              <GroupIcon group={{ kind: 'Itinerary', icon: it.icon, color: it.color }} size={44} />
              <div>
                <h1>{it.name}</h1>
                <div className="sub">{data.items.length} {data.items.length === 1 ? 'item' : 'items'} · times are local to each place</div>
              </div>
            </div>
          </div>
          <div className="vtools">
            <button className="btn small" onClick={() => setSheet('export')} aria-label="Export the plan">Export</button>
            {data.isAdmin && <button className="btn small" onClick={() => setSheet('share')} aria-label="Read-only links">Share</button>}
            <button className="btn small" onClick={() => setSheet('settings')} aria-label="Itinerary settings">People</button>
          </div>
        </div>

        <div className="seg" role="group" aria-label="Arrange by">
          {([['date', 'Date'], ['place', 'Places'], ['type', 'Type']] as Array<[Arrange, string]>).map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}
        </div>
        {anySpend && (
          <label className="radio" style={{ marginTop: 10 }}><input type="checkbox" checked={amounts} onChange={toggleAmounts} />Show what each item cost<span className="muted small"> · group members only</span></label>
        )}
        {present.length > 1 && (
          <div className="chips" role="group" aria-label="Filter by category">
            <button className="chip" aria-pressed={f.category === 'all'} onClick={() => setF({ ...f, category: 'all' })}>All</button>
            {present.map(c => <button key={c.id} className="chip" aria-pressed={f.category === c.id} onClick={() => setF({ ...f, category: c.id })}>{c.plural}</button>)}
          </div>
        )}
        {names.length > 1 && (
          <div className="chips" role="group" aria-label="Filter by person">
            <button className="chip" aria-pressed={f.person === ''} onClick={() => setF({ ...f, person: '' })}>Everyone</button>
            {names.map(n => <button key={n} className="chip" aria-pressed={f.person === n} onClick={() => setF({ ...f, person: f.person === n ? '' : n })}>{n}</button>)}
          </div>
        )}
        {data.items.length > 4 && <input type="search" className="inp" placeholder="Search title, place, vendor, notes" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} aria-label="Search the itinerary" style={{ marginTop: 10 }} />}

        {data.items.length === 0 && <div className="empty"><b>Nothing planned yet</b>Add a flight, a stay, a dinner or anything else. Everything has a date, a time and a place, and you can link a ticket from the vault.</div>}
        {data.items.length > 0 && sections.length === 0 && <div className="empty"><b>Nothing matches</b>Try a different filter.</div>}

        {sections.map(s => (
          <section key={s.key} className="vsec" aria-label={s.label}>
            <h2 className="vday">{s.label}{s.sub && by === 'date' && <span>{s.sub}</span>}</h2>
            {s.items.map(x => <Row key={x.id} iid={it.id} it={x} by={by} cost={costOf(x.id)} />)}
          </section>
        ))}
      </div>
      <Link className="fab" to={`/itinerary/${it.id}/item/new`} aria-label="Add to the itinerary"><svg className="i" viewBox="0 0 24 24" style={{ stroke: 'currentColor', width: 26, height: 26 }}><path d="M12 5v14M5 12h14" /></svg></Link>
      {sheet === 'settings' && <ItinerarySettings onClose={() => setSheet(null)} />}
      {sheet === 'export' && <ItineraryExport onClose={() => setSheet(null)} />}
      {sheet === 'share' && <ItineraryShare onClose={() => setSheet(null)} />}
    </>
  )
}
