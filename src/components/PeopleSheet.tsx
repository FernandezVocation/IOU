import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { listPeople, type PersonRef } from '../lib/overview'
import type { AllGroups } from '../lib/allGroups'
import { friendly } from '../lib/format'
import { Sheet, useToast } from './ui'

/** Tell the app which travelers across your groups are the same person. Private to you. */
export default function PeopleSheet({ all, userId, onClose, onChanged }: { all: AllGroups; userId: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [sel, setSel] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const people = useMemo(() => listPeople({ groups: all.groups, userId, contacts: all.contacts, mappings: all.mappings }), [all, userId])

  async function map(ids: string[], contactId: string) {
    const { error } = await supabase.from('contact_travelers').upsert(ids.map(traveler_id => ({ traveler_id, contact_id: contactId })), { onConflict: 'owner_id,traveler_id' })
    if (error) throw error
  }
  async function newContact(name: string): Promise<string> {
    const { data, error } = await supabase.from('contacts').insert({ name }).select('id').single()
    if (error) throw error
    return (data as { id: string }).id
  }
  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true)
    try { await fn(); toast(ok); setSel([]); onChanged() } catch (e) { toast(friendly(e)) } finally { setBusy(false) }
  }
  const rename = (p: PersonRef, name: string) => run(async () => {
    const n = name.trim()
    if (!n || n === p.name) return
    if (p.contactId) { const { error } = await supabase.from('contacts').update({ name: n }).eq('id', p.contactId); if (error) throw error }
    else await map(p.travelers.map(t => t.id), await newContact(n))
  }, 'Renamed.')
  const merge = () => run(async () => {
    const chosen = people.filter(p => sel.includes(p.key))
    const target = chosen[0]
    const cid = target.contactId ?? await newContact(target.name)
    for (const p of chosen) await map(p.travelers.map(t => t.id), cid)
    const old = chosen.map(p => p.contactId).filter((x): x is string => !!x && x !== cid)
    if (old.length) { const { error } = await supabase.from('contacts').delete().in('id', old); if (error) throw error }
  }, 'Merged. Their balances are now combined.')
  const split = (p: PersonRef) => run(async () => {
    for (const t of p.travelers) await map([t.id], await newContact(t.name))
    if (p.contactId) { const { error } = await supabase.from('contacts').delete().eq('id', p.contactId); if (error) throw error }
  }, 'Separated into individual people.')

  return (
    <Sheet title="People across your groups" onClose={onClose}>
      <div className="muted small">Same name in two groups is combined automatically. If a person goes by different names, pick them and tap Merge. If two different people share a name, tap Separate. This is only for your own overview; nobody else sees it.</div>
      <div className="panel">
        {people.map(p => (
          <div key={p.key} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <label className="radio" style={{ minHeight: 0 }}>
              <input type="checkbox" checked={sel.includes(p.key)} onChange={() => setSel(s => (s.includes(p.key) ? s.filter(x => x !== p.key) : [...s, p.key]))} aria-label={`Select ${p.name}`} />
              <input type="text" defaultValue={p.name} maxLength={40} aria-label={`Name for ${p.name}`} key={p.key + p.name} onBlur={e => rename(p, e.target.value)} disabled={busy} />
            </label>
            <div className="muted small" style={{ marginLeft: 30 }}>{p.travelers.map(t => `${t.name} in ${t.groupName}`).join(' · ')}</div>
            {p.travelers.length > 1 && <button className="linkbtn" style={{ marginLeft: 30 }} onClick={() => split(p)} disabled={busy}>Separate these</button>}
          </div>
        ))}
        {!people.length && <div className="muted">You haven’t traveled with anyone yet.</div>}
      </div>
      <button className="btn primary block" disabled={sel.length < 2 || busy} onClick={merge}>{sel.length >= 2 ? `Merge ${sel.length} people into one` : 'Select two or more to merge'}</button>
    </Sheet>
  )
}
