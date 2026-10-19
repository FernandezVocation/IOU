import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { signedPhotoUrls, type DiaryEntry } from '../lib/diary'
import { buildDiaryDocx, buildDiaryModel, buildDiaryPdf, diaryFileName, loadDiaryPhotos } from '../lib/diaryExport'
import { fmtDate } from '../lib/format'
import { Sheet, useToast } from './ui'

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Word and/or PDF of chosen diary entries. Notes and photos are off unless ticked. */
export default function DiaryExport({ entries, trips, groups, title, onClose }: {
  entries: DiaryEntry[]; trips: Record<string, string>; groups: Record<string, string>; title: string; onClose: () => void
}) {
  const toast = useToast()
  const [word, setWord] = useState(true)
  const [pdf, setPdf] = useState(false)
  const [notes, setNotes] = useState(false)
  const [photos, setPhotos] = useState(true)
  const [chosen, setChosen] = useState<Set<string>>(new Set(entries.map(e => e.id)))
  const [busy, setBusy] = useState(false)
  const toggle = (id: string) => setChosen(c => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function go() {
    if (!word && !pdf) { toast('Choose Word, PDF or both.'); return }
    const picked = entries.filter(e => chosen.has(e.id))
    if (!picked.length) { toast('Choose at least one entry.'); return }
    setBusy(true)
    try {
      let byEntry: Awaited<ReturnType<typeof loadDiaryPhotos>> = {}
      if (photos) {
        const ph = await supabase.from('diary_photos').select('entry_id, path, caption').in('entry_id', picked.map(e => e.id)).order('path')
        const rows = (ph.data ?? []) as Array<{ entry_id: string; path: string; caption: string }>
        const urls = await signedPhotoUrls(rows.map(r => r.path))
        byEntry = await loadDiaryPhotos(rows.filter(r => urls[r.path]).map(r => ({ entryId: r.entry_id, url: urls[r.path], caption: r.caption })))
      }
      const m = buildDiaryModel(title, picked, { notes, photos }, { trips, groups }, byEntry)
      if (word) save(await buildDiaryDocx(m), diaryFileName(title, 'docx'))
      if (pdf) save(await buildDiaryPdf(m), diaryFileName(title, 'pdf'))
      toast(word && pdf ? 'Downloaded Word and PDF.' : 'Downloaded.')
    } catch { toast('Could not create the file. Try again.') }
    setBusy(false)
  }

  return (
    <Sheet title="Export the diary" onClose={onClose}>
      <div className="muted small">Entries come out oldest first. Google Docs can open the Word file.</div>
      <div className="sect">
        <h2>Entries <button type="button" className="btn small" onClick={() => setChosen(chosen.size === entries.length ? new Set() : new Set(entries.map(e => e.id)))}>{chosen.size === entries.length ? 'None' : 'All'}</button></h2>
        {entries.map(e => <label className="radio" key={e.id}><input type="checkbox" checked={chosen.has(e.id)} onChange={() => toggle(e.id)} />{e.title}<span className="muted small"> · {fmtDate(e.entry_on)}</span></label>)}
      </div>
      <div className="sect">
        <h2>Format</h2>
        <label className="radio"><input type="checkbox" checked={word} onChange={e => setWord(e.target.checked)} />Word (.docx)</label>
        <label className="radio"><input type="checkbox" checked={pdf} onChange={e => setPdf(e.target.checked)} />PDF</label>
      </div>
      <div className="sect">
        <h2>Include</h2>
        <label className="radio"><input type="checkbox" checked disabled />Title, description, place, date, time and people</label>
        <label className="radio"><input type="checkbox" checked={photos} onChange={e => setPhotos(e.target.checked)} />Photos<span className="muted small"> · makes the file larger</span></label>
        <label className="radio"><input type="checkbox" checked={notes} onChange={e => setNotes(e.target.checked)} />Notes</label>
      </div>
      <button className="btn primary block" disabled={busy} onClick={go}>{busy ? 'Creating…' : 'Download'}</button>
    </Sheet>
  )
}
