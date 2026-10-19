import { useState } from 'react'
import { buildExportModel, buildItineraryDocx, buildItineraryPdf, exportFileName } from '../lib/itineraryExport'
import { Sheet, useToast } from './ui'
import { useItinerary } from '../pages/ItineraryShell'

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** A printable trip plan as Word, PDF or both. Notes and amounts are off unless ticked; Only me items and vault files are never included. */
export default function ItineraryExport({ onClose }: { onClose: () => void }) {
  const { data } = useItinerary()
  const toast = useToast()
  const [word, setWord] = useState(true)
  const [pdf, setPdf] = useState(true)
  const [notes, setNotes] = useState(false)
  const [amounts, setAmounts] = useState(false)
  const [busy, setBusy] = useState(false)
  const hasAmounts = !!data.spend && Object.keys(data.spend.byItem).length > 0
  const hidden = data.items.filter(i => i.private).length

  async function go() {
    if (!word && !pdf) { toast('Choose Word, PDF or both.'); return }
    setBusy(true)
    try {
      const m = buildExportModel(data.itinerary.name, data.items, { notes, amounts: amounts && hasAmounts }, data.spend)
      if (word) save(await buildItineraryDocx(m), exportFileName(data.itinerary.name, 'docx'))
      if (pdf) save(await buildItineraryPdf(m), exportFileName(data.itinerary.name, 'pdf'))
      toast(word && pdf ? 'Downloaded Word and PDF.' : 'Downloaded.')
    } catch { toast('Could not create the file. Try again.') }
    setBusy(false)
  }

  return (
    <Sheet title="Export the plan" onClose={onClose}>
      <div className="muted small">A printable trip plan, day by day. Google Docs can open the Word file.</div>
      <div className="sect">
        <h2>Format</h2>
        <label className="radio"><input type="checkbox" checked={word} onChange={e => setWord(e.target.checked)} />Word (.docx)</label>
        <label className="radio"><input type="checkbox" checked={pdf} onChange={e => setPdf(e.target.checked)} />PDF</label>
      </div>
      <div className="sect">
        <h2>Include</h2>
        <label className="radio"><input type="checkbox" checked disabled />Dates, times, places, vendors and people</label>
        <label className="radio"><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} />Notes and instructions<span className="muted small"> · off by default, notes can hold door codes</span></label>
        {hasAmounts && <label className="radio"><input type="checkbox" checked={amounts} onChange={e => setAmounts(e.target.checked)} />What each item cost<span className="muted small"> · you can see this as a group member</span></label>}
        <div className="notice" style={{ marginTop: 10 }}>Vault tickets, QR codes and files are never included.{hidden > 0 ? ` Your ${hidden} Only me ${hidden === 1 ? 'item is' : 'items are'} left out.` : ' Only me items are left out.'}</div>
      </div>
      <button className="btn primary block" disabled={busy} onClick={go}>{busy ? 'Creating…' : 'Download'}</button>
    </Sheet>
  )
}
