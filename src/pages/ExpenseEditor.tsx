import { useEffect, useMemo, useRef, useState } from 'react'
import { currencyOption } from '../components/currencyOption'
import { CurrencySelect } from '../components/CurrencySelect'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { COMMON_CURRENCIES, friendly, nowTime, todayStr } from '../lib/format'
import { allocate, currencyDigits, fmtMoney, fromMinor, isValidCurrency, parseNum, toMinor } from '../lib/money'
import type { Expense, ExpenseStatus, Receipt, SplitMode } from '../lib/types'
import { STATUSES, useGroupItineraryItems, useGroupVaultItems } from '../lib/expenseExtras'
import CategoryIcon from '../components/CategoryIcon'
import TypeIcon from '../components/TypeIcon'
import { Avatar, ConfirmDialog, useToast } from '../components/ui'
import CategoryPicker from '../components/CategoryPicker'
import { useAuth } from '../lib/auth'
import { userName } from '../lib/payments'
import { canEditGroup, canModifyExpense } from '../lib/access'
import { useGroup } from './GroupShell'

interface NewFile { blob: Blob; type: string; name: string; preview: string }
interface Form {
  date: string; time: string; vendor: string; description: string; location: string; category: string; subcategory: string; notes: string
  amount: string; foreign: boolean; pick: string; otherCur: string; settled: string; charged: string
  payerId: string; mode: SplitMode; entries: Record<string, string>
  status: ExpenseStatus; itemId: string; planId: string
}

const LAST_FOREIGN = 'tl_last_foreign_currency'
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

/** Shrink phone photos before upload: long edge 1800px, JPEG. PDFs and small images pass through. */
async function prepFile(file: File): Promise<NewFile> {
  if (file.type === 'application/pdf') return { blob: file, type: file.type, name: file.name, preview: '' }
  if (!file.type.startsWith('image/')) throw new Error('Only photos and PDFs can be attached.')
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc)
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.82))
    if (!blob) throw new Error('encode failed')
    return { blob, type: 'image/jpeg', name: file.name, preview: URL.createObjectURL(blob) }
  } catch {
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) return { blob: file, type: file.type, name: file.name, preview: URL.createObjectURL(file) }
    throw new Error('Could not read that image. Try a JPEG or PNG.')
  }
}

