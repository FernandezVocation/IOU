import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendly } from '../lib/format'
import { CATEGORIES, canonPeople, categoryOf, customNames, type Category } from '../lib/itinerary'
import { useToast } from '../components/ui'
import { useItinerary } from './ItineraryShell'

const strOrNull = (s: string) => (s.trim() ? s.trim() : null)
const LS = 'iou.customCategories'
function remembered(): string[] { try { const v = JSON.parse(localStorage.getItem(LS) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [] } catch { return [] } }
function remember(name: string) { try { localStorage.setItem(LS, JSON.stringify([...new Set([name, ...remembered()])].slice(0, 30))) } catch { /* storage unavailable: the names still come from this itinerary's items */ } }

interface VI { id: string; title: string; type: string; vault_id: string }

export default function ItineraryItemEditor() {
  const { iid = '' } = useParams()
  const [sp] = useSearchParams()
  const { data, reload } = useItinerary()
  const nav = useNavigate()
  const toast = useToast()
  const home = data.itinerary
  const existing = !iid ? undefined : data.items.find(i => i.id === iid)
  const back = '/itinerary/' + home.id
  const pre = (k: string) => (existing ? '' : sp.get(k) ?? '')
  const fromVault = !existing ? sp.get('from') : null

  const cat0 = (existing?.category ?? (CATEGORIES.some(c => c.id === sp.get('category')) ? sp.get('category') : 'transport')) as Category
  const [category, setCategory] = useState<Category>(cat0)
  const [catLabel, setCatLabel] = useState(existing?.category_label ?? pre('category_label'))
  const [subtype, setSubtype] = useState(existing?.subtype ?? pre('subtype'))
  const [title, setTitle] = useState(existing?.title ?? pre('title'))
  const [description, setDescription] = useState(existing?.description ?? pre('description'))
  const [vendor, setVendor] = useState(existing?.vendor ?? pre('vendor'))
  const [bookingRef, setBookingRef] = useState(existing?.booking_ref ?? pre('ref'))
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? pre('date'))
  const [startsAt, setStartsAt] = useState((existing?.starts_at ?? pre('time')).slice(0, 5))
  const [endsOn, setEndsOn] = useState(existing?.ends_on ?? pre('end_date'))
  const [endsAt, setEndsAt] = useState((existing?.ends_at ?? pre('end_time')).slice(0, 5))
  const [showEnd, setShowEnd] = useState(!!(existing?.ends_on || existing?.ends_at || sp.get('end_date') || sp.get('end_time')))
  const [place, setPlace] = useState(existing?.place ?? pre('place'))
  const [address, setAddress] = useState(existing?.address ?? pre('address'))
  const [fromPlace, setFromPlace] = useState(existing?.from_place ?? '')
  const [toPlace, setToPlace] = useState(existing?.to_place ?? '')
  const [website, setWebsite] = useState(existing?.website ?? pre('website'))
  const [notes, setNotes] = useState(existing?.notes ?? pre('notes'))
  const [people, setPeople] = useState<string[]>(existing?.people ?? [])
  const [typed, setTyped] = useState('')
  const [priv, setPriv] = useState(existing?.private ?? false)
  const [vaultItem, setVaultItem] = useState<string>(existing?.vault_item_id ?? fromVault ?? '')
  const [vaultItems, setVaultItems] = useState<VI[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Vault items the signed-in person can see: the linked vault's, and their own private vault's (the database also checks on save).
  const [mineId, setMineId] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      const pv = await supabase.from('vaults').select('id').eq('personal', true).maybeSingle()
      const pid = (pv.data as { id: string } | null)?.id ?? null
      const ids = [home.vault_id, pid].filter((x): x is string => !!x)
      if (alive) setMineId(pid)
      if (!ids.length) return
      const r = await supabase.from('vault_items').select('id, title, type, vault_id').in('vault_id', ids).order('title')
      if (alive) setVaultItems((r.data ?? []) as VI[])
    })()
    return () => { alive = false }
  }, [home.vault_id])

  const places = useMemo(() => [...new Set(data.items.flatMap(i => [i.place, i.from_place, i.to_place]).map(p => p.trim()).filter(Boolean))].sort(), [data.items])
  const known = useMemo(() => [...new Set([...customNames(data.items), ...remembered()])].sort((a, b) => a.localeCompare(b)), [data.items])
  const options = useMemo(() => canonPeople([...data.groupNames, ...data.people.map(p => p.name)], data.aliases ?? {}).filter(n => n && n !== 'Someone'), [data.people, data.groupNames, data.aliases])
  const c = categoryOf(category)

  if (!!iid && !existing) return <div className="app"><div className="empty"><b>Item not found</b></div><Link className="btn block" to={back}>Back to the itinerary</Link></div>
  if (existing && !data.canChange(existing)) return <div className="app"><div className="notice err" role="alert">Only the person who added this, or an owner or co-admin, can change it.</div><Link className="btn block" to={`${back}/item/${existing.id}`}>Back</Link></div>

  const togglePerson = (n: string) => setPeople(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])
  function addTyped() {
    const n = typed.trim().slice(0, 40)
    if (n && !people.some(p => p.toLowerCase() === n.toLowerCase())) setPeople(p => [...p, n])
    setTyped('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Give it a title.'); return }
    if (category === 'custom' && !catLabel.trim()) { setError('Type a name for your custom category.'); return }
    if (endsOn && startsOn && endsOn < startsOn) { setError('The end date is before the start.'); return }
    setBusy(true); setError(null)
    const row = {
      category, category_label: category === 'custom' ? catLabel.trim() : '', subtype: subtype.trim(),
      title: title.trim(), description: description.trim(), vendor: vendor.trim(), booking_ref: bookingRef.trim(),
      starts_on: strOrNull(startsOn), starts_at: strOrNull(startsAt), ends_on: showEnd ? strOrNull(endsOn) : null, ends_at: showEnd ? strOrNull(endsAt) : null,
      place: place.trim(), address: address.trim(), from_place: category === 'transport' ? fromPlace.trim() : '', to_place: category === 'transport' ? toPlace.trim() : '',
      website: website.trim(), notes: notes.trim(), people, private: priv, vault_item_id: vaultItem || null,
    }
    let id = existing?.id
    if (existing) {
      // An unchanged link is left out so editing someone else's item never re-checks it.
      const { vault_item_id, ...rest } = row
      const patch = vault_item_id === existing.vault_item_id ? rest : row
      const { error } = await supabase.from('itinerary_items').update(patch).eq('id', existing.id)
      if (error) { setBusy(false); setError(friendly(error)); return }
    } else {
      const { data: ins, error } = await supabase.from('itinerary_items').insert({ ...row, itinerary_id: home.id, created_by: data.userId }).select('id').single()
      if (error || !ins) { setBusy(false); setError(friendly(error)); return }
      id = (ins as { id: string }).id
    }
    if (category === 'custom') remember(catLabel.trim())
    const fromExpense = !existing ? sp.get('expense') : null
    let linkProblem = false
    if (fromExpense && id) { const l = await supabase.rpc('link_expense_itinerary_item', { p_expense: fromExpense, p_item: id }); linkProblem = !!l.error }
    const fromList = !existing ? sp.get('checklist') : null
    if (fromList && id) { const l = await supabase.from('checklist_items').update({ itinerary_item_id: id }).eq('id', fromList); if (l.error) linkProblem = true }
    await reload()
    setBusy(false)
    toast(linkProblem ? 'Added, but the expense could not be linked. Open the expense to try again.' : existing ? 'Updated.' : fromExpense ? 'Added and linked to the expense.' : 'Added to the itinerary.')
    nav(`${back}/item/${id}`, { replace: true })
  }

  return (
    <div className="app">
      <div className="top"><div><Link className="backlink" to={existing ? `${back}/item/${existing.id}` : back}>← {existing ? existing.title : home.name}</Link><h1>{existing ? 'Edit item' : 'Add to the itinerary'}</h1></div></div>
      <form onSubmit={submit} className="panel">
        {fromVault && <div className="notice">Filled in from the vault item. Everything here is yours to change before you add it.</div>}
        <span className="lbl" style={{ marginTop: 0 }} id="icat">Category</span>
        <div className="vtypes" role="group" aria-labelledby="icat">
          {CATEGORIES.map(x => (
            <button type="button" key={x.id} aria-pressed={category === x.id} onClick={() => { setCategory(x.id); if (x.id !== category) setSubtype('') }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: x.icon }} />
              {x.label}
            </button>
          ))}
        </div>
        {category === 'custom' && (
          <>
            <label className="lbl" htmlFor="icl">Name of your category</label>
            <input id="icl" type="text" value={catLabel} maxLength={40} list="icnames" autoComplete="off" onChange={e => setCatLabel(e.target.value)} placeholder="Family, Work call, Photography" />
            <datalist id="icnames">{known.map(n => <option key={n} value={n} />)}</datalist>
          </>
        )}
        <label className="lbl" htmlFor="ist">Kind{category === 'custom' ? ' (optional)' : ''}</label>
        {c.subs.length > 0 && (
          <div className="chips" role="group" aria-label="Quick kinds" style={{ marginBottom: 6 }}>
            {c.subs.map(s => <button type="button" key={s} className="chip" aria-pressed={subtype === s} onClick={() => setSubtype(subtype === s ? '' : s)}>{s}</button>)}
          </div>
        )}
        <input id="ist" type="text" value={subtype} maxLength={40} onChange={e => setSubtype(e.target.value)} placeholder={c.subs.length ? 'Or type your own' : 'Anything'} />

        <label className="lbl" htmlFor="it1">Title</label>
        <input id="it1" type="text" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder={category === 'transport' ? 'Italo' : category === 'stay' ? 'Hotel Roma Centro' : 'Name'} autoFocus={!existing && !fromVault} />
        <label className="lbl" htmlFor="it2">Description</label>
        <input id="it2" type="text" value={description} maxLength={200} onChange={e => setDescription(e.target.value)} placeholder={category === 'transport' ? 'Venice to Florence' : 'What it is'} />
        <label className="lbl" htmlFor="it3">Vendor</label>
        <input id="it3" type="text" value={vendor} maxLength={80} onChange={e => setVendor(e.target.value)} placeholder="Italo (NTV)" />
        <label className="lbl" htmlFor="it3b">Booking code (optional)</label>
        <input id="it3b" type="text" value={bookingRef} maxLength={60} autoComplete="off" onChange={e => setBookingRef(e.target.value)} placeholder="Confirmation or PNR, e.g. ABC123" />

        <div className="row2">
          <div><label className="lbl" htmlFor="isd">{category === 'stay' ? 'Check-in date' : 'Starts'}</label><input type="date" id="isd" value={startsOn} onChange={e => setStartsOn(e.target.value)} /></div>
          <div><label className="lbl" htmlFor="ish">{category === 'stay' ? 'Check-in time' : 'Time'}</label><input type="time" id="ish" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>Times are local to the place, exactly as on the booking. Nothing is converted.</div>
        {(category === 'stay' || showEnd) ? (
          <div className="row2">
            <div><label className="lbl" htmlFor="ied">{category === 'stay' ? 'Check-out date' : 'Ends'}</label><input type="date" id="ied" value={endsOn} onChange={e => { setShowEnd(true); setEndsOn(e.target.value) }} /></div>
            <div><label className="lbl" htmlFor="ieh">{category === 'stay' ? 'Check-out time' : 'Time'}</label><input type="time" id="ieh" value={endsAt} onChange={e => { setShowEnd(true); setEndsAt(e.target.value) }} /></div>
          </div>
        ) : <button type="button" className="linkbtn" onClick={() => setShowEnd(true)}>+ Add an end date or time</button>}

        {category === 'transport' && (
          <>
            <label className="lbl" htmlFor="ifr">From</label>
            <input id="ifr" type="text" value={fromPlace} maxLength={80} list="iplaces" autoComplete="off" onChange={e => setFromPlace(e.target.value)} placeholder="Venezia Santa Lucia" />
            <label className="lbl" htmlFor="ito">To</label>
            <input id="ito" type="text" value={toPlace} maxLength={80} list="iplaces" autoComplete="off" onChange={e => setToPlace(e.target.value)} placeholder="Firenze S. M. Novella" />
            <div className="muted small" style={{ marginTop: 4 }}>With both filled in, Directions shows the route between them.</div>
          </>
        )}
        <label className="lbl" htmlFor="ipl">Place</label>
        <input id="ipl" type="text" value={place} maxLength={80} list="iplaces" autoComplete="off" onChange={e => setPlace(e.target.value)} placeholder="Florence" />
        <datalist id="iplaces">{places.map(p => <option key={p} value={p} />)}</datalist>
        <label className="lbl" htmlFor="iad">Address</label>
        <input id="iad" type="text" value={address} maxLength={200} onChange={e => setAddress(e.target.value)} placeholder="Piazza della Stazione" />
        <div className="muted small" style={{ marginTop: 4 }}>Used for the Map and Directions links.</div>
        <label className="lbl" htmlFor="iwe">Website</label>
        <input id="iwe" type="text" inputMode="url" value={website} maxLength={300} onChange={e => setWebsite(e.target.value)} placeholder="italotreno.it" autoCapitalize="none" />

        <span className="lbl" id="ippl">Who is involved</span>
        <div className="chips" role="group" aria-labelledby="ippl">
          {[...new Set([...options, ...people])].map(n => <button type="button" key={n} className="chip" aria-pressed={people.includes(n)} onClick={() => togglePerson(n)}>{n}</button>)}
        </div>
        <div className="prow" style={{ marginTop: 6 }}>
          <input type="text" value={typed} maxLength={40} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTyped() } }} placeholder="Add a name" aria-label="Add a name" />
          <button type="button" className="btn" onClick={addTyped}>Add</button>
        </div>
        <div className="muted small" style={{ marginTop: 4 }}>Itinerary members and the linked group’s travelers, with or without an account, or any name you type.</div>

        <label className="lbl" htmlFor="ino">Notes and instructions</label>
        <textarea id="ino" rows={3} value={notes} maxLength={2000} onChange={e => setNotes(e.target.value)} placeholder="Booking reference, gate, instructions" />

        {(home.vault_id || mineId) && (
          <>
            <label className="lbl" htmlFor="ivi">Vault item</label>
            <select id="ivi" value={vaultItem} onChange={e => setVaultItem(e.target.value)}>
              <option value="">None</option>
              {vaultItem && !vaultItems.some(v => v.id === vaultItem) && <option value={vaultItem}>Linked item</option>}
              {vaultItems.map(v => <option key={v.id} value={v.id}>{v.title}{v.vault_id === mineId ? ' (My vault)' : ''}</option>)}
            </select>
            <div className="muted small" style={{ marginTop: 4 }}>Only people who can see that vault item see the link.</div>
          </>
        )}

        <span className="lbl" id="ivis">Who can see it?</span>
        <div className="seg" role="group" aria-labelledby="ivis">
          <button type="button" aria-pressed={!priv} onClick={() => setPriv(false)}>Everyone in the itinerary</button>
          <button type="button" aria-pressed={priv} onClick={() => setPriv(true)}>Only me</button>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>Only me items are hidden from everyone else, including the owner, and never appear in read-only links.</div>

        {error && <div className="notice err" role="alert">{error}</div>}
        <button className="btn primary block" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>
    </div>
  )
}
