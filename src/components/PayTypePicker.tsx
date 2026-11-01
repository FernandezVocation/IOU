import { useState } from 'react'
import { PAY_TYPES, payDef } from '../lib/payTypes'

interface Props {
  payType: string
  paySubtype: string
  /** Earlier expenses in this group, so a custom type or subtype typed once is offered to everyone. */
  history: Array<{ pay_type?: string; pay_subtype?: string }>
  onChange: (type: string, subtype: string) => void
}

const uniq = (a: string[]) => [...new Set(a)]

/** How it was paid: type chips, then subtype chips for the chosen type. Both levels accept any typed text via "Custom…". */
export default function PayTypePicker({ payType, paySubtype, history, onChange }: Props) {
  const def = payDef(payType)
  const [customType, setCustomType] = useState(() => !!payType && !payDef(payType))
  const [customSub, setCustomSub] = useState(() => !!paySubtype && !def?.subs.includes(paySubtype))

  const rememberedTypes = uniq(history.map(h => h.pay_type ?? '').filter(t => t && !payDef(t)))
  const knownSubs = def?.subs ?? []
  const rememberedSubs = uniq(history.filter(h => h.pay_type === payType && h.pay_subtype && !knownSubs.includes(h.pay_subtype)).map(h => h.pay_subtype as string))

  const pickType = (t: string) => { setCustomType(false); setCustomSub(false); onChange(payType === t ? '' : t, payType === t ? '' : (payType === t ? paySubtype : '')) }
  const pickRemembered = (t: string) => { setCustomType(true); setCustomSub(false); onChange(payType === t ? '' : t, payType === t ? '' : '') }
  const pickCustomType = () => { setCustomType(true); setCustomSub(false); if (payDef(payType)) onChange('', '') }
  const pickSub = (s: string) => { setCustomSub(false); onChange(payType, paySubtype === s ? '' : s) }

  const customTypeActive = customType && !rememberedTypes.includes(payType)
  const customSubActive = customSub && !rememberedSubs.includes(paySubtype)

  return (
    <div>
      <span className="lbl" id="pay-l">Paid with <span className="muted">(optional)</span></span>
      <div className="chips" role="group" aria-labelledby="pay-l" style={{ marginTop: 0 }}>
        {PAY_TYPES.map(t => <button type="button" key={t.name} className="chip" aria-pressed={!customType && payType === t.name} onClick={() => pickType(t.name)}>{t.name}</button>)}
        {rememberedTypes.map(t => <button type="button" key={'r' + t} className="chip" aria-pressed={customType && payType === t} onClick={() => pickRemembered(t)}>{t}</button>)}
        <button type="button" className="chip dashed" aria-pressed={customTypeActive} onClick={pickCustomType}>Custom…</button>
      </div>

      {customType && (
        <>
          <label className="lbl" htmlFor="paytype">Custom payment type <span className="muted">(type anything)</span></label>
          <input type="text" id="paytype" maxLength={60} autoComplete="off" placeholder="e.g. Gift card, Points" value={payType} onChange={e => onChange(e.target.value, e.target.value.trim() ? paySubtype : '')} />
        </>
      )}

      {payType.trim() !== '' && (
        <>
          <span className="lbl" id="paysub-l">Subtype <span className="muted">(optional)</span></span>
          <div className="chips" role="group" aria-labelledby="paysub-l" style={{ marginTop: 0 }}>
            {knownSubs.map(s => <button type="button" key={s} className="chip" aria-pressed={!customSub && paySubtype === s} onClick={() => pickSub(s)}>{s}</button>)}
            {rememberedSubs.map(s => <button type="button" key={'r' + s} className="chip" aria-pressed={paySubtype === s} onClick={() => { setCustomSub(true); onChange(payType, paySubtype === s ? '' : s) }}>{s}</button>)}
            <button type="button" className="chip dashed" aria-pressed={customSubActive} onClick={() => { setCustomSub(true); if (knownSubs.includes(paySubtype)) onChange(payType, '') }}>Custom…</button>
          </div>
          {customSub && (
            <>
              <label className="lbl" htmlFor="paysub">Custom subtype</label>
              <input type="text" id="paysub" maxLength={60} autoComplete="off" placeholder="type anything" value={paySubtype} onChange={e => onChange(payType, e.target.value)} />
            </>
          )}
        </>
      )}
    </div>
  )
}
