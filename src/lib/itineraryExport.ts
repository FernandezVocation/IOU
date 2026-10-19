import { arrange, kindLabel, whenLabel, type ItineraryItem } from './itinerary'
import { spendLabel, type Spend } from './itinerarySpend'
import { fmtTime, l1 } from './format'

export interface ExportOptions { notes: boolean; amounts: boolean }
export interface ExportEntry { time: string; title: string; lines: string[] }
export interface ExportDay { heading: string; sub: string; entries: ExportEntry[] }
export interface ExportModel { title: string; subtitle: string; days: ExportDay[] }

/**
 * What goes on the printed plan. Only me items are never included, and notes and amounts are left out unless asked for,
 * the same rule as read-only links. Vault tickets and files are never part of it.
 */
export function buildExportModel(name: string, items: ItineraryItem[], opts: ExportOptions, spend: Spend | null, now = new Date()): ExportModel {
  const shown = items.filter(i => !i.private)
  const days: ExportDay[] = arrange(shown, 'date').map(s => ({
    heading: s.label,
    sub: s.sub ?? '',
    entries: s.items.map(i => {
      const route = i.from_place && i.to_place ? `${i.from_place} → ${i.to_place}` : ''
      const when = whenLabel(i)
      const cost = opts.amounts && spend?.byItem[i.id] ? spendLabel(spend.byItem[i.id], spend.currency) : ''
      const lines = [
        [kindLabel(i), i.description].filter(Boolean).join(' · '),
        route,
        [i.place, i.address].filter(Boolean).join(', '),
        i.vendor ? `Vendor: ${i.vendor}` : '',
        i.starts_on && (i.ends_on || i.ends_at) ? `When: ${when}` : '',
        i.people.length ? `Who: ${i.people.join(', ')}` : '',
        i.website ? i.website : '',
        opts.notes && i.notes ? `Notes: ${i.notes}` : '',
        cost ? `Cost: ${cost}` : '',
      ].filter(Boolean)
      return { time: i.starts_at ? fmtTime(i.starts_at) : '', title: i.title, lines }
    }),
  }))
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { title: name, subtitle: `Itinerary · ${shown.length} ${shown.length === 1 ? 'item' : 'items'} · times are local to each place · prepared ${d}`, days }
}

export const exportFileName = (name: string, ext: string) => (name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'itinerary') + '.' + ext

/* ───────────── Word (.docx), built by hand with JSZip so no new package is needed ───────────── */
// eslint-disable-next-line no-control-regex
const xml = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const run = (t: string, o: { b?: boolean; sz?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`
const para = (runs: string, o: { before?: number; after?: number; keep?: boolean; indent?: number; style?: string } = {}) =>
  `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keep ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}"/>${o.indent ? `<w:ind w:left="${o.indent}"/>` : ''}</w:pPr>${runs}</w:p>`

export function docxDocumentXml(m: ExportModel): string {
  const body: string[] = []
  body.push(para(run(m.title, { b: true, sz: 44, color: '2B44FF' }), { after: 60, style: 'Title' }))
  body.push(para(run(m.subtitle, { sz: 18, color: '5F6B66' }), { after: 240 }))
  if (!m.days.length) body.push(para(run('Nothing planned yet.')))
  for (const d of m.days) {
    body.push(para(run(d.heading, { b: true, sz: 28 }) + (d.sub ? run('   ' + d.sub, { sz: 18, color: '5F6B66' }) : ''), { before: 280, after: 80, keep: true, style: 'Heading1' }))
    for (const e of d.entries) {
      body.push(para((e.time ? run(e.time + '   ', { b: true, color: '2B44FF' }) : '') + run(e.title, { b: true, sz: 24 }), { before: 100, after: 20, keep: true }))
      for (const l of e.lines) body.push(para(run(l, { sz: 20 }), { after: 20, indent: 360 }))
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
}

export async function buildItineraryDocx(m: ExportModel): Promise<Blob> {
  const JSZip = (await import('jszip')).default
  const z = new JSZip()
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  z.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style></w:styles>')
  z.file('word/document.xml', docxDocumentXml(m))
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

/* ───────────── PDF ───────────── */
export async function buildItineraryPdf(m: ExportModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 16, ACCENT: [number, number, number] = [43, 68, 255], INK: [number, number, number] = [23, 33, 30], MUTED: [number, number, number] = [95, 107, 102]
  let y = 22
  const need = (h: number) => { if (y + h > 282) { doc.addPage(); y = 18 } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...ACCENT)
  const t = doc.splitTextToSize(l1(m.title), W - 2 * mg) as string[]; doc.text(t, mg, y); y += 9 * t.length - 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  const sub = doc.splitTextToSize(l1(m.subtitle), W - 2 * mg) as string[]; doc.text(sub, mg, y + 3); y += 4 * sub.length + 8
  if (!m.days.length) { doc.setFontSize(11); doc.setTextColor(...INK); doc.text('Nothing planned yet.', mg, y) }
  for (const d of m.days) {
    need(26)
    y += 3
    doc.setDrawColor(220, 225, 220); doc.line(mg, y, W - mg, y); y += 6
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(l1(d.heading), mg, y)
    if (d.sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(l1(d.sub), W - mg, y, { align: 'right', maxWidth: 110 }) }
    y += 6
    for (const e of d.entries) {
      const lines = e.lines.flatMap(l => doc.splitTextToSize(l1(l), W - 2 * mg - 28) as string[])
      need(7 + lines.length * 4.2)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...ACCENT); if (e.time) doc.text(l1(e.time), mg, y)
      doc.setTextColor(...INK); doc.setFontSize(11); doc.text(l1(e.title), mg + 24, y, { maxWidth: W - 2 * mg - 24 }); y += 5
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
      for (const l of lines) { need(5); doc.text(l, mg + 24, y); y += 4.2 }
      y += 2.5
    }
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(`${p} / ${pages}`, W - mg, 290, { align: 'right' }) }
  return doc.output('blob')
}