export default function ExpenseEditor() {
  const { eid = '' } = useParams()
  const [qs] = useSearchParams()   // a vault item can open a new expense with these filled in
  const { data, reload } = useGroup()
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [confirmDel, setConfirmDel] = useState(false)
  const g = data.group, base = g.currency
  const { items: vaultItems, vaultId } = useGroupVaultItems(g.id, true)
  const planItems = useGroupItineraryItems(g.id, true)
  const spending = g.spending_currency && g.spending_currency !== base ? g.spending_currency : null   // set only when expenses are usually entered in another currency
  const existing: Expense | undefined = eid === 'new' ? undefined : data.expenses.find(e => e.id === eid)
  const back = '/g/' + g.id

  const [form, setForm] = useState<Form | null>(null)
  const [files, setFiles] = useState<NewFile[]>([])
  const [kept, setKept] = useState<Receipt[]>([])
  const [removed, setRemoved] = useState<Receipt[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [light, setLight] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inited = useRef(false)

  // Initialise once from the existing expense (or fresh defaults).
  useEffect(() => {
    if (inited.current) return
    if (eid !== 'new' && !existing) return
    inited.current = true
    const foreign = existing ? existing.currency !== base : !!spending
    const lastF = lsGet(LAST_FOREIGN)
    const startCur = existing && foreign ? existing.currency : spending ? spending : (lastF && isValidCurrency(lastF) && lastF !== base ? lastF : COMMON_CURRENCIES.find(c => c !== base) ?? 'USD')
    const inList = COMMON_CURRENCIES.includes(startCur)
    setForm({
      date: existing?.spent_on ?? (/^\d{4}-\d{2}-\d{2}$/.test(qs.get('date') ?? '') ? qs.get('date')! : todayStr()), time: existing ? (existing.spent_at ?? '').slice(0, 5) : (/^\d{2}:\d{2}$/.test(qs.get('time') ?? '') ? qs.get('time')! : nowTime()),
      vendor: existing?.vendor ?? (qs.get('vendor') ?? '').slice(0, 120), description: existing?.description ?? (qs.get('description') ?? '').slice(0, 200), location: existing?.location ?? '', category: existing?.category ?? '', subcategory: existing?.subcategory ?? '', notes: existing?.notes ?? '',
      amount: existing ? String(existing.amount) : '', foreign, pick: inList ? startCur : '__other', otherCur: inList ? '' : startCur,
      settled: existing?.settled_amount != null ? String(existing.settled_amount) : '',
      charged: existing?.charged_amount != null ? String(existing.charged_amount) : '',
      payerId: existing?.payer_id ?? data.me?.id ?? data.travelers[0]?.id ?? '',
      mode: existing?.split_mode ?? 'equal',
      status: existing?.status ?? 'final', itemId: existing ? (existing.vault_item_id ?? '') : (qs.get('item') ?? ''), planId: existing ? (existing.itinerary_item_id ?? '') : (qs.get('plan') ?? ''),
      entries: existing ? Object.fromEntries(existing.splits.map(s => [s.traveler_id, String(s.value)])) : Object.fromEntries(data.travelers.map(t => [t.id, '1'])),
    })
    setKept(existing?.receipts ?? [])
  }, [eid, existing, base, spending, data.me, data.travelers])

  // Signed URLs for stored receipts (bucket is private).
  const keptKey = kept.map(r => r.path).join('|')
  useEffect(() => {
    if (!kept.length) return
    let alive = true
    supabase.storage.from('receipts').createSignedUrls(kept.map(r => r.path), 3600).then(({ data: d }) => {
      if (!alive || !d) return
      setUrls(Object.fromEntries(d.filter(x => x.path && x.signedUrl).map(x => [x.path as string, x.signedUrl as string])))
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keptKey])

  const cur = form ? (form.foreign ? (form.pick === '__other' ? form.otherCur.trim().toUpperCase() : form.pick) : base) : base
  const amountNum = form ? parseNum(form.amount) : NaN
  // The payer's own card currency. It decides what the "statement" field means.
  const payerT = form ? data.travelers.find(t => t.id === form.payerId) : undefined
  const stmtCur = (existing && form && form.payerId === existing.payer_id && existing.charged_currency) || payerT?.statement_currency || base
  const totalMinor = amountNum > 0 && isValidCurrency(cur) ? toMinor(amountNum, cur) : 0

  const ids = form ? Object.keys(form.entries) : []
  const weights = form ? ids.map(i => (form.mode === 'equal' ? 1 : Math.max(0, parseNum(form.entries[i]) || 0))) : []
  const preview = useMemo(() => (totalMinor > 0 ? allocate(totalMinor, weights) : weights.map(() => 0)), [totalMinor, weights.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!existing && eid !== 'new') return <div className="app"><div className="notice err">That expense no longer exists.</div><Link className="btn block" to={back}>Back to the group</Link></div>
  if (!form) return null
  const f = form
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(p => (p ? { ...p, [k]: v } : p))
  const readOnly = existing ? !canModifyExpense(data, existing, user?.id ?? '') : !canEditGroup(data)
  const dis = saving || readOnly

  function validity(): { ok: boolean; msg: string } {
    if (!ids.length) return { ok: false, msg: 'Pick at least one person.' }
    const vals = ids.map(i => parseNum(f.entries[i]) || 0), sum = vals.reduce((a, b) => a + b, 0)
    if (f.mode === 'equal') return { ok: true, msg: `${ids.length} ${ids.length === 1 ? 'person' : 'people'}, equal shares.` }
    if (f.mode === 'shares') return vals.every(v => v > 0) ? { ok: true, msg: `${sum} shares in total.` } : { ok: false, msg: 'Every selected person needs at least 1 share.' }
    if (f.mode === 'percent') { const d = Math.round((100 - sum) * 100) / 100; return Math.abs(d) < 0.005 ? { ok: true, msg: 'Adds up to 100%.' } : { ok: false, msg: d > 0 ? `${d}% still to assign.` : `${-d}% over.` } }
    if (!(totalMinor > 0)) return { ok: false, msg: 'Enter the total amount first.' }
    const diff = totalMinor - toMinor(sum, cur)
    return Math.abs(diff) <= 1 ? { ok: true, msg: 'Amounts match the total.' } : { ok: false, msg: `${fmtMoney(Math.abs(diff), cur)} ${diff > 0 ? 'still to assign' : 'over the total'}.` }
  }
  const v = validity()

  function evenSplit(mode: SplitMode, entries: Record<string, string>): Record<string, string> {
    const keys = Object.keys(entries)
    if (!keys.length) return entries
    if (mode === 'percent') { const a = allocate(10000, keys.map(() => 1)); return Object.fromEntries(keys.map((k, i) => [k, String(a[i] / 100)])) }
    if (mode === 'exact') { const a = allocate(totalMinor, keys.map(() => 1)); return Object.fromEntries(keys.map((k, i) => [k, String(fromMinor(a[i], cur))])) }
    return Object.fromEntries(keys.map(k => [k, '1']))
  }
  const setMode = (m: SplitMode) => setForm(p => (p ? { ...p, mode: m, entries: evenSplit(m, p.entries) } : p))
  const toggleForeign = (on: boolean) => setForm(p => (p ? { ...p, foreign: on, settled: on ? p.settled : '', charged: on ? p.charged : '', entries: p.mode === 'exact' ? evenSplit('exact', p.entries) : p.entries } : p))
  const toggleWho = (id: string, on: boolean) => setForm(p => {
    if (!p) return p
    const entries = { ...p.entries }
    if (on) entries[id] = p.mode === 'equal' || p.mode === 'shares' ? '1' : '0'; else delete entries[id]
    return { ...p, entries: p.mode === 'percent' || p.mode === 'exact' ? evenSplit(p.mode, entries) : entries }
  })

  async function addFiles(list: FileList | null) {
    if (!list) return
    for (const file of Array.from(list)) {
      try { const nf = await prepFile(file); setFiles(p => [...p, nf]) } catch (e) { toast(friendly(e)) }
    }
  }

  async function save() {
    if (saving) return
    if (!(amountNum > 0)) { toast('Enter an amount greater than zero.'); return }
    if (f.foreign && !isValidCurrency(cur)) { toast('Enter a valid 3-letter currency code.'); return }
    if (!f.date) { toast('Pick a date.'); return }
    if (!v.ok) { toast(v.msg); return }
    let settled: number | null = null
    if (f.foreign && cur !== base && f.settled.trim() !== '') {
      const s = parseNum(f.settled)
      if (!(s > 0)) { toast(`Enter the ${base} amount as a number, or leave it blank.`); return }
      settled = s
    }
    // The payer's statement amount (in their own card currency) when that is neither the group currency nor what the bill was in.
    let charged: { amount: number; currency: string } | null = null
    if (f.foreign && cur !== base && stmtCur !== base && stmtCur !== cur && f.charged.trim() !== '') {
      const c = parseNum(f.charged)
      if (!(c > 0)) { toast(`Enter the ${stmtCur} amount as a number, or leave it blank.`); return }
      charged = { amount: c, currency: stmtCur }
    }
    setSaving(true)
    const id = existing?.id ?? crypto.randomUUID()
    const splits = ids.map(i => ({ traveler_id: i, value: f.mode === 'equal' ? 1 : parseNum(f.entries[i]) }))
    const { error } = await supabase.rpc('save_expense', {
      p_id: id, p_group: g.id,
      p: { spent_on: f.date, spent_at: f.time || '', vendor: f.vendor.trim(), description: f.description.trim(), location: f.location.trim(), category: f.category.trim(), subcategory: f.category.trim() ? f.subcategory.trim() : '', notes: f.notes.trim(), amount: amountNum, currency: cur, settled_amount: settled, charged_amount: charged?.amount ?? null, charged_currency: charged?.currency ?? null, payer_id: f.payerId, split_mode: f.mode, status: f.status, vault_item_id: f.itemId || null, itinerary_item_id: f.planId || null },
      p_splits: splits,
    })
    if (error) { toast(friendly(error)); setSaving(false); return }
    if (f.foreign && cur !== base && !spending) lsSet(LAST_FOREIGN, cur)

    // Receipts are secondary to the expense: the expense is already saved, so report failures without losing it.
    let receiptProblem = false
    for (const file of files) {
      const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg'
      const path = `${g.id}/${id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('receipts').upload(path, file.blob, { contentType: file.type, upsert: false })
      if (up.error) { receiptProblem = true; continue }
      const ins = await supabase.from('receipts').insert({ expense_id: id, group_id: g.id, path, mime: file.type, name: file.name.slice(0, 80), size_bytes: file.blob.size })
      if (ins.error) { receiptProblem = true; await supabase.storage.from('receipts').remove([path]) }
    }
    if (removed.length) {
      await supabase.from('receipts').delete().in('id', removed.map(r => r.id))
      await supabase.storage.from('receipts').remove(removed.map(r => r.path))
    }
    await reload()
    toast(receiptProblem ? 'Expense saved, but a receipt failed to upload. Open it to retry.' : existing ? 'Expense updated.' : 'Expense added.')
    nav(back, { replace: true })
  }

  async function remove() {
    if (!existing) return
    setSaving(true)
    const paths = existing.receipts.map(r => r.path)
    const { error } = await supabase.from('expenses').delete().eq('id', existing.id)
    if (error) { toast(friendly(error)); setSaving(false); setConfirmDel(false); return }
    if (paths.length) await supabase.storage.from('receipts').remove(paths)
    await reload()
    toast('Expense deleted.')
    nav(back, { replace: true })
  }

  const rate = data.rates[cur]
  const settledNum = parseNum(f.settled)
  const chargedNum = parseNum(f.charged)
  const inBase = (n: number, r: number) => fmtMoney(Math.round(n * r * 10 ** currencyDigits(base)), base)
  const sRate = data.rates[stmtCur]
  const useCharged = stmtCur !== base && stmtCur !== cur
  const hint = settledNum > 0 && amountNum > 0 ? `Effective rate: 1 ${cur} = ${(settledNum / amountNum).toFixed(4)} ${base}`
    : useCharged && chargedNum > 0 && sRate > 0 ? `Your ${fmtMoney(toMinor(chargedNum, stmtCur), stmtCur)} counts as ≈ ${inBase(chargedNum, sRate)} at your group’s rate (1 ${stmtCur} = ${sRate} ${base}). Type the exact ${base} amount below once you know it.`
    : useCharged && chargedNum > 0 ? `No ${stmtCur} rate is set for this group. Type the exact ${base} amount below, or ask an admin to add a ${stmtCur} rate in Group settings.`
    : stmtCur !== base && stmtCur === cur && amountNum > 0 && sRate > 0 ? `Paid in ${cur}, counts as ≈ ${inBase(amountNum, sRate)} at your group’s rate (1 ${cur} = ${sRate} ${base}). Type the exact ${base} amount once your statement posts.`
    : rate > 0 && amountNum > 0 ? `Estimated at your group’s rate (1 ${cur} = ${rate} ${base}): ≈ ${inBase(amountNum, rate)}. Fill in the real amount when your statement posts.`
    : `No ${cur || 'currency'} rate set. Enter the ${base} amount now or add a rate in Group settings, otherwise this expense is not counted.`
  const onCurChange = (v: string) => setForm(p => {
    if (!p) return p
    if (v === base) return { ...p, foreign: false, settled: '', charged: '' }
    return { ...p, foreign: true, pick: v }
  })
  const currencyChoices = [...new Set([...(spending ? [spending] : []), ...COMMON_CURRENCIES.filter(c => c !== base), ...(isValidCurrency(cur) && cur !== base ? [cur] : [])])]
  const stmtChoices = [...new Set([base, ...(spending ? [spending] : []), stmtCur, ...COMMON_CURRENCIES])]
  async function setStmtCur(v: string) {
    if (!payerT) return
    const { error } = await supabase.from('travelers').update({ statement_currency: v === base ? null : v }).eq('id', payerT.id)
    if (error) toast(friendly(error)); else await reload()
  }

  return (
    <div className="sheet">
      <div className="in">
        <header>
          <Link className="btn small" to={back}>Cancel</Link>
          <h2>{existing ? 'Expense' : 'New expense'}</h2>
          {readOnly ? <span className="tag">View only</span> : <button className="btn small primary" onClick={save} disabled={dis}>{saving ? 'Saving…' : 'Save'}</button>}
        </header>
        {readOnly && <div className="notice" role="status">{existing && canEditGroup(data) ? 'You can only change expenses you added. Ask a group admin, or the person who added this one, to change it.' : 'You have view-only access. Ask the group owner if you need to add expenses.'}</div>}
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>

        <div className="amtrow" style={{ marginTop: 6 }}>
          <div>
            <label className="lbl" style={{ marginTop: 0 }} htmlFor="amt">Amount</label>
            <input className="inp big" id="amt" inputMode="decimal" placeholder="0.00" value={f.amount} onChange={e => set('amount', e.target.value)} autoFocus={!existing} />
          </div>
          <div>
            {f.foreign || spending ? (
              <>
                <label className="lbl" style={{ marginTop: 0 }} htmlFor="cur">Currency</label>
                <select id="cur" value={spending && !f.foreign ? base : f.pick} onChange={e => onCurChange(e.target.value)}>
                  {currencyChoices.map(c => currencyOption(c))}
                  {spending && !currencyChoices.includes(base) && <option>{base}</option>}
                  <option value="__other">Other…</option>
                </select>
                {f.foreign && f.pick === '__other' && <input type="text" className="inp" maxLength={3} placeholder="e.g. PLN" value={f.otherCur} onChange={e => set('otherCur', e.target.value)} style={{ marginTop: 6, textTransform: 'uppercase' }} aria-label="Currency code" />}
              </>
            ) : (
              <>
                <div className="lbl" style={{ marginTop: 0 }}>Currency</div>
                <div className="inp" style={{ display: 'flex', alignItems: 'center', fontWeight: 600, minHeight: 56 }}>{base}</div>
              </>
            )}
          </div>
        </div>

        {!spending && (
          <label className="switch" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={f.foreign} onChange={e => toggleForeign(e.target.checked)} />
            <span>Paid in a different currency</span>
          </label>
        )}
        {f.foreign && (
          <div>
            {!readOnly && (
              <>
                <label className="lbl" htmlFor="stmtcur">{payerT ? (payerT.id === data.me?.id ? 'Your' : payerT.name + '’s') : 'Their'} card statement is in</label>
                <CurrencySelect id="stmtcur" value={stmtCur} choices={stmtChoices} onChange={setStmtCur} />
              </>
            )}
            {useCharged && (
              <>
                <label className="lbl" htmlFor="charged">Charged to the card, in {stmtCur}</label>
                <input className="inp" id="charged" inputMode="decimal" placeholder="Optional, add it later" value={f.charged} onChange={e => set('charged', e.target.value)} />
              </>
            )}
            <label className="lbl" htmlFor="settled">{stmtCur === base ? `Charged in ${base} (from your card statement)` : `Exact ${base} amount (optional)`}</label>
            <input className="inp" id="settled" inputMode="decimal" placeholder="Optional, add it later" value={f.settled} onChange={e => set('settled', e.target.value)} />
            <div className="muted small" style={{ marginTop: 6 }}>{hint}</div>
          </div>
        )}

        <label className="lbl" htmlFor="vendor">Vendor</label>
        <input type="text" id="vendor" value={f.vendor} maxLength={120} list="vendors" autoComplete="off" onChange={e => set('vendor', e.target.value)} />
        <label className="lbl" htmlFor="description">Description</label>
        <input type="text" id="description" value={f.description} maxLength={200} placeholder="e.g. Florence to Rome" autoComplete="off" onChange={e => set('description', e.target.value)} />
        <datalist id="vendors">{[...new Set(data.expenses.map(e => e.vendor).filter(Boolean))].slice(0, 60).map(x => <option key={x} value={x} />)}</datalist>
        <div className="row2">
          <div><label className="lbl" htmlFor="date">Date</label><input type="date" id="date" value={f.date} onChange={e => set('date', e.target.value)} /></div>
          <div><label className="lbl" htmlFor="time">Time</label><input type="time" id="time" value={f.time} onChange={e => set('time', e.target.value)} /></div>
        </div>
        <CategoryPicker category={f.category} subcategory={f.subcategory} history={data.expenses}
          onChange={(c, sc) => setForm(p => (p ? { ...p, category: c, subcategory: sc } : p))} />
        <label className="lbl" htmlFor="loc">Location</label>
        <input type="text" id="loc" maxLength={120} value={f.location} onChange={e => set('location', e.target.value)} />

        <label className="lbl" htmlFor="payer">Paid by</label>
        <select id="payer" value={f.payerId} onChange={e => set('payerId', e.target.value)}>
          {data.travelers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <div className="lbl">Split</div>
        <div className="seg" role="group">
          {([['equal', 'Equal'], ['percent', 'Percent'], ['exact', 'Amounts'], ['shares', 'Shares']] as Array<[SplitMode, string]>).map(([m, label]) => (
            <button key={m} type="button" aria-pressed={f.mode === m} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
        <div className="panel" style={{ marginTop: 10 }}>
          {data.travelers.map(t => {
            const on = t.id in f.entries, i = ids.indexOf(t.id)
            return (
              <div className={'srow' + (on ? '' : ' off') + (f.mode === 'equal' ? ' eq' : '')} key={t.id}>
                <label className="who"><input type="checkbox" checked={on} onChange={e => toggleWho(t.id, e.target.checked)} /><Avatar name={t.name} color={t.color} /><span>{t.name}</span></label>
                {f.mode !== 'equal' && (
                  <input className="inp sv" inputMode="decimal" disabled={!on} value={on ? f.entries[t.id] ?? '' : ''} aria-label={`${t.name} ${f.mode}`}
                    placeholder={{ percent: '%', exact: cur, shares: 'shares', equal: '' }[f.mode]}
                    onChange={e => setForm(p => (p ? { ...p, entries: { ...p.entries, [t.id]: e.target.value } } : p))} />
                )}
                <span className="pv">{on && i >= 0 && totalMinor > 0 && weights[i] > 0 ? fmtMoney(preview[i], cur) : '—'}</span>
              </div>
            )
          })}
          {(f.mode === 'percent' || f.mode === 'exact') && <div style={{ marginTop: 8 }}><button className="btn small" type="button" onClick={() => setForm(p => (p ? { ...p, entries: evenSplit(p.mode, p.entries) } : p))}>Split evenly</button></div>}
          <div className={'status ' + (v.ok ? 'ok' : 'bad')}>{v.msg}</div>
        </div>

        <div className="lbl" id="stlbl">Status</div>
        <div className="seg" role="group" aria-labelledby="stlbl">
          {STATUSES.map(s => <button key={s.id} type="button" aria-pressed={f.status === s.id} onClick={() => set('status', s.id)}>{s.label}</button>)}
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>{STATUSES.find(s => s.id === f.status)?.help} Only a label: it does not change any amount or balance.</div>

        {(vaultItems.length > 0 || f.itemId) && (
          <>
            <label className="lbl" htmlFor="vitem">Vault item</label>
            <select id="vitem" value={f.itemId} onChange={e => set('itemId', e.target.value)}>
              <option value="">None</option>
              {vaultItems.map(i => <option key={i.id} value={i.id}>{i.title}{i.description ? ' · ' + i.description : ''}</option>)}
              {f.itemId && !vaultItems.some(i => i.id === f.itemId) && <option value={f.itemId}>(a vault item you cannot see)</option>}
            </select>
            {(() => { const it = vaultItems.find(i => i.id === f.itemId); return it ? (
              <div className="vitem"><TypeIcon type={it.type} size={34} /><span className="vtx"><b>{it.title}</b>{it.description && <div className="muted small">{it.description}</div>}</span>{vaultId && <Link className="btn small" to={`/vault/${vaultId}/item/${it.id}`}>Open</Link>}</div>
            ) : null })()}
          </>
        )}

        {(planItems.length > 0 || f.planId) && (
          <>
            <label className="lbl" htmlFor="pitem">Itinerary item</label>
            <select id="pitem" value={f.planId} onChange={e => set('planId', e.target.value)}>
              <option value="">None</option>
              {planItems.map(i => <option key={i.id} value={i.id}>{i.title}{i.starts_on ? ' · ' + i.starts_on : ''} ({i.itinerary_name})</option>)}
              {f.planId && !planItems.some(i => i.id === f.planId) && <option value={f.planId}>(an itinerary item you cannot see)</option>}
            </select>
            {(() => { const it = planItems.find(i => i.id === f.planId); return it ? (
              <div className="vitem"><CategoryIcon category={it.category} size={34} /><span className="vtx"><b>{it.title}</b><div className="muted small">{it.itinerary_name}</div></span><Link className="btn small" to={`/itinerary/${it.itinerary_id}/item/${it.id}`}>Open</Link></div>
            ) : null })()}
          </>
        )}

        <label className="lbl" htmlFor="notes">Notes</label>
        <textarea id="notes" maxLength={1000} value={f.notes} onChange={e => set('notes', e.target.value)} />

        <div className="lbl">Receipts</div>
        <div className="thumbs">
          {kept.map(r => (
            <div className="th" key={r.id}>
              {r.mime === 'application/pdf'
                ? (urls[r.path] ? <a href={urls[r.path]} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>PDF</a> : 'PDF')
                : (urls[r.path] ? <img src={urls[r.path]} alt={r.name ?? 'Receipt'} onClick={() => setLight(urls[r.path])} /> : '…')}
              <button className="x" aria-label="Remove receipt" onClick={() => { setKept(k => k.filter(x => x.id !== r.id)); setRemoved(x => [...x, r]) }}>×</button>
            </div>
          ))}
          {files.map((fl, i) => (
            <div className="th" key={i}>
              {fl.type === 'application/pdf' ? 'PDF' : <img src={fl.preview} alt="New receipt" />}
              <button className="x" aria-label="Remove" onClick={() => setFiles(p => p.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {!kept.length && !files.length && <span className="muted small">No receipts attached.</span>}
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="btn" style={{ cursor: 'pointer' }}>
            <input type="file" accept="image/*,application/pdf" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            Add photo or PDF
          </label>
        </div>

        {existing && (
          <div className="muted small" style={{ marginTop: 22 }}>
            {existing.created_by && <div>Added by {userName(data, existing.created_by, user?.id ?? null)} on {new Date(existing.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
            {existing.updated_by && existing.updated_at !== existing.created_at && <div>Last edited by {userName(data, existing.updated_by, user?.id ?? null)} on {new Date(existing.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          </div>
        )}
        {existing && !readOnly && (
          <div style={{ marginTop: 18 }}>
            <button className="btn danger block" onClick={() => setConfirmDel(true)} disabled={dis}>Delete expense</button>
          </div>
        )}
        </fieldset>
      </div>
      {confirmDel && existing && (
        <ConfirmDialog title="Delete this expense?" busy={saving} onCancel={() => setConfirmDel(false)} onConfirm={remove}>
          <b>{existing.vendor || 'This expense'}</b> ({fmtMoney(toMinor(existing.amount, existing.currency), existing.currency)} on {existing.spent_on})
          {existing.receipts.length ? ` and its ${existing.receipts.length} receipt${existing.receipts.length === 1 ? '' : 's'}` : ''} will be removed for everyone in the group, and balances will change. This can’t be undone.
        </ConfirmDialog>
      )}
      {light && <button className="light" onClick={() => setLight(null)} aria-label="Close photo"><img src={light} alt="Receipt" /></button>}
    </div>
  )
}
