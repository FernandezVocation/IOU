import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { COMMON_CURRENCIES, friendly } from '../lib/format'
import { isValidCurrency, parseNum } from '../lib/money'
import { observedPairRate, pairKey, suggestPairs } from '../lib/cardRates'
import { canEditGroup } from '../lib/access'
import { currencyOption } from './currencyOption'
import { useToast } from './ui'
import { useGroup } from '../pages/GroupShell'

/** "Bill > card" exchange rates for the group: what a bill in one currency becomes on a card in another (EUR on a QAR card). */
export default function CardRates() {
  const { data, reload } = useGroup()
  const toast = useToast()
  const g = data.group
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [rate, setRate] = useState('')
  const can = canEditGroup(data)
  const pairs = suggestPairs(data)
  const choices = COMMON_CURRENCIES.filter(c => c !== g.currency)

  async function save(key: string, raw: string): Promise<boolean> {
    const n = parseNum(raw)
    let error: unknown = null
    if (raw.trim() === '') ({ error } = await supabase.from('group_rates').delete().eq('group_id', g.id).eq('currency', key))
    else if (n > 0) ({ error } = await supabase.from('group_rates').upsert({ group_id: g.id, currency: key, rate: n }, { onConflict: 'group_id,currency' }))
    else { toast('Enter a rate greater than zero.'); return false }
    if (error) { toast(friendly(error)); return false }
    await reload(); return true
  }

  return (
    <div className="sect">
      <h2>Card rates</h2>
      <div className="muted small">
        What a bill in one currency becomes on a card in another, for example a bill in EUR paid on a QAR card. The estimate then goes bill → card → {g.currency}, using the card’s own rate to {g.currency} from Exchange rates above.
        Each expense can use its own card, and any amount typed from a card statement always wins.
      </div>
      {pairs.length === 0 && <div className="muted small" style={{ marginTop: 8 }}>No card rates are needed yet. They appear when an expense is in a foreign currency and someone’s card is in a different one.</div>}
      {pairs.map(([b, c]) => {
        const key = pairKey(b, c), cur = data.rates[key], seen = observedPairRate(data, b, c)
        return (
          <div className="panel" key={key}>
            <div className="rate"><b>1 {b} =</b>
              <input type="text" className="inp" inputMode="decimal" disabled={!can} defaultValue={cur ?? ''} key={key + (cur ?? '')} placeholder="rate" aria-label={`Rate for ${b} on a ${c} card`}
                onBlur={e => { if (e.target.value !== String(cur ?? '')) void save(key, e.target.value) }} />
              <b>{c}</b></div>
            {seen ? <div className="muted small">Average of {seen.count} from statements: {seen.rate.toFixed(4)} {can && <button className="btn small" style={{ marginLeft: 6 }} onClick={() => void save(key, seen.rate.toFixed(6))}>Use it</button>}</div>
              : <div className="muted small">No {b} expenses with a {c} card amount yet.</div>}
          </div>
        )
      })}
      {can && (
        <div className="prow">
          <select value={from} onChange={e => setFrom(e.target.value)} aria-label="Bill currency">
            <option value="">Bill in…</option>{choices.map(c => currencyOption(c))}
          </select>
          <select value={to} onChange={e => setTo(e.target.value)} aria-label="Card currency">
            <option value="">Card in…</option>{choices.map(c => currencyOption(c))}
          </select>
          <input type="text" className="inp" inputMode="decimal" placeholder="rate" value={rate} onChange={e => setRate(e.target.value)} aria-label="Rate for the new pair" style={{ maxWidth: 90 }} />
          <button className="btn" disabled={!isValidCurrency(from) || !isValidCurrency(to) || from === to || !(parseNum(rate) > 0)}
            onClick={async () => { if (await save(pairKey(from, to), rate)) { setFrom(''); setTo(''); setRate('') } }}>Add</button>
        </div>
      )}
    </div>
  )
}
