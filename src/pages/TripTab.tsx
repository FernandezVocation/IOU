import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COMMON_CURRENCIES, friendly } from '../lib/format'
import { isValidCurrency, parseNum } from '../lib/money'
import { useAuth } from '../lib/auth'
import { canEditGroup, roleLabel } from '../lib/access'
import { Avatar, ConfirmDialog, useArm, useToast } from '../components/ui'
import BalanceLinks from '../components/BalanceLinks'
import KindPicker from '../components/KindPicker'
import { useGroup } from './GroupShell'

const PALETTE = ['#2B44FF', '#0E7C61', '#C23B22', '#8A4FD3', '#B07A00', '#0B8FA8', '#C7366F', '#5B6B2E']

export default function TripTab() {
  const { data, reload } = useGroup()
  const toast = useToast()
  const arm = useArm()
  const nav = useNavigate()
  const { user } = useAuth()
  const g = data.group, cur = g.currency
  const [name, setName] = useState(g.name)
  const [kind, setKind] = useState(g.kind || 'Trip')
  const [newPerson, setNewPerson] = useState('')
  const [addCur, setAddCur] = useState('')
  const [confirmGroup, setConfirmGroup] = useState(false)
  const hasMoney = data.expenses.length > 0 || data.payments.length > 0
  const link = `${window.location.origin}/join/${g.invite_code}`

  const run = async (p: PromiseLike<{ error: unknown }>, ok?: string) => {
    const { error } = await p
    if (error) { toast(friendly(error)); return false }
    if (ok) toast(ok)
    await reload()
    return true
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(link); toast('Invite link copied.') } catch { toast('Could not copy. Press and hold the link to copy it.') }
  }
  async function shareLink() {
    if (navigator.share) { try { await navigator.share({ title: `Join ${g.name}`, text: `Join "${g.name}" on IOU`, url: link }) } catch { /* cancelled */ } } else copyLink()
  }
  async function addPerson() {
    const n = newPerson.trim()
    if (!n) return
    if (data.travelers.some(t => t.name.toLowerCase() === n.toLowerCase())) { toast('That name is already in the group.'); return }
    if (await run(supabase.from('travelers').insert({ group_id: g.id, name: n, color: PALETTE[data.travelers.length % PALETTE.length], sort_order: Date.now() }))) setNewPerson('')
  }
  async function removePerson(id: string) {
    arm.clear()
    await run(supabase.from('travelers').delete().eq('id', id))
  }
  async function setRate(c: string, raw: string) {
    const n = parseNum(raw)
    if (raw.trim() === '') await run(supabase.from('group_rates').delete().eq('group_id', g.id).eq('currency', c))
    else if (n > 0) await run(supabase.from('group_rates').upsert({ group_id: g.id, currency: c, rate: n }, { onConflict: 'group_id,currency' }))
    else toast('Enter a rate greater than zero.')
  }
  async function removeMember(userId: string) {
    arm.clear()
    await run(supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', userId), 'Member removed.')
  }
  async function leave() {
    arm.clear()
    const { error } = await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', user?.id ?? '')
    if (error) toast(friendly(error)); else nav('/', { replace: true })
  }
  async function deleteGroup() {
    arm.clear()
    const paths = data.expenses.flatMap(e => e.receipts.map(r => r.path))
    for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('receipts').remove(paths.slice(i, i + 100))
    const { error } = await supabase.from('groups').delete().eq('id', g.id)
    if (error) toast(friendly(error)); else nav('/', { replace: true })
  }

  const used = new Set(data.expenses.map(e => e.currency).filter(c => c !== cur))
  Object.keys(data.rates).forEach(c => used.add(c))

  return (
    <>
      <div className="sect" style={{ marginTop: 8 }}>
        <h2>Invite people</h2>
        <div className="muted small">Anyone with this link can join after signing in, as a <b>viewer</b>: they can see everything but change nothing. Under “Members with accounts” you choose who can add expenses. People who only appear in splits do not need to join, and people without an account can get a read-only link below.</div>
        <div className="panel">
          <div className="code">{link}</div>
          <div className="row2" style={{ marginTop: 10 }}>
            <button className="btn" onClick={copyLink}>Copy link</button>
            <button className="btn primary" onClick={shareLink}>Share</button>
          </div>
          {data.isOwner && (
            <div style={{ marginTop: 10 }}>
              <button className={'btn small' + (arm.is('rot') ? ' armed' : '')} onClick={async () => {
                if (!arm.is('rot')) { arm.arm('rot'); return }
                arm.clear(); await run(supabase.rpc('rotate_invite_code', { p_group: g.id }), 'New invite link created. The old one no longer works.')
              }}>{arm.is('rot') ? 'Tap again to replace the link' : 'Replace invite link'}</button>
            </div>
          )}
        </div>
      </div>

      {data.isOwner && <BalanceLinks />}

      <div className="sect">
        <h2>People</h2>
        <div className="muted small">Everyone who splits costs. The one marked “you” is linked to your account.</div>
        {data.travelers.map(t => {
          const k = 'delp:' + t.id
          return (
            <div className="prow" key={t.id}>
              <Avatar name={t.name} color={t.color} />
              <input type="text" defaultValue={t.name} maxLength={40} aria-label="Name" key={t.id + t.name}
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) run(supabase.from('travelers').update({ name: v }).eq('id', t.id)); else e.target.value = t.name }} />
              {data.me?.id === t.id ? <span className="tag" style={{ background: 'var(--soft)', color: 'var(--muted)' }}>you</span>
                : <button className={'btn small danger' + (arm.is(k) ? ' armed' : '')} onClick={() => arm.is(k) ? removePerson(t.id) : arm.arm(k)}>{arm.is(k) ? 'Confirm' : 'Remove'}</button>}
            </div>
          )
        })}
        {canEditGroup(data) && <div className="prow">
          <input type="text" value={newPerson} onChange={e => setNewPerson(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPerson() }} placeholder="Add a person" maxLength={40} aria-label="New traveler name" />
          <button className="btn primary" onClick={addPerson}>Add</button>
        </div>}
        <div className="muted small">A person who is on an expense or payment can’t be removed.</div>
      </div>

      <div className="sect">
        <h2>Exchange rates</h2>
        <div className="muted small">Used only to estimate foreign expenses until you enter the real {cur} amount from your statement. Statement amounts always win.</div>
        {[...used].sort().map(c => {
          const settled = data.expenses.filter(e => e.currency === c && e.settled_amount != null && e.amount > 0)
          const sa = settled.reduce((s, e) => s + e.amount, 0), sb = settled.reduce((s, e) => s + (e.settled_amount as number), 0)
          const avg = sa > 0 ? sb / sa : null
          return (
            <div className="panel" key={c}>
              <div className="rate"><b>1 {c} =</b>
                <input type="text" className="inp" inputMode="decimal" defaultValue={data.rates[c] ?? ''} key={c + (data.rates[c] ?? '')} placeholder="rate" aria-label={`Rate for ${c}`} onBlur={e => { if (e.target.value !== String(data.rates[c] ?? '')) setRate(c, e.target.value) }} />
                <b>{cur}</b></div>
              {avg ? <div className="muted small">Average of {settled.length} settled: {avg.toFixed(4)} <button className="btn small" style={{ marginLeft: 6 }} onClick={() => run(supabase.from('group_rates').upsert({ group_id: g.id, currency: c, rate: Number(avg.toFixed(6)) }, { onConflict: 'group_id,currency' }))}>Use it</button></div>
                : <div className="muted small">No settled {c} expenses yet.</div>}
            </div>
          )
        })}
        <div className="prow">
          <select value={addCur} onChange={e => setAddCur(e.target.value)} aria-label="Currency to add">
            <option value="">Add a currency…</option>
            {COMMON_CURRENCIES.filter(c => c !== cur && !used.has(c)).map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="btn" disabled={!isValidCurrency(addCur)} onClick={async () => { if (await run(supabase.from('group_rates').upsert({ group_id: g.id, currency: addCur, rate: 1 }, { onConflict: 'group_id,currency' }))) setAddCur('') }}>Add</button>
        </div>
        <div className="muted small">New currencies start at a rate of 1. Replace it with a real estimate.</div>
      </div>

      <div className="sect">
        <h2>Group settings</h2>
        <div className="panel">
          <label className="lbl" style={{ marginTop: 0 }} htmlFor="gname">Group name</label>
          <input id="gname" type="text" value={name} maxLength={80} onChange={e => setName(e.target.value)} disabled={!data.isOwner}
            onBlur={() => { const v = name.trim(); if (v && v !== g.name) run(supabase.from('groups').update({ name: v }).eq('id', g.id)); else setName(g.name) }} />
          <span className="lbl">Type</span>
          {data.isOwner
            ? <>
                <KindPicker value={kind} onChange={setKind} id="gkind" />
                {kind.trim() && kind.trim() !== (g.kind || 'Trip') && <button className="btn small" style={{ marginTop: 8 }} onClick={() => run(supabase.from('groups').update({ kind: kind.trim() }).eq('id', g.id), 'Type saved.')}>Save type</button>}
              </>
            : <div>{g.kind || 'Trip'}</div>}
          <label className="lbl" htmlFor="gcur">Settle currency</label>
          <select id="gcur" value={cur} disabled={!data.isOwner || hasMoney} onChange={e => run(supabase.from('groups').update({ currency: e.target.value }).eq('id', g.id))}>
            {[...new Set([cur, ...COMMON_CURRENCIES])].map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="muted small" style={{ marginTop: 6 }}>{hasMoney ? 'Locked because expenses exist, so statement amounts keep their meaning.' : data.isOwner ? 'Set by the group owner.' : 'Only the group owner can change this.'}</div>
        </div>
      </div>

      <div className="sect">
        <h2>Members with accounts</h2>
        {data.members.map(m => {
          const k = 'delm:' + m.user_id
          const isMe = m.user_id === user?.id
          return (
            <div className="prow" key={m.user_id} style={{ justifyContent: 'space-between' }}>
              <span>{m.display_name || 'Member'}{isMe && ' (you)'} {(m.role === 'owner' || !data.isOwner) && <span className="muted small">{roleLabel(m.role)}</span>}</span>
              {data.isOwner && m.role !== 'owner' && (
                <select aria-label={`Access for ${m.display_name || 'member'}`} value={m.role} onChange={e => run(supabase.rpc('set_member_role', { p_group: g.id, p_user: m.user_id, p_role: e.target.value }), 'Access updated.')} style={{ width: 'auto' }}>
                  <option value="viewer">View only</option>
                  <option value="editor">Can add expenses</option>
                </select>
              )}
              {data.isOwner && !isMe && <button className={'btn small danger' + (arm.is(k) ? ' armed' : '')} onClick={() => arm.is(k) ? removeMember(m.user_id) : arm.arm(k)}>{arm.is(k) ? 'Confirm' : 'Remove'}</button>}
            </div>
          )
        })}
      </div>

      <div className="sect">
        {data.isOwner ? (
          <button className="btn danger block" onClick={() => setConfirmGroup(true)}>Delete group</button>
        ) : (
          <button className={'btn danger block' + (arm.is('leave') ? ' armed' : '')} onClick={() => arm.is('leave') ? leave() : arm.arm('leave')}>{arm.is('leave') ? 'Tap again to leave' : 'Leave group'}</button>
        )}
      </div>
      {confirmGroup && (
        <ConfirmDialog title={`Delete “${g.name}”?`} confirmLabel="Delete group" onCancel={() => setConfirmGroup(false)} onConfirm={() => { setConfirmGroup(false); deleteGroup() }}>
          This permanently removes the group for <b>everyone</b>: all expenses, payments, receipts and balance links. Download your reports and receipts first if you need a copy. This can’t be undone.
        </ConfirmDialog>
      )}
    </>
  )
}
