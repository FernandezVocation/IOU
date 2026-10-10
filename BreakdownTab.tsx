import { useMemo, useState } from 'react'
import { buildBreakdown, type By, type Metric } from '../lib/breakdown'
import { fmtMoney } from '../lib/money'
import BreakdownList, { CategoryBar } from '../components/BreakdownList'
import { useGroup } from './GroupShell'

const MODES: Array<[By, string]> = [['category', 'Category'], ['sub', 'Sub-category'], ['date', 'Date'], ['vendor', 'Vendor']]

/** Where the money went: every expense in the group, grouped four ways. */
export default function BreakdownTab() {
  const { data } = useGroup()
  const cur = data.group.currency
  const [by, setBy] = useState<By>('category')
  const [metric, setMetric] = useState<Metric>('total')
  const b = useMemo(() => buildBreakdown(data, by, metric), [data, by, metric])
  const canMine = !!data.me

  if (!data.expenses.length) return <div className="empty"><b>Nothing to break down yet</b>Add an expense and it shows up here by category, date and vendor.</div>

  return (
    <div>
      <span className="lbl" id="bd-by">Group by</span>
      <div className="seg fit" role="group" aria-labelledby="bd-by">
        {MODES.map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}
      </div>
      {canMine && (
        <>
          <span className="lbl" id="bd-m">Amounts</span>
          <div className="seg" role="group" aria-labelledby="bd-m">
            <button aria-pressed={metric === 'total'} onClick={() => setMetric('total')}>Total spent</button>
            <button aria-pressed={metric === 'mine'} onClick={() => setMetric('mine')}>My share</button>
          </div>
        </>
      )}
      <div className="panel">
        <div className="muted small">{metric === 'total' ? 'Total spent' : 'Your share'}</div>
        <div className="big" style={{ font: '700 30px/1.1 var(--display)' }}>{fmtMoney(b.total, cur)}</div>
        <CategoryBar cats={b.cats} total={b.total} />
      </div>
      {b.rows.length > 0
        ? <div className="panel" style={{ paddingBlock: 4 }}><BreakdownList key={by + metric} rows={b.rows} total={b.total} currency={cur} swatch={by === 'category' || by === 'sub'} /></div>
        : <div className="empty"><b>Nothing here</b>No expenses include you.</div>}
      <div className="muted small">
        {b.notMine > 0 && `${b.notMine} expense${b.notMine === 1 ? ' doesn’t' : 's don’t'} include you, so ${b.notMine === 1 ? 'it is' : 'they are'} left out of My share. `}
        {b.missing > 0 && `${b.missing} expense${b.missing === 1 ? ' has' : 's have'} no exchange rate and ${b.missing === 1 ? 'is' : 'are'} not counted. `}
        {b.estimated > 0 && `${b.estimated} counted at an estimated rate. `}
        Tap a row to see what’s in it.
      </div>
    </div>
  )
}
