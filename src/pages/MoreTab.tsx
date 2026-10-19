import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { linkedVaultFor } from '../lib/useVault'
import { itinerariesFor } from '../lib/useItinerary'
import ThemeToggle from '../components/ThemeToggle'
import { useGroup } from './GroupShell'

/** Everything that doesn't need its own tab on a phone. */
export default function MoreTab() {
  const { data } = useGroup()
  const base = '/g/' + data.group.id
  const [vaultId, setVaultId] = useState<string | null>(null)
  useEffect(() => { let alive = true; linkedVaultFor(data.group.id).then(v => { if (alive) setVaultId(v?.id ?? null) }).catch(() => { /* none */ }); return () => { alive = false } }, [data.group.id])
  const [trips, setTrips] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => { let alive = true; itinerariesFor(data.group.id).then(l => { if (alive) setTrips(l) }).catch(() => { /* none */ }); return () => { alive = false } }, [data.group.id])
  return (
    <div>
      <div className="sect" style={{ marginTop: 6 }}>
        <Link className="moreitem" to={base + '/reports'}><span><b>Reports and invoices</b><span className="sub">Excel and PDF reports, itemized invoices</span></span><span aria-hidden>›</span></Link>
        <Link className="moreitem" to={base + '/settings'}><span><b>Group settings</b><span className="sub">People, invite link, balance links, currency, rates</span></span><span aria-hidden>›</span></Link>
        {vaultId
          ? <Link className="moreitem" to={'/vault/' + vaultId}><span><b>Vault</b><span className="sub">Tickets, passes, reservations and documents</span></span><span aria-hidden>›</span></Link>
          : data.isOwner && <Link className="moreitem" to={'/vaults/new?group=' + data.group.id}><span><b>Create a vault for this group</b><span className="sub">Keep tickets, passes and reservations with the group</span></span><span aria-hidden>›</span></Link>}
        {trips.map(t => <Link key={t.id} className="moreitem" to={'/itinerary/' + t.id}><span><b>Itinerary: {t.name}</b><span className="sub">Flights, stays, meals and plans, day by day</span></span><span aria-hidden>›</span></Link>)}
        {data.isOwner && <Link className="moreitem" to={'/itineraries/new?group=' + data.group.id}><span><b>{trips.length ? 'Add another itinerary' : 'Create an itinerary for this group'}</b><span className="sub">Plan the days and link tickets from the vault</span></span><span aria-hidden>›</span></Link>}
        <Link className="moreitem" to="/overview"><span><b>Overview across groups</b><span className="sub">Who owes what in all your groups</span></span><span aria-hidden>›</span></Link>
      </div>
      <ThemeToggle />
    </div>
  )
}
