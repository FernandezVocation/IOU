import { useState } from 'react'
import { GROUP_KINDS } from '../lib/categories'

interface Props { value: string; onChange: (v: string) => void; id?: string }

/** What the group is for. Suggestions plus "Custom…", which takes any text. */
export default function KindPicker({ value, onChange, id = 'kind' }: Props) {
  const [custom, setCustom] = useState(() => !!value && !GROUP_KINDS.includes(value))
  return (
    <div>
      <div className="chips" role="group" aria-label="Group type" style={{ marginTop: 0 }}>
        {GROUP_KINDS.map(k => <button type="button" key={k} className="chip" aria-pressed={!custom && value === k} onClick={() => { setCustom(false); onChange(k) }}>{k}</button>)}
        <button type="button" className="chip dashed" aria-pressed={custom} onClick={() => { setCustom(true); if (GROUP_KINDS.includes(value)) onChange('') }}>Custom…</button>
      </div>
      {custom && <input type="text" id={id} maxLength={40} autoComplete="off" placeholder="e.g. Book club, Wedding, Road trip" value={value} onChange={e => onChange(e.target.value)} aria-label="Custom group type" />}
    </div>
  )
}
