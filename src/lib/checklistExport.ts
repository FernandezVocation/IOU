import { l1 } from './format'
import { packDocx, para, run } from './itineraryExport'
import {
  dueText, groupItems, statusLabel, typeLabel, whoName,
  type ChecklistItem, type Ctx, type Filters, type GroupBy, type Person,
} from './checklist'

export interface ChecklistExportOptions { notes: boolean; details: boolean }
export interface ExportRow { status: ChecklistItem['status']; title: string; lines: string[]; notes: string }
export interface ExportSection { heading: string; count: number; rows: ExportRow[] }
export interface ChecklistExportModel { title: string; subtitle: string; sections: ExportSection[] }

/** Plain-words summary of the choices that narrowed the export, shown under the title. */
export function describeFilters(f: Filters, people: Person[], groupBy: GroupBy, me: string): string {
  const parts: string[] = []
  if (f.type !== 'all') parts.push('Type: ' + (f.type.startsWith('c:') ? f.type.slice(2) : typeLabel({ type: f.type as ChecklistItem['type'], type_label: '' })))
  if (f.status !== 'all') parts.push('Status: ' + (f.status === 'open' ? 'Not done' : statusLabel(f.status)))
  if (f.assignee !== 'all') parts.push('Assigned to: ' + (f.assignee === 'me' ? 'Me' : f.assignee === 'none' ? 'Unassigned' : people.find(p => p.key === f.assignee)?.name ?? 'Someone'))
  if (f.doneBy !== 'all') { const p = people.find(x => x.key === f.doneBy); parts.push('Completed by: ' + (p ? (p.user === me ? 'Me' : p.name) : 'Someone')) }
  const when: Record<string, string> = { overdue: 'Overdue', today: 'Due today', week: 'Due in the next 7 days', none: 'No due date' }
  if (f.when in when) parts.push(when[f.when])
  if (f.when === 'range') parts.push(`Due ${f.from ? 'from ' + dueText(f.from) : ''}${f.from && f.to ? ' ' : ''}${f.to ? 'to ' + dueText(f.to) : ''}`.trim())
  if (groupBy !== 'none') parts.push('Grouped by ' + ({ status: 'status', due: 'due date', assignee: 'person', type: 'type' } as Record<string, string>)[groupBy])
  return parts.join(' · ')
}

export function buildChecklistModel(
  title: string, items: ChecklistItem[], opts: ChecklistExportOptions, groupBy: GroupBy, ctx: Ctx, people: Person[],
  extra: { listNames?: Record<string, string>; filterText?: string; now?: Date } = {},
): ChecklistExportModel {
  const now = extra.now ?? new Date()
  const sections = groupItems(items, groupBy, ctx, people).map(s => ({
    heading: s.label || 'Items', count: s.items.length,
    rows: s.items.map(i => {
      const lines: string[] = []
      const bits: string[] = [typeLabel(i)]
      if (extra.listNames?.[i.checklist_id]) bits.push('List: ' + extra.listNames[i.checklist_id])
      if (i.status === 'in_progress') bits.push('In progress')
      if (i.due_on) bits.push('Due ' + dueText(i.due_on) + (i.status !== 'completed' && i.due_on < ctx.today ? ' (overdue)' : ''))
      if (i.assigned_user || i.assigned_name) bits.push('Assigned to ' + (whoName(i.assigned_name, i.assigned_user, people) || 'someone'))
      if (i.status === 'completed' && (i.completed_by_user || i.completed_by_name)) bits.push('Done by ' + (whoName(i.completed_by_name, i.completed_by_user, people) || 'someone'))
      lines.push(bits.join(' · '))
      if (opts.details) {
        const d: string[] = []
        if (i.qty > 1) d.push('Quantity ' + i.qty)
        if (i.type === 'packing' && i.packed_in) d.push('Packed in ' + i.packed_in)
        if (i.type === 'purchase' && i.est_amount != null) d.push(`Estimated ${i.est_currency ?? ''} ${i.est_amount}`.replace('  ', ' '))
        if (i.booking_ref) d.push('Booking code ' + i.booking_ref)
        if (d.length) lines.push(d.join(' · '))
      }
      return { status: i.status, title: i.title, lines, notes: opts.notes ? i.notes : '' }
    }),
  }))
  const total = items.length, done = items.filter(i => i.status === 'completed').length
  const sub = [`${total} item${total === 1 ? '' : 's'}`, `${done} done`, 'Made ' + now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })]
  return { title, subtitle: sub.join(' · ') + (extra.filterText ? '\n' + extra.filterText : ''), sections }
}

