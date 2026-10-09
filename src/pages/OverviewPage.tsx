import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fetchAllGroups, type AllGroups } from '../lib/allGroups'
import { buildOverview, totalsByCurrency, type Person } from '../lib/overview'
import { buildOverviewBreakdown, type Metric } from '../lib/breakdown'
import BreakdownList, { CategoryBar } from '../components/BreakdownList'
import { buildOverviewPdf } from '../lib/overviewPdf'
import { downloadBlob } from '../lib/exporters'
import { fmtMoney } from '../lib/money'
import { fmtDate, friendly, slug, todayStr } from '../lib/format'
import { Sheet, Spinner, useToast } from '../components/ui'
import TopNav from '../components/TopNav'
import RecordAcrossSheet from '../components/RecordAcrossSheet'
import PeopleSheet from '../components/PeopleSheet'

/** All your groups at once: what each person owes you, or you owe them, per currency. */
export default function OverviewPage() {
  const { user, displayName } = useAuth()
  const toast = useToast()
  const uid = user?.id ?? ''
  const [all, setAll] = useState<AllGroups | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [includeEst, setIncludeEst] = useState(true)
  const [selected, setSelected] = useState<Set<string> | null>(null)   // null = every trip
  const [personKey, setPersonKey] = useState<string | null>(null)
  const [record, setRecord] = useState<Person | null>(null)
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<'balances' | 'spending'>('balances')
  const [metric, setMetric] = useState<Metric>('total')

  const load = useCallback(async () => {
    try { setAll(await fetchAllGroups(uid)); setError(null) } catch (e) { setError(friendly(e)) }
  }, [uid])
  useEffect(() => {
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const trips = useMemo(() => (all?.groups ?? []).filter(g => g.me), [all])
  const people = useMemo(
    () => (all ? buildOverview({ groups: all.groups, userId: uid, contacts: all.contacts, mappings: all.mappings, includeEstimates: includeEst, groupIds: selected }) : []),
    [all, uid, includeEst, selected],
  )
  const totals = totalsByCurrency(people)
  const spending = useMemo(
    () => buildOverviewBreakdown(trips.filter(g => selected === null || selected.has(g.group.id)), metric),
    [trips, selected, metric],
  )
  const included = (id: string) => selected === null || selected.has(id)
  // From "All groups", tapping a trip focuses on just that trip; further taps add or remove trips.
  const toggleTrip = (id: string) => {
    if (selected === null) { setSelected(new Set([id])); return }
    const cur = new Set(selected)
    if (cur.has(id)) cur.delete(id); else cur.add(id)
    setSelected(cur.size === 0 || cur.size === trips.length ? null : cur)
  }
  const tripNames = trips.filter(t => included(t.group.id)).map(t => t.group.name)
  const open = people.find(p => p.key === personKey) ?? null

  async function pdf(list: Person[], title?: string, name = 'overview') {
    setBusy(true)
    try { downloadBlob(await buildOverviewPdf({ people: list, preparedBy: displayName, tripNames, includeEstimates: includeEst, title }), `balances-${slug(name)}-${todayStr()}.pdf`) }
    catch (e) { toast(friendly(e)) } finally { setBusy(false) }
  }

  return (
    <>
      <div className="app">
        <div className="top"><div><h1>Overview</h1><div className="sub">Balances across your groups</div></div><button className="btn small" onClick={load}>Refresh</button></div>
        {error && <div className="notice err" role="alert">{error}</div>}
        {!all && !error && <Spinner />}
        {all && !trips.length && <div className="empty"><b>No groups yet</b>Once you’re in a group, balances with the people you share costs with show up here.</div>}
        {all && trips.length > 0 && (
          <>
            <div className="panel">
              <div className="muted small" style={{ marginBottom: 6 }}>Groups included</div>
              <div className="chips" style={{ margin: 0 }}>
                <button className="chip" aria-pressed={selected === null} onClick={() => setSelected(null)}>All groups ({trips.length})</button>
                {trips.map(t => <button key={t.group.id} className="chip" aria-pressed={included(t.group.id) && selected !== null} onClick={() => toggleTrip(t.group.id)}>{t.group.name}</button>)}
              </div>
              <label className="switch" style={{ marginTop: 6 }}><input type="checkbox" checked={includeEst} onChange={e => setIncludeEst(e.target.checked)} /><span>Include estimated amounts</span></label>
            </div>

            <div className="seg" role="group" aria-label="What to show" style={{ marginBottom: 12 }}>
              <button aria-pressed={view === 'balances'} onClick={() => setView('balances')}>Balances</button>
              <button aria-pressed={view === 'spending'} onClick={() => setView('spending')}>Spending by category</button>
            </div>

            {view === 'spending' && (
              <>
                <div className="seg" role="group" aria-label="Amounts" style={{ marginBottom: 6 }}>
                  <button aria-pressed={metric === 'total'} onClick={() => setMetric('total')}>Total spent</button>
                  <button aria-pressed={metric === 'mine'} onClick={() => setMetric('mine')}>My share</button>
                </div>
                {!spending.length && <div className="empty"><b>Nothing to show</b>No expenses{metric === 'mine' ? ' include you' : ''} in these groups yet.</div>}
                {spending.map(c => (
                  <div key={c.currency}>
                    <div className="panel">
                      <div className="muted small">{c.currency} · {c.groupCount} group{c.groupCount === 1 ? '' : 's'}</div>
                      <div style={{ font: '700 30px/1.1 var(--display)' }}>{fmtMoney(c.total, c.currency)}</div>
                      <CategoryBar cats={c.cats} total={c.total} />
                    </div>
                    <div className="panel" style={{ paddingBlock: 4 }}><BreakdownList key={c.currency + metric} rows={c.rows} total={c.total} currency={c.currency} swatch /></div>
                  </div>
                ))}
                {spending.length > 1 && <div className="muted small">Each currency is added up on its own. Nothing is converted.</div>}
              </>
            )}

            {view === 'balances' && totals.length > 0 && (
              <div className="panel">
                {totals.map(t => (
                  <div key={t.currency} className="ln" style={{ borderTop: 0 }}>
                    <span><b>{t.currency}</b><br /><span className="muted small">owed to you {fmtMoney(t.owedToMe, t.currency)} · you owe {fmtMoney(t.iOwe, t.currency)}</span></span>
                    <span className={'a ' + (t.net >= 0 ? 'pos-t' : 'neg-t')}><b>{t.net >= 0 ? '+' : '−'}{fmtMoney(Math.abs(t.net), t.currency)}</b></span>
                  </div>
                ))}
              </div>
            )}

            {view === 'balances' && <div className="row2" style={{ margin: '4px 0 10px' }}>
              <button className="btn primary" disabled={busy || !people.length} onClick={() => pdf(people)}>{busy ? 'Building…' : 'Export PDF'}</button>
              <button className="btn" onClick={() => setPeopleOpen(true)}>People</button>
            </div>}

            {view === 'balances' && !people.length && <div className="empty"><b>All square</b>Nobody owes you, and you owe nobody, across these groups.</div>}
            {view === 'balances' && people.map(p => (
              <button className="panel exp" style={{ display: 'block', width: '100%', textAlign: 'left' }} key={p.key} onClick={() => setPersonKey(p.key)}>
                <div className="phead" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><b style={{ fontSize: 17 }}>{p.name}</b>{p.hasPending && <span className="tag pending">Pending</span>}</div>
                {p.currencies.map(c => (
                  <div key={c.currency} className={c.net > 0 ? 'pos-t' : c.net < 0 ? 'neg-t' : 'muted'} style={{ fontWeight: 600 }}>
                    {c.net > 0 ? `owes you ${fmtMoney(c.net, c.currency)}` : c.net < 0 ? `you owe ${fmtMoney(-c.net, c.currency)}` : `${c.currency} settled`}
                  </div>
                ))}
                <div className="muted small" style={{ marginTop: 2 }}>{p.tripNames.join(' · ')}</div>
              </button>
            ))}
          </>
        )}
      </div>
      <TopNav />

      {open && !record && (
        <Sheet title={open.name} onClose={() => setPersonKey(null)}>
          {open.currencies.map(c => (
            <div className="panel" key={c.currency}>
              <div className="muted small" style={{ fontWeight: 600 }}>{c.currency}</div>
              <div style={{ font: '700 24px var(--display)' }} className={c.net > 0 ? 'pos-t' : c.net < 0 ? 'neg-t' : ''}>
                {c.net > 0 ? `${open.name} owes you ${fmtMoney(c.net, c.currency)}` : c.net < 0 ? `You owe ${open.name} ${fmtMoney(-c.net, c.currency)}` : 'Settled'}
              </div>
              {c.trips.map(t => (
                <details className="pair" key={t.groupId + t.theirId} style={{ marginTop: 10 }}>
                  <summary><span>{t.groupName}{t.estimated && <> <span className="tag">est.</span></>}</span><span className={t.net >= 0 ? 'pos-t' : 'neg-t'}>{t.net >= 0 ? '+' : '−'}{fmtMoney(Math.abs(t.net), c.currency)}</span></summary>
                  <div className="why">
                    {t.rows.map((r, i) => <div className="ln" key={i}><span>{r.text}<br /><span className="muted small">{fmtDate(r.date)}</span></span><span className={'a ' + (r.amount >= 0 ? '' : 'neg-t')}>{r.amount >= 0 ? '+' : '−'}{fmtMoney(Math.abs(r.amount), c.currency)}</span></div>)}
                    {t.pendingToMe > 0 && <div className="small" style={{ color: 'var(--est)', marginTop: 6 }}>{fmtMoney(t.pendingToMe, c.currency)} paid to you is waiting for your confirmation.</div>}
                    {t.pendingFromMe > 0 && <div className="small" style={{ color: 'var(--est)', marginTop: 6 }}>{fmtMoney(t.pendingFromMe, c.currency)} you paid is waiting for {open.name} to confirm.</div>}
                    <div className="pay"><Link className="btn small" to={`/g/${t.groupId}/balances`}>Open group</Link></div>
                  </div>
                </details>
              ))}
            </div>
          ))}
          <button className="btn primary block" onClick={() => setRecord(open)}>Record a payment</button>
          <button className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={() => pdf([open], 'BALANCE STATEMENT', open.name)}>{busy ? 'Building…' : `Export PDF for ${open.name}`}</button>
        </Sheet>
      )}
      {record && <RecordAcrossSheet person={record} onClose={() => setRecord(null)} onSaved={load} />}
      {peopleOpen && all && <PeopleSheet all={all} userId={uid} onClose={() => setPeopleOpen(false)} onChanged={load} />}
    </>
  )
}
