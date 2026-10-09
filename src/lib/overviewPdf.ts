import type { Person } from './overview'
import { totalsByCurrency } from './overview'
import { fmtPlain } from './money'
import { l1 } from './format'

const ACCENT: [number, number, number] = [43, 68, 255]
const INK: [number, number, number] = [23, 33, 30]
const MUTED: [number, number, number] = [95, 107, 102]

export interface OverviewPdfInput { people: Person[]; preparedBy: string; tripNames: string[]; includeEstimates: boolean; now?: Date; title?: string }

/** A statement of what people owe you (and you owe them) across trips, with the items behind it. */
export async function buildOverviewPdf(inp: OverviewPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 14, right = W - mg
  const A = (minor: number, cur: string) => `${fmtPlain(Math.abs(minor), cur)} ${cur}`
  let y = 0
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const need = (h: number) => { if (y + h > 280) { doc.addPage(); y = 18 } }
  const heading = (t: string, size = 12) => { need(16); doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...INK); doc.text(l1(t), mg, y); y += 3 }
  const table = (opts: Record<string, unknown>) => {
    autoTable(doc, { startY: y, margin: { left: mg, right: mg }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8, font: 'helvetica', textColor: INK, lineColor: [220, 225, 220] }, headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [232, 236, 232], textColor: INK, fontStyle: 'bold' }, ...opts })
    y = lastY() + 8
  }
  const now = inp.now ?? new Date()
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(...ACCENT); doc.text(l1(inp.title ?? 'BALANCE OVERVIEW'), mg, 22)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED); doc.text('Date', right, 15, { align: 'right' })
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(ymd, right, 20, { align: 'right' })
  y = 32
  const kv = (k: string, v: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(k, mg, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); const lines = doc.splitTextToSize(l1(v), 140) as string[]; doc.text(lines, mg + 28, y); y += 5.2 * lines.length
  }
  if (inp.preparedBy) kv('Prepared for', inp.preparedBy)
  kv('Trips', inp.tripNames.length ? inp.tripNames.join(', ') : 'None')
  kv('Amounts', inp.includeEstimates ? 'Includes estimated amounts' : 'Confirmed amounts only')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED)
  const note = doc.splitTextToSize('Positive amounts are owed to you; negative amounts are what you owe. Amounts in different currencies are never converted or combined. Payments still waiting for the receiver to confirm are listed but not counted.', W - 2 * mg) as string[]
  doc.text(note, mg, y + 1); y += note.length * 4 + 6

  if (!inp.people.length) {
    doc.setFontSize(11); doc.setTextColor(...INK); doc.text('No outstanding balances for the selected trips.', mg, y)
  } else {
    heading('Summary')
    const body: string[][] = []
    for (const p of inp.people) for (const c of p.currencies) {
      const pend = c.trips.reduce((s, t) => s + t.pendingToMe + t.pendingFromMe, 0)
      body.push([p.name, c.net > 0 ? 'owes you' : c.net < 0 ? 'you owe' : 'settled', A(c.net, c.currency) + (pend ? `  (+${A(pend, c.currency)} pending)` : ''), c.trips.map(t => t.groupName).join(', ')])
    }
    table({ head: [['Person', '', 'Amount', 'Trips']], body: body.map(r => r.map(l1)), columnStyles: { 2: { halign: 'right', cellWidth: 52 } } })

    const tot = totalsByCurrency(inp.people)
    if (tot.length) {
      heading('Totals by currency')
      table({ head: [['Currency', 'Owed to you', 'You owe', 'Net']], body: tot.map(t => [t.currency, A(t.owedToMe, t.currency), A(t.iOwe, t.currency), (t.net >= 0 ? '+' : '-') + A(t.net, t.currency)]), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } } })
    }

    for (const p of inp.people) {
      need(34); heading(p.name, 14)
      for (const c of p.currencies) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED); y += 3
        doc.text(l1(`${c.currency}: ${c.net > 0 ? `${p.name} owes you ${A(c.net, c.currency)}` : c.net < 0 ? `You owe ${p.name} ${A(c.net, c.currency)}` : 'settled'}`), mg, y); y += 3
        table({
          head: [['Trip', 'Net', 'Pending (not counted)']],
          body: c.trips.map(t => [l1(t.groupName + (t.estimated ? ' (includes estimates)' : '')), (t.net >= 0 ? '+' : '-') + A(t.net, c.currency), t.pendingToMe || t.pendingFromMe ? [t.pendingToMe ? `${p.name} paid you ${A(t.pendingToMe, c.currency)}` : '', t.pendingFromMe ? `You paid ${p.name} ${A(t.pendingFromMe, c.currency)}` : ''].filter(Boolean).join('; ') : '-']),
          foot: [['Total', (c.net >= 0 ? '+' : '-') + A(c.net, c.currency), '']],
          columnStyles: { 1: { halign: 'right', cellWidth: 34 } },
        })
        const rows = c.trips.flatMap(t => t.rows.map(r => ({ ...r, trip: t.groupName }))).sort((a, b) => a.date.localeCompare(b.date))
        table({
          head: [['Date', 'Trip', 'Item', 'Amount']],
          body: rows.map(r => [r.date, l1(r.trip), l1(r.text), (r.amount >= 0 ? '+' : '-') + A(r.amount, c.currency)]),
          columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 32 }, 3: { halign: 'right', cellWidth: 34 } },
          styles: { fontSize: 8, cellPadding: 1.5, font: 'helvetica', textColor: INK, lineColor: [220, 225, 220] },
        })
      }
    }
  }

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(l1(`Balance overview  |  ${ymd}  |  Generated with IOU`), mg, 290); doc.text(`Page ${i} of ${pages}`, right, 290, { align: 'right' })
  }
  return doc.output('blob')
}
