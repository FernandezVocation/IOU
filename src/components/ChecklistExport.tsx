import { useMemo, useState } from 'react'
import { Sheet, useToast } from './ui'
import { FilterFields } from './ChecklistRows'
import { buildChecklistDocx, buildChecklistModel, buildChecklistPdf, checklistFileName, describeFilters } from '../lib/checklistExport'
import { customTypeLabels, filterItems, iconByLabel, type ChecklistItem, type Ctx, type Filters, type GroupBy, type Person } from '../lib/checklist'

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Word and/or PDF of a list. Starts from the filters on screen; every choice can be changed here. */
export default function ChecklistExport({ items, title, people, ctx, listNames, startFilters, startGroupBy, onClose }: {
  items: ChecklistItem[]; title: string; people: Person[]; ctx: Ctx; listNames?: Record<string, string>
  startFilters: Filters; startGroupBy: GroupBy; onClose: () => void
}) {
  const toast = useToast()
  const [filters, setFilters] = useState<Filters>({ ...startFilters, q: '' })
  const [groupBy, setGroupBy] = useState<GroupBy>(startGroupBy)
  const [word, setWord] = useState(true)
  const [pdf, setPdf] = useState(false)
  const [notes, setNotes] = useState(false)
  const [details, setDetails] = useState(true)
  const [busy, setBusy] = useState(false)
  const picked = useMemo(() => filterItems(items, filters, ctx), [items, filters, ctx])

  async function go() {
    if (!word && !pdf) { toast('Choose Word, PDF or both.'); return }
    if (!picked.length) { toast('No items match these choices.'); return }
    setBusy(true)
    try {
      const m = buildChecklistModel(title, picked, { notes, details }, groupBy, ctx, people, { listNames, filterText: describeFilters(filters, people, groupBy, ctx.me ?? '') })
      if (word) save(await buildChecklistDocx(m), checklistFileName(title, 'docx'))
      if (pdf) save(await buildChecklistPdf(m), checklistFileName(title, 'pdf'))
      toast(word && pdf ? 'Downloaded Word and PDF.' : 'Downloaded.')
    } catch { toast('Could not create the file. Try again.') }
    setBusy(false)
  }

  return (
    <Sheet title="Export" onClose={onClose}>
      <div className="muted small">Choose what goes in the file. Google Docs can open the Word file.</div>
      <div className="sect">
        <h2>What to include</h2>
        <FilterFields idp="cke" filters={filters} onChange={setFilters} groupBy={groupBy} onGroupBy={setGroupBy} people={people}
          customLabels={customTypeLabels(items)} icons={iconByLabel(items)} me={ctx.me ?? ''} />
        <div className="muted small" style={{ marginTop: 10 }} role="status">{picked.length} of {items.length} item{items.length === 1 ? '' : 's'} will be exported.</div>
      </div>
      <div className="sect">
        <h2>Format</h2>
        <label className="radio"><input type="checkbox" checked={word} onChange={e => setWord(e.target.checked)} />Word (.docx)</label>
        <label className="radio"><input type="checkbox" checked={pdf} onChange={e => setPdf(e.target.checked)} />PDF</label>
      </div>
      <div className="sect">
        <h2>Details</h2>
        <label className="radio"><input type="checkbox" checked disabled />Title, status, type, due date, assigned to and completed by</label>
        <label className="radio"><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} />Quantity, packed in, estimated price, booking code</label>
        <label className="radio"><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} />Notes</label>
      </div>
      <button className="btn primary block" disabled={busy} onClick={go}>{busy ? 'Creating…' : 'Download'}</button>
    </Sheet>
  )
}
