import { useState } from 'react'
import { currencyOption } from './currencyOption'
import { isValidCurrency } from '../lib/money'

interface Props {
  id?: string
  ariaLabel?: string
  className?: string
  value: string
  choices: string[]
  disabled?: boolean
  onChange: (code: string) => void
}

/**
 * A currency list with an "Other…" entry that takes any three-letter code, so the list is never a limit.
 * The value is always a valid code; the typed code is only passed up once it is valid.
 */
export function CurrencySelect({ id, ariaLabel, className, value, choices, disabled, onChange }: Props) {
  const [other, setOther] = useState(false)
  const [text, setText] = useState('')
  const list = [...new Set([value, ...choices].filter(Boolean))]
  return (
    <>
      <select id={id} className={className} aria-label={ariaLabel} disabled={disabled} value={other ? '__other' : value}
        onChange={e => {
          if (e.target.value === '__other') { setOther(true); setText(''); return }
          setOther(false); onChange(e.target.value)
        }}>
        {list.map(c => currencyOption(c))}
        <option value="__other">Other…</option>
      </select>
      {other && (
        <input type="text" className="inp" maxLength={3} placeholder="e.g. PLN" value={text} style={{ marginTop: 6, textTransform: 'uppercase' }}
          aria-label={ariaLabel ? `${ariaLabel} – currency code` : 'Currency code'} autoFocus
          onChange={e => {
            const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '')
            setText(v)
            if (v.length === 3 && isValidCurrency(v)) { onChange(v); setOther(false) }
          }} />
      )}
    </>
  )
}
