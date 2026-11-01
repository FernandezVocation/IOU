import type { GroupData } from '../lib/types'
import { filterOptions, type ExpenseFilters, type RateStatus } from '../lib/expenseFilters'

interface Props { data: GroupData; value: ExpenseFilters; onChange: (f: ExpenseFilters) => void }

const toggle = <T,>(a: T[], x: T): T[] => (a.includes(x) ? a.filter(y => y !== x) : [...a, x])
const RATE: Array<[RateStatus, string]> = [['norate', 'No rate set'], ['estimated', 'Estimated'], ['confirmed', 'Confirmed']]

/** The hidden filter panel on the Expenses tab. Each choice only appears when the group has something to choose between. */
export default function ExpenseFilterPanel({ data, value: f, onChange }: Props) {
  const o = filterOptions(data)
  const set = (p: Partial<ExpenseFilters>) => onChange({ ...f, ...p })
  const people = data.travelers
  return (
    <div className="panel fpanel">
      <span className="lbl" id="ef-rate" style={{ marginTop: 0 }}>Amount</span>
      <div className="chips" role="group" aria-labelledby="ef-rate" style={{ marginTop: 0 }}>
        {RATE.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={f.rate.includes(k)} onClick={() => set({ rate: toggle(f.rate, k) })}>{l}</button>)}
      </div>

      {people.length > 1 && (
        <>
          <span className="lbl" id="ef-by">Paid by</span>
          <div className="chips" role="group" aria-labelledby="ef-by" style={{ marginTop: 0 }}>
            {people.map(t => <button key={t.id} type="button" className="chip" aria-pressed={f.paidBy.includes(t.id)} onClick={() => set({ paidBy: toggle(f.paidBy, t.id) })}>{t.name}</button>)}
          </div>
          <span className="lbl" id="ef-with">Split with</span>
          <div className="chips" role="group" aria-labelledby="ef-with" style={{ marginTop: 0 }}>
            {people.map(t => <button key={t.id} type="button" className="chip" aria-pressed={f.splitWith.includes(t.id)} onClick={() => set({ splitWith: toggle(f.splitWith, t.id) })}>{t.name}</button>)}
          </div>
        </>
      )}

      {o.cats.length > 1 && (
        <div className="row2">
          <div>
            <label className="lbl" htmlFor="ef-cat">Category</label>
            <select id="ef-cat" value={f.category} onChange={e => set({ category: e.target.value, subcategory: '' })}>
              <option value="">All</option>{o.cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {f.category && o.subsOf(f.category).length > 0 && (
            <div>
              <label className="lbl" htmlFor="ef-sub">Sub-category</label>
              <select id="ef-sub" value={f.subcategory} onChange={e => set({ subcategory: e.target.value })}>
                <option value="">All</option>{o.subsOf(f.category).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {o.types.length > 1 && (
        <div className="row2">
          <div>
            <label className="lbl" htmlFor="ef-pay">Paid with</label>
            <select id="ef-pay" value={f.payType} onChange={e => set({ payType: e.target.value, paySub: '' })}>
              <option value="">All</option>{o.types.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          {f.payType && o.paySubsOf(f.payType).length > 1 && (
            <div>
              <label className="lbl" htmlFor="ef-psub">Subtype</label>
              <select id="ef-psub" value={f.paySub} onChange={e => set({ paySub: e.target.value })}>
                <option value="">All</option>{o.paySubsOf(f.payType).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {(o.currencies.length > 1 || o.cards.length > 1) && (
        <div className="row2">
          {o.currencies.length > 1 && (
            <div>
              <label className="lbl" htmlFor="ef-cur">Bill currency</label>
              <select id="ef-cur" value={f.currency} onChange={e => set({ currency: e.target.value })}>
                <option value="">All</option>{o.currencies.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
          {o.cards.length > 1 && (
            <div>
              <label className="lbl" htmlFor="ef-card">Card currency</label>
              <select id="ef-card" value={f.card} onChange={e => set({ card: e.target.value })}>
                <option value="">All</option>{o.cards.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="row2">
        <div><label className="lbl" htmlFor="ef-from">From</label><input type="date" id="ef-from" value={f.from} onChange={e => set({ from: e.target.value })} /></div>
        <div><label className="lbl" htmlFor="ef-to">To</label><input type="date" id="ef-to" value={f.to} onChange={e => set({ to: e.target.value })} /></div>
      </div>

      {o.anyReceipts && (
        <>
          <span className="lbl" id="ef-rc">Receipt</span>
          <div className="chips" role="group" aria-labelledby="ef-rc" style={{ marginTop: 0 }}>
            {([['', 'Any'], ['has', 'Has a receipt'], ['none', 'No receipt']] as const).map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={f.receipt === k} onClick={() => set({ receipt: k })}>{l}</button>)}
          </div>
        </>
      )}
    </div>
  )
}
