import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import GroupIcon from '../components/GroupIcon'
import TypeIcon from '../components/TypeIcon'
import { arrange, directionsUrl, filterItems, typeOf, TYPES, type Arrange, type ItemType, type VaultItem } from '../lib/vault'
import { fmtDate, fmtTime } from '../lib/format'
import { useVault } from './VaultShell'
import VaultSettings from '../components/VaultSettings'
import VaultShare from '../components/VaultShare'

const pinIcon = <svg className="i" viewBox="0 0 24 24" width="18" height="18"><path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>

function Row({ vid, it, by }: { vid: string; it: VaultItem; by: Arrange }) {
  const t = typeOf(it.type)
  const dir = directionsUrl(it)
  const shortDate = it.starts_on ? fmtDate(it.starts_on).replace(/^[^,]+, /, '') : ''
  const sub = [it.description, by === 'type' ? '' : t.label, by === 'place' ? '' : it.place, it.files.length ? `${it.files.length} file${it.files.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
  return (
    <div className="vrow">
      <Link className="vmain" to={`/vault/${vid}/item/${it.id}`}>
        <span className="vtime">{it.starts_at ? fmtTime(it.starts_at) : '–'}<small>{by === 'date' ? '' : shortDate}</small></span>
        <TypeIcon type={it.type} size={38} />
        <span className="vtx">
          <b>{it.title}{it.private && <em className="pv">Only me</em>}</b>
          <span>{sub}</span>
        </span>
      </Link>
      {dir && <a className="vgo" href={dir} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${it.title}`}>{pinIcon}</a>}
    </div>
  )
}

export default function VaultHome() {
  const { data } = useVault()
  const [by, setBy] = useState<Arrange>('date')
  const [type, setType] = useState<'all' | ItemType>('all')
  const [q, setQ] = useState('')
  const [sheet, setSheet] = useState<null | 'settings' | 'share'>(null)
  const v = data.vault

  const present = useMemo(() => TYPES.filter(t => data.items.some(i => i.type === t.id)), [data.items])
  const sections = useMemo(() => arrange(filterItems(data.items, type, q), by), [data.items, type, q, by])

  return (
    <>
      <div className="app">
        <div className="top">
          <div>
            <Link className="backlink" to="/vaults">← Your vaults</Link>
            {v.group_id && <Link className="backlink" to={'/g/' + v.group_id} style={{ marginLeft: 12 }}>Group</Link>}
            <div className="gh">
              <GroupIcon group={{ kind: 'Vault', icon: v.icon, color: v.color }} size={44} />
              <div>
                <h1>{v.name}</h1>
                <div className="sub">{data.items.length} {data.items.length === 1 ? 'item' : 'items'} · times are local to each place</div>
              </div>
            </div>
          </div>
          <div className="vtools">
            {data.isAdmin && <button className="btn small" onClick={() => setSheet('share')} aria-label="Read-only links">Share</button>}
            <button className="btn small" onClick={() => setSheet('settings')} aria-label="Vault settings">People</button>
          </div>
        </div>

        <div className="seg" role="group" aria-label="Arrange by">
          {([['date', 'Date'], ['place', 'Places'], ['type', 'Type']] as Array<[Arrange, string]>).map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}
        </div>
        {present.length > 1 && (
          <div className="chips" role="group" aria-label="Filter by type">
            <button className="chip" aria-pressed={type === 'all'} onClick={() => setType('all')}>All</button>
            {present.map(t => <button key={t.id} className="chip" aria-pressed={type === t.id} onClick={() => setType(t.id)}>{t.plural}</button>)}
          </div>
        )}
        {data.items.length > 4 && <input type="search" className="inp" placeholder="Search title, place, notes" value={q} onChange={e => setQ(e.target.value)} aria-label="Search the vault" style={{ marginTop: 10 }} />}

        {data.items.length === 0 && <div className="empty"><b>Nothing here yet</b>Add a ticket, reservation, pass or document. Photos and PDFs are kept with each item.</div>}
        {data.items.length > 0 && sections.length === 0 && <div className="empty"><b>Nothing matches</b>Try a different filter.</div>}

        {sections.map(s => (
          <section key={s.key} className="vsec" aria-label={s.label}>
            <h2 className="vday">{s.label}{s.sub && by === 'date' && <span>{s.sub}</span>}</h2>
            {s.items.map(it => <Row key={it.id} vid={v.id} it={it} by={by} />)}
          </section>
        ))}
      </div>
      <Link className="fab" to={`/vault/${v.id}/item/new`} aria-label="Add to the vault"><svg className="i" viewBox="0 0 24 24" style={{ stroke: 'currentColor', width: 26, height: 26 }}><path d="M12 5v14M5 12h14" /></svg></Link>
      {sheet === 'settings' && <VaultSettings onClose={() => setSheet(null)} />}
      {sheet === 'share' && <VaultShare onClose={() => setSheet(null)} />}
    </>
  )
}