export const checklistFileName = (name: string, ext: string) => (name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'checklist') + '.' + ext
const BOX: Record<ChecklistItem['status'], string> = { todo: '☐', in_progress: '◐', completed: '☑' }
const PDF_BOX: Record<ChecklistItem['status'], string> = { todo: '[ ]', in_progress: '[~]', completed: '[x]' }

export function checklistDocumentXml(m: ChecklistExportModel): string {
  const body: string[] = []
  body.push(para(run(m.title, { b: true, sz: 44, color: '2B44FF' }), { after: 60, style: 'Title' }))
  m.subtitle.split('\n').forEach((l, k, a) => body.push(para(run(l, { sz: 18, color: '5F6B66' }), { after: k === a.length - 1 ? 240 : 20 })))
  if (!m.sections.length || m.sections.every(s => !s.rows.length)) body.push(para(run('No items match.')))
  for (const s of m.sections) {
    if (!s.rows.length) continue
    if (s.heading !== 'Items') body.push(para(run(s.heading, { b: true, sz: 28 }) + run('   ' + s.count, { sz: 18, color: '5F6B66' }), { before: 280, after: 80, keep: true, style: 'Heading1' }))
    for (const r of s.rows) {
      body.push(para(run(BOX[r.status] + '  ', { sz: 24, color: r.status === 'completed' ? '1E7A42' : '2B44FF' }) + run(r.title, { b: true, sz: 23 }), { before: 100, after: 20, keep: true }))
      r.lines.forEach(l => body.push(para(run(l, { sz: 19, color: '5F6B66' }), { after: 20, indent: 420 })))
      if (r.notes) for (const l of r.notes.split(/\r?\n/)) if (l.trim()) body.push(para(run(l, { sz: 20 }), { after: 20, indent: 420 }))
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1000" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`
}
export const buildChecklistDocx = (m: ChecklistExportModel): Promise<Blob> => packDocx(checklistDocumentXml(m))

export async function buildChecklistPdf(m: ChecklistExportModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 16, ACCENT: [number, number, number] = [43, 68, 255], INK: [number, number, number] = [23, 33, 30], MUTED: [number, number, number] = [95, 107, 102]
  let y = 22
  const need = (h: number) => { if (y + h > 282) { doc.addPage(); y = 18 } }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...ACCENT)
  const t = doc.splitTextToSize(l1(m.title), W - 2 * mg) as string[]; doc.text(t, mg, y); y += 9 * t.length - 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  for (const l of m.subtitle.split('\n').flatMap(x => doc.splitTextToSize(l1(x), W - 2 * mg) as string[])) { doc.text(l, mg, y + 3); y += 4.2 }
  y += 6
  if (m.sections.every(s => !s.rows.length)) { doc.setFontSize(11); doc.setTextColor(...INK); doc.text('No items match.', mg, y) }
  for (const s of m.sections) {
    if (!s.rows.length) continue
    if (s.heading !== 'Items') {
      need(22); y += 3; doc.setDrawColor(220, 225, 220); doc.line(mg, y, W - mg, y); y += 6
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK); doc.text(l1(s.heading), mg, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(String(s.count), W - mg, y, { align: 'right' }); y += 7
    }
    for (const r of s.rows) {
      const lines = [...r.lines, ...(r.notes ? r.notes.split(/\r?\n/).filter(x => x.trim()) : [])].flatMap(l => doc.splitTextToSize(l1(l), W - 2 * mg - 14) as string[])
      need(7 + lines.length * 4.2)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...(r.status === 'completed' ? [30, 122, 66] as [number, number, number] : ACCENT)); doc.text(PDF_BOX[r.status], mg, y)
      doc.setTextColor(...INK); doc.setFontSize(11); doc.text(l1(r.title), mg + 10, y, { maxWidth: W - 2 * mg - 10 }); y += 5
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
      for (const l of lines) { need(5); doc.text(l, mg + 10, y); y += 4.2 }
      y += 2.5
    }
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(`${p} / ${pages}`, W - mg, 290, { align: 'right' }) }
  return doc.output('blob')
}
