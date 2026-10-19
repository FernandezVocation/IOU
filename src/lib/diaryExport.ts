import { fmtDate, fmtTime, l1 } from './format'
import { packDocx, para, run, xml } from './itineraryExport'
import type { DiaryEntry } from './diary'

export interface ExportPhoto { data: Uint8Array; w: number; h: number; caption: string }
export interface DiaryExportEntry { day: string; time: string; title: string; where: string; description: string; people: string; notes: string; photos: ExportPhoto[] }
export interface DiaryExportModel { title: string; subtitle: string; entries: DiaryExportEntry[] }
export interface DiaryExportOptions { notes: boolean; photos: boolean }

/** Oldest first, like a journal. Notes and photos are included only when asked for. */
export function buildDiaryModel(
  title: string, entries: DiaryEntry[], opts: DiaryExportOptions,
  names: { trips: Record<string, string>; groups: Record<string, string> },
  photos: Record<string, ExportPhoto[]> = {}, now = new Date(),
): DiaryExportModel {
  const sorted = [...entries].sort((a, b) => a.entry_on.localeCompare(b.entry_on) || (a.entry_at ?? '').localeCompare(b.entry_at ?? '') || a.created_at.localeCompare(b.created_at))
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return {
    title,
    subtitle: `Diary · ${sorted.length} ${sorted.length === 1 ? 'entry' : 'entries'} · prepared ${d}`,
    entries: sorted.map(e => ({
      day: fmtDate(e.entry_on), time: e.entry_at ? fmtTime(e.entry_at) : '', title: e.title,
      where: [e.place, e.group_id ? names.groups[e.group_id] : '', e.itinerary_id ? names.trips[e.itinerary_id] : ''].filter(Boolean).join(' · '),
      description: e.description, people: e.people.join(', '), notes: opts.notes ? e.notes : '',
      photos: opts.photos ? photos[e.id] ?? [] : [],
    })),
  }
}

export const diaryFileName = (name: string, ext: string) => (name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'diary') + '.' + ext

/** Download each photo through its signed link and shrink it to a JPEG that keeps the file a sensible size. Browser only. */
export async function loadDiaryPhotos(items: Array<{ entryId: string; url: string; caption: string }>, maxEdge = 1400): Promise<Record<string, ExportPhoto[]>> {
  const out: Record<string, ExportPhoto[]> = {}
  for (const it of items) {
    try {
      const blob = await (await fetch(it.url)).blob()
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      const sc = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc)
      const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height)
      const jpg = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.82))
      if (!jpg) continue
      ;(out[it.entryId] ??= []).push({ data: new Uint8Array(await jpg.arrayBuffer()), w: c.width, h: c.height, caption: it.caption })
    } catch { /* a photo that cannot be read is left out */ }
  }
  return out
}

/* ───────────── Word ───────────── */
const EMU_PER_PX = 9525
/** Fit inside maxW×maxH EMU without stretching. */
export function fitEmu(w: number, h: number, maxW = 5400000, maxH = 3400000): { cx: number; cy: number } {
  const s = Math.min(maxW / (w * EMU_PER_PX), maxH / (h * EMU_PER_PX), 1)
  return { cx: Math.round(w * EMU_PER_PX * s), cy: Math.round(h * EMU_PER_PX * s) }
}
const drawing = (rid: string, id: number, name: string, w: number, h: number) => {
  const { cx, cy } = fitEmu(w, h)
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="${xml(name)}" descr="${xml(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
}

