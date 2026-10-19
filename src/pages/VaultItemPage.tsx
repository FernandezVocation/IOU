import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { directionsUrl, mapUrl, typeOf, websiteUrl, whenLabel } from '../lib/vault'
import TypeIcon from '../components/TypeIcon'
import QrView from '../components/QrView'
import { useArm, useToast } from '../components/ui'
import AddToItinerary from '../components/AddToItinerary'
import AddAsExpense from '../components/AddAsExpense'
import { useVault } from './VaultShell'

export default function VaultItemPage() {
  const { iid = '' } = useParams()
  const { data, reload } = useVault()
  const nav = useNavigate()
  const toast = useToast()
  const arm = useArm()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [full, setFull] = useState(false)
  const [busy, setBusy] = useState(false)
  const [addIt, setAddIt] = useState(false)
  const [addEx, setAddEx] = useState(false)
  const it = data.items.find(i => i.id === iid)
  const v = data.vault
  const back = '/vault/' + v.id

  const pathKey = it?.files.map(f => f.path).join('|') ?? ''
  useEffect(() => {
    if (!it?.files.length) return
    let alive = true
    supabase.storage.from('vault').createSignedUrls(it.files.map(f => f.path), 3600).then(({ data: d }) => {
      if (alive && d) setUrls(Object.fromEntries(d.filter(x => x.path && x.signedUrl).map(x => [x.path as string, x.signedUrl as string])))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey])

  const images = useMemo(() => (it?.files ?? []).filter(f => urls[f.path]).map(f => ({ url: urls[f.path], label: f.label || f.name, mime: f.mime })), [it, urls])

  if (!it) return <div className="app"><div className="empty"><b>Item not found</b>It may have been removed, or it is private to someone else.</div><Link className="btn block" to={back}>Back to the vault</Link></div>

  const t = typeOf(it.type)
  const site = websiteUrl(it.website)
  const map = mapUrl(it), dir = directionsUrl(it)
  const when = whenLabel(it)
  const canChange = data.canChange(it)
  const gid = v.group_id

  async function remove() {
    if (!it) return
    setBusy(true)
    const paths = it.files.map(f => f.path)
    const { error } = await supabase.from('vault_items').delete().eq('id', it.id)
    if (error) { setBusy(false); toast(friendly(error)); return }
    if (paths.length) await supabase.storage.from('vault').remove(paths)
    await reload()
    toast('Removed.')
    nav(back, { replace: true })
  }

  const expenseQs = new URLSearchParams({ item: it.id, vendor: it.title, ...(it.booking_ref ? { ref: it.booking_ref } : {}), ...((it.description || it.place) ? { description: it.description || it.place } : {}), ...(it.starts_on ? { date: it.starts_on } : {}), ...(it.starts_at ? { time: it.starts_at.slice(0, 5) } : {}) }).toString()

  return (
    <div className="app">
      <div className="top">
        <div>
          <Link className="backlink" to={back}>← {v.name}</Link>
          <div className="gh">
            <TypeIcon type={it.type} size={44} />
            <div>
              <h1>{it.title}</h1>
              {it.description && <div style={{ fontWeight: 600, marginTop: 2 }}>{it.description}</div>}
              <div className="sub">{t.label}{when ? ` · ${when}` : ''}{it.private ? ' · Only me' : ''}</div>
            </div>
          </div>
        </div>
        {canChange && <Link className="btn small" to={`${back}/item/${it.id}/edit`}>Edit</Link>}
      </div>

      {images.length > 0 && <button className="btn primary block" onClick={() => setFull(true)}>Show {images.length > 1 ? 'codes' : 'ticket or code'} full screen</button>}
      {it.files.length > 0 && images.length === 0 && <div className="muted small">Loading files…</div>}

      {(map || dir || site) && (
        <div className="vlinks">
          {map && <a className="btn" href={map} target="_blank" rel="noopener noreferrer">Map</a>}
          {dir && <a className="btn" href={dir} target="_blank" rel="noopener noreferrer">Directions</a>}
          {site && <a className="btn" href={site} target="_blank" rel="noopener noreferrer">Website</a>}
        </div>
      )}
      <div className="vlinks" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={() => setAddIt(true)}>Add to itinerary</button>
        {gid && !it.private && <Link className="btn" to={`/g/${gid}/expense/new?${expenseQs}`}>Add as expense</Link>}
        {v.personal && <button type="button" className="btn" onClick={() => setAddEx(true)}>Add as expense</button>}
      </div>

      <div className="panel vfacts">
        {when && <div><span>When</span><b>{when}<small> · local time at the place</small></b></div>}
        {it.booking_ref && <div><span>Booking code</span><b>{it.booking_ref}</b></div>}
        {it.place && <div><span>Place</span><b>{it.place}</b></div>}
        {it.address && <div><span>Address</span><b>{it.address}</b></div>}
        {site && <div><span>Website</span><b>{it.website}</b></div>}
        {it.notes && <div><span>Notes</span><b style={{ whiteSpace: 'pre-wrap' }}>{it.notes}</b></div>}
        <div><span>Added by</span><b>{data.people.find(p => p.user_id === it.created_by)?.name ?? 'Someone'}</b></div>
      </div>

      {it.files.length > 0 && (
        <div className="sect">
          <h2>Files</h2>
          <div className="vfiles">
            {it.files.map(f => {
              const u = urls[f.path]
              return (
                <div key={f.id} className="vfile">
                  {u && f.mime.startsWith('image/') ? <a href={u} target="_blank" rel="noopener noreferrer"><img src={u} alt={f.label || f.name || 'Attached file'} /></a>
                    : u ? <a className="btn" href={u} target="_blank" rel="noopener noreferrer">Open {f.name || 'PDF'}</a> : <span className="muted small">Loading…</span>}
                  {f.label && <span className="muted small">{f.label}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {canChange && (
        <button className={'btn danger block' + (arm.is('del') ? ' armed' : '')} style={{ marginTop: 18 }} disabled={busy} onClick={() => arm.is('del') ? remove() : arm.arm('del')}>
          {arm.is('del') ? 'Tap again to remove' : 'Remove from the vault'}
        </button>
      )}
      {addEx && <AddAsExpense query={expenseQs} title={it.title} onClose={() => setAddEx(false)} />}
      {addIt && <AddToItinerary item={it} onClose={() => setAddIt(false)} />}
      {full && <QrView title={it.title} when={when} images={images} onClose={() => setFull(false)} />}
    </div>
  )
}
