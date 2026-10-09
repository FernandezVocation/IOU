import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { BreakdownRow } from '../lib/breakdown'
import { catStyle } from '../lib/categories'
import { fmtMoney } from '../lib/money'

const pct = (p: number) => (p > 0 && p < 0.01 ? '<1%' : Math.round(p * 100) + '%')

/** Colored bar of category shares, with the biggest few named underneath. */
export function CategoryBar({ cats, total }: { cats: Array<{ category: string; minor: number }>; total: number }) {
  if (total <= 0) return null
  return (
    <>
      <div className="stack" role="img" aria-label="Spending by category">
        {cats.map(c => <i key={c.category || '_'} title={c.category || 'Uncategorized'} style={{ ...catStyle(c.category), width: (c.minor / total) * 100 + '%' }} />)}
      </div>
      <div className="legend">
        {cats.slice(0, 6).map(c => <span key={c.category || '_'}><i className="dot" style={catStyle(c.category)} />{c.category || 'Uncategorized'} {pct(c.minor / total)}</span>)}
        {cats.length > 6 && <span>+{cats.length - 6} more</span>}
      </div>
    </>
  )
}

interface Props { rows: BreakdownRow[]; total: number; currency: string; swatch?: boolean }

/** Rows that open to show what is inside them, down to the individual expenses. */
export default function BreakdownList({ rows, total, currency, swatch = false }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return <div className="bl">{render(rows, total, currency, 0, swatch, open, k => setOpen(o => ({ ...o, [k]: !o[k] })))}</div>
}

function render(rows: BreakdownRow[], total: number, cur: string, depth: number, swatch: boolean, open: Record<string, boolean>, toggle: (k: string) => void) {
  const max = rows.reduce((m, r) => Math.max(m, r.minor), 0) || 1
  return rows.map(r => {
    const expandable = !!r.kids && r.kids.length > 0 && !(r.kids.length === 1 && r.kids[0].leaf && r.leaf)
    const isOpen = !!open[r.key]
    const name = (
      <span className="nl">
        {swatch && depth === 0 && r.category !== undefined && <i className="dot" style={catStyle(r.category)} />}
        <span className="t">
          <b>{r.label}</b>
          <span className="sub">{[r.meta, !r.leaf && r.count ? `${r.count} expense${r.count === 1 ? '' : 's'}` : '', r.estimated ? 'estimated' : ''].filter(Boolean).join(' · ')}</span>
        </span>
      </span>
    )
    const amount = <span className="nv"><b>{fmtMoney(r.minor, cur)}</b>{!r.leaf && <span className="sub">{pct(r.minor / (total || 1))}</span>}</span>
    return (
      <div className={'nrow' + (depth ? ' child' : '')} key={r.key}>
        {expandable
          ? <button type="button" className="nhead" aria-expanded={isOpen} onClick={() => toggle(r.key)}><span className="chev" aria-hidden>▸</span>{name}{amount}</button>
          : r.href
            ? <Link className="nhead" to={r.href}><span className="chev" aria-hidden />{name}{amount}</Link>
            : <div className="nhead"><span className="chev" aria-hidden />{name}{amount}</div>}
        {depth === 0 && !r.leaf && <div className="sbar" aria-hidden><i style={{ ...catStyle(r.category ?? ''), width: (r.minor / max) * 100 + '%' }} /></div>}
        {expandable && isOpen && <div className="kids">{render(r.kids as BreakdownRow[], total, cur, depth + 1, swatch, open, toggle)}</div>}
      </div>
    )
  })
}