export function diaryDocumentXml(m: DiaryExportModel): { xml: string; media: Uint8Array[] } {
  const body: string[] = []; const media: Uint8Array[] = []
  body.push(para(run(m.title, { b: true, sz: 44, color: '2B44FF' }), { after: 60, style: 'Title' }))
  body.push(para(run(m.subtitle, { sz: 18, color: '5F6B66' }), { after: 240 }))
  if (!m.entries.length) body.push(para(run('No entries.')))
  let lastDay = ''
  for (const e of m.entries) {
    if (e.day !== lastDay) { body.push(para(run(e.day, { b: true, sz: 28 }), { before: 320, after: 80, keep: true, style: 'Heading1' })); lastDay = e.day }
    body.push(para((e.time ? run(e.time + '   ', { b: true, color: '2B44FF' }) : '') + run(e.title, { b: true, sz: 26 }), { before: 100, after: 20, keep: true }))
    if (e.where) body.push(para(run(e.where, { sz: 18, color: '5F6B66' }), { after: 40, indent: 360 }))
    for (const line of e.description.split(/\r?\n/)) if (line.trim()) body.push(para(run(line, { sz: 21 }), { after: 60, indent: 360 }))
    if (e.people) body.push(para(run('With: ' + e.people, { sz: 19, color: '5F6B66' }), { after: 40, indent: 360 }))
    if (e.notes) body.push(para(run('Notes: ' + e.notes, { sz: 19, color: '5F6B66' }), { after: 40, indent: 360 }))
    for (const p of e.photos) {
      media.push(p.data)
      const n = media.length
      body.push(para(drawing(`rId${99 + n}`, n, p.caption || `Photo ${n}`, p.w, p.h) , { before: 60, after: p.caption ? 0 : 100, indent: 360 }))
      if (p.caption) body.push(para(run(p.caption, { sz: 17, color: '5F6B66' }), { after: 100, indent: 360 }))
    }
  }
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
  return { media, xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${ns}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>` }
}

export async function buildDiaryDocx(m: DiaryExportModel): Promise<Blob> {
  const d = diaryDocumentXml(m)
  return packDocx(d.xml, d.media)
}

/* ───────────── PDF ───────────── */
export async function buildDiaryPdf(m: DiaryExportModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 16, ACCENT: [number, number, number] = [43, 68, 255], INK: [number, number, number] = [23, 33, 30], MUTED: [number, number, number] = [95, 107, 102]
  let y = 22
  const need = (h: number) => { if (y + h > 282) { doc.addPage(); y = 18 } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...ACCENT)
  const t = doc.splitTextToSize(l1(m.title), W - 2 * mg) as string[]; doc.text(t, mg, y); y += 9 * t.length - 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(l1(m.subtitle), mg, y + 3); y += 12
  if (!m.entries.length) { doc.setFontSize(11); doc.setTextColor(...INK); doc.text('No entries.', mg, y) }
  let lastDay = ''
  const text = (s: string, size: number, color: [number, number, number], bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color)
    for (const l of doc.splitTextToSize(l1(s), W - 2 * mg - 6) as string[]) { need(size * 0.45 + 1.5); doc.text(l, mg + 6, y); y += size * 0.43 + 1.2 }
  }
  for (const e of m.entries) {
    if (e.day !== lastDay) {
      need(24); y += 3; doc.setDrawColor(220, 225, 220); doc.line(mg, y, W - mg, y); y += 6
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(l1(e.day), mg, y); y += 7; lastDay = e.day
    }
    need(16)
    text((e.time ? e.time + '   ' : '') + e.title, 11.5, INK, true)
    if (e.where) text(e.where, 9, MUTED)
    for (const line of e.description.split(/\r?\n/)) if (line.trim()) text(line, 10, INK)
    if (e.people) text('With: ' + e.people, 9, MUTED)
    if (e.notes) text('Notes: ' + e.notes, 9, MUTED)
    for (const p of e.photos) {
      const s = Math.min(110 / p.w, 80 / p.h), w = p.w * s, h = p.h * s
      need(h + 4 + (p.caption ? 5 : 0))
      doc.addImage(p.data, 'JPEG', mg + 6, y, w, h); y += h + 2
      if (p.caption) text(p.caption, 8, MUTED)
      y += 2
    }
    y += 3
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(`${p} / ${pages}`, W - mg, 290, { align: 'right' }) }
  return doc.output('blob')
}
