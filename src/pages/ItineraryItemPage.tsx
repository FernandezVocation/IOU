import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { directionsUrl, hasRoute, kindLabel, mapUrl, websiteUrl, whenLabel } from '../lib/itinerary'
import CategoryIcon from '../components/CategoryIcon'
import { useArm, useToast } from '../components/ui'
import { useItinerary } from './ItineraryShell'
import { spendLabel } from '../lib/itinerarySpend'
import { fmtDate } from '../lib/format'
import { fmtMoney, toMinor } from '../lib/money'

export default function ItineraryItemPage() {
  const { iid = '' } = useParams()
  const { data, reload } = useItinerary()
  const nav = useNavigate()
  const toast = useToast()
  const arm = useArm()
  const [busy, setBusy] = useState(false)
  const [ticket, setTicket] = useState<{ id: string; vault_id: string; title: string } | null>(null)
  const it = data.items.find(i => i.id === iid)
  const vaultItemId = it?.vault_item_id ?? null

  // The linked vault item is looked up with the viewer's own access, so people who cannot see it get nothing back.
  useEffect(() => {
    setTicket(null)
    if (!vaultItemId) return
    let alive = true
    supabase.from('vault_items').select('id, vault_id, title').eq('id', vaultItemId).maybeSingle().then(({ data: d }) => { if (alive) setTicket((d as typeof ticket) ?? null) })
    return () => { alive = false }
  }, [vaultItemId])
  const home = data.itinerary
  const back = '/itinerary/' + home.id

  if (!it) return <div className="app"><div className="empty"><b>Item not found</b>It may have been removed, or it is private to someone else.</div><Link className="btn block" to={back}>Back to the itinerary</Link></div>

  const site = websiteUrl(it.website)
  const map = mapUrl(it), dir = directionsUrl(it)
  const when = whenLabel(it)
  const canChange = data.canChange(it)
  const route = hasRoute(it)

  async function remove() {
    if (!it) return
    setBusy(true)
    const { error } = await supabase.from('itinerary_items').delete().eq('id', it.id)
    if (error) { setBusy(false); toast(friendly(error)); return }
    await reload()
    toast('Removed.')
    nav(back, { replace: true })
  }

  return (
    <div className="app">
      <div className="top">
        <div>
          <Link className="backlink" to={back}>← {home.name}</Link>
          <div className="gh">
            <CategoryIcon category={it.category} size={44} />
            <div>
              <h1>{it.title}</h1>
              {it.description && <span className="vdesc big">{it.description}</span>}
              <div className="sub">{kindLabel(it)}{it.private ? ' · Only me' : ''}</div>
            </div>
          </div>
        </div>
        {canChange && <Link className="btn small" to={`${back}/item/${it.id}/edit`}>Edit</Link>}
      </div>

      {(map || dir || site) && (
        <div className="vlinks">
          {map && <a className="btn" href={map} target="_blank" rel="noopener noreferrer">Map</a>}
          {dir && <a className="btn" href={dir} target="_blank" rel="noopener noreferrer">Directions</a>}
          {site && <a className="btn" href={site} target="_blank" rel="noopener noreferrer">Website</a>}
        </div>
      )}
      {route && dir && <div className="muted small" style={{ marginTop: 6 }}>Directions shows the route from {it.from_place} to {it.to_place}.</div>}

      <div className="panel vfacts">
        {when && <div><span>{it.category === 'stay' ? 'Stay' : 'When'}</span><b>{when}<small> · local time at the place</small></b></div>}
        {it.from_place && <div><span>From</span><b>{it.from_place}</b></div>}
        {it.to_place && <div><span>To</span><b>{it.to_place}</b></div>}
        {it.place && <div><span>Place</span><b>{it.place}</b></div>}
        {it.address && <div><span>Address</span><b>{it.address}</b></div>}
        {it.vendor && <div><span>Vendor</span><b>{it.vendor}</b></div>}
        {site && <div><span>Website</span><b>{it.website}</b></div>}
        {it.people.length > 0 && <div><span>Who</span><b>{it.people.join(', ')}</b></div>}
        {it.notes && <div><span>Notes</span><b style={{ whiteSpace: 'pre-wrap' }}>{it.notes}</b></div>}
        <div><span>Added by</span><b>{data.people.find(p => p.user_id === it.created_by)?.name ?? 'Someone'}</b></div>
      </div>

      {data.spend && home.group_id && (() => {
        const sp = data.spend!.byItem[it.id]
        const qs = new URLSearchParams({ plan: it.id, vendor: it.title, ...(it.starts_on ? { date: it.starts_on } : {}), ...(it.starts_at ? { time: it.starts_at.slice(0, 5) } : {}) }).toString()
        return (
          <div className="panel" style={{ marginTop: 12 }}>
            <div className="muted small">Expenses for this item <span>· group members only</span></div>
            {sp ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 18, margin: '4px 0' }}>{spendLabel(sp, data.spend!.currency)}</div>
                {sp.expenses.map(e => (
                  <Link key={e.id} className="prow" to={`/g/${home.group_id}/expense/${e.id}`}>
                    <span style={{ flex: 1 }}>{e.vendor || 'Untitled'}<span className="muted small"> {fmtDate(e.spent_on)}{e.description ? ' · ' + e.description : ''}</span></span>
                    <b>{fmtMoney(toMinor(e.amount, e.currency), e.currency)}</b>
                  </Link>
                ))}
              </>
            ) : <div className="muted small" style={{ margin: '4px 0' }}>None linked yet.</div>}
            <Link className="btn block" style={{ marginTop: 8 }} to={`/g/${home.group_id}/expense/new?${qs}`}>Add expense</Link>
          </div>
        )
      })()}

      {ticket && (
        <div className="panel vlink" style={{ marginTop: 12 }}>
          <div className="muted small">Linked in the vault</div>
          <Link className="btn block" to={`/vault/${ticket.vault_id}/item/${ticket.id}`} style={{ marginTop: 6 }}>Open “{ticket.title}”</Link>
          <div className="muted small" style={{ marginTop: 6 }}>Only people who can see that vault item can open it. Everyone else sees these details.</div>
        </div>
      )}

      {canChange && (
        <button className={'btn danger block' + (arm.is('del') ? ' armed' : '')} style={{ marginTop: 18 }} disabled={busy} onClick={() => arm.is('del') ? remove() : arm.arm('del')}>
          {arm.is('del') ? 'Tap again to remove' : 'Remove from the itinerary'}
        </button>
      )}
    </div>
  )
}
