import type { GroupData } from './types'
import type { LedgerResult, PairLine } from './ledger'
import { currencyDigits, fmtPlain, toMinor } from './money'
import { l1, slug, todayStr } from './format'
import { receiptFileName, uniqueName } from './receiptNames'
import { statusLabel, userName } from './payments'
import { catLabel } from './categories'
import { groupLook, hexArgb, hexToRgb, tilePng } from './groupLook'

export type ExportMode = 'pending' | 'final'
interface Ctx { data: GroupData; result: LedgerResult; mode: ExportMode }

const nameOf = (d: GroupData) => (id: string) => d.travelers.find(t => t.id === id)?.name ?? 'Unknown'

function notes({ data, result, mode }: Ctx): string[] {
  const cur = data.group.currency
  const n: string[] = []
  n.push(mode === 'pending' ? 'PENDING breakdown: includes estimated amounts' : 'FINAL breakdown: confirmed amounts only')
  if (mode === 'pending' && result.counts.estimated) n.push(`${result.counts.estimated} expense(s) are estimated at the group's exchange rates (${fmtPlain(result.estimatedTotal, cur)} ${cur}).`)
  if (mode === 'final' && result.counts.excluded) n.push(`${result.counts.excluded} expense(s) excluded because the ${cur} amount is not settled yet.`)
  if (result.counts.missing) n.push(`${result.counts.missing} expense(s) have no exchange rate and are not counted.`)
  return n
}

function lineText(l: PairLine, nm: (id: string) => string): string {
  const x = l.line
  if (x.kind === 'share') return `${nm(x.debtor!)}'s share - ${x.vendor || 'Expense'} (${nm(x.payer!)} paid)`
  return `Payment ${nm(x.from!)} -> ${nm(x.to!)}`
}
function splitText(d: GroupData, id: string): string {
  const e = d.expenses.find(x => x.id === id)!
  const nm = nameOf(d)
  if (e.split_mode === 'equal') return 'Equal: ' + e.splits.map(s => nm(s.traveler_id)).join(', ')
  const u = { percent: '%', exact: ' ' + e.currency, shares: ' sh' }[e.split_mode]
  return e.splits.map(s => `${nm(s.traveler_id)} ${s.value}${u}`).join(', ')
}
const statusText = (s: string) => (s === 'confirmed' ? 'Confirmed' : s === 'estimated' ? 'Estimated' : 'No rate (not counted)')
const sortedExpenses = (d: GroupData) => [...d.expenses].sort((a, b) => a.spent_on.localeCompare(b.spent_on) || (a.spent_at ?? '').localeCompare(b.spent_at ?? ''))

/* ============================ Excel ============================ */
export async function buildXlsx(ctx: Ctx): Promise<Blob> {
  const { data, result: R } = ctx
  const cur = data.group.currency, f = 10 ** currencyDigits(cur), M = (m: number) => m / f, nm = nameOf(data)
  const mod: any = await import('exceljs') // eslint-disable-line @typescript-eslint/no-explicit-any
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  const money = '#,##0.' + '0'.repeat(currencyDigits(cur))
  const look = groupLook(data.group)
  const sheet = (name: string, rows: unknown[][], widths: number[], moneyCols: number[] = []) => {
    const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: hexArgb(look.color) } } })
    rows.forEach(r => ws.addRow(r))
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })
    moneyCols.forEach(c => { ws.getColumn(c).numFmt = money })
    return ws
  }
  const bold = (ws: any, rowNo: number) => { ws.getRow(rowNo).font = { bold: true } } // eslint-disable-line @typescript-eslint/no-explicit-any

  const sum: unknown[][] = [[data.group.name], ...notes(ctx).map(n => [n]), ['Currency', cur], ['Generated', new Date().toLocaleString()], [],
    ['Person', 'Paid', 'Share of costs', 'Payments sent', 'Payments received', 'Balance (+ owed / - owes)']]
  const headerRow = sum.length
  data.travelers.forEach(t => sum.push([t.name, M(R.paid[t.id]), M(R.share[t.id]), M(R.sent[t.id]), M(R.received[t.id]), M(R.balance[t.id])]))
  sum.push([], ['Total spend counted', M(R.total)])
  const s1 = sheet('Summary', sum, [30, 14, 16, 16, 18, 26], [2, 3, 4, 5, 6]); bold(s1, 1); bold(s1, headerRow)
  // The group's colour on its title cell, so the file is recognisable at a glance.
  s1.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexArgb(look.color) } }
  s1.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }

  const who: unknown[][] = [['PAYMENT PLAN: who pays whom'], [], ['Itemized (each pair settles directly)'], ['From', 'To', `Amount (${cur})`]]
  R.pairs.forEach(p => who.push([nm(p.debtor), nm(p.creditor), M(p.net)]))
  if (!R.pairs.length) who.push(['All square'])
  who.push([], ['Fewest payments (the shortest way to square everyone up)'], ['From', 'To', `Amount (${cur})`])
  R.transfers.forEach(t => who.push([nm(t.from), nm(t.to), M(t.amount)]))
  sheet('Payment plan', who, [24, 24, 18], [3])

  const why: unknown[][] = [['Why: the line items behind each amount'], []]
  R.pairs.forEach(p => {
    why.push([`${nm(p.debtor)} owes ${nm(p.creditor)}`, '', M(p.net)])
    why.push(['Date', 'Item', `Amount (${cur})`])
    p.lines.forEach(l => why.push([l.line.date, lineText(l, nm), l.sign * M(l.line.amount)]))
    why.push([])
  })
  sheet('Why (breakdown)', why, [14, 70, 18], [3])

  const ex: unknown[][] = [['Date', 'Time', 'Vendor', 'Description', 'Location', 'Category', 'Notes', 'Amount', 'Currency', `Settled (${cur})`, 'Rate used', `Amount (${cur})`, 'Status', 'Paid by', 'Split', 'Receipts']]
  sortedExpenses(data).forEach(e => {
    const c = R.calc[e.id]
    const rate = e.currency === cur ? '' : c.status === 'confirmed' && e.amount > 0 ? Number(e.settled_amount) / e.amount : data.rates[e.currency] ?? ''
    ex.push([e.spent_on, e.spent_at?.slice(0, 5) ?? '', e.vendor, e.description ?? '', e.location, e.category ? catLabel(e) : '', e.notes, e.amount, e.currency, e.settled_amount ?? '', rate, c.minor == null ? '' : M(c.minor), statusText(c.status), nm(e.payer_id), splitText(data, e.id), e.receipts.length])
  })
  const s4 = sheet('Expenses', ex, [12, 8, 24, 28, 20, 14, 28, 12, 9, 14, 10, 14, 22, 14, 44, 9]); bold(s4, 1)
  s4.getColumn(8).numFmt = '#,##0.00'; s4.getColumn(10).numFmt = money; s4.getColumn(12).numFmt = money

  // Each person's share of every transaction (group currency), so the whole split is auditable.
  const shr: unknown[][] = [['Date', 'Vendor', `Total (${cur})`, 'Status', 'Paid by', ...data.travelers.map(t => t.name)]]
  const colTotals = data.travelers.map(() => 0)
  sortedExpenses(data).forEach(e => {
    const c = R.calc[e.id]
    const row = data.travelers.map((t, i) => { const r = R.rows[t.id]?.find(x => x.expenseId === e.id); const v = r ? r.share : 0; colTotals[i] += v; return M(v) })
    shr.push([e.spent_on, e.vendor, c.minor == null ? '' : M(c.minor), statusText(c.status), nm(e.payer_id), ...row])
  })
  shr.push(['', 'TOTAL SHARE', M(R.total), '', '', ...colTotals.map(M)])
  const sShr = sheet('Shares by person', shr, [12, 28, 14, 20, 14, ...data.travelers.map(() => 14)], [3, ...data.travelers.map((_, i) => 6 + i)]); bold(sShr, 1); bold(sShr, shr.length)

  // Which receipt file belongs to which transaction (names match the ZIP download).
  const rc: unknown[][] = [['Date', 'Vendor', 'Amount', 'Currency', 'Paid by', 'Receipt file name', 'Stored at']]
  const used = new Set<string>()
  sortedExpenses(data).forEach(e => e.receipts.forEach((r, i) => rc.push([e.spent_on, e.vendor, e.amount, e.currency, nm(e.payer_id), uniqueName(receiptFileName(e, r, i, e.receipts.length), used), 'receipts/' + r.path])))
  if (rc.length === 1) rc.push(['No receipts attached yet.'])
  const sRc = sheet('Receipt files', rc, [12, 26, 12, 9, 14, 58, 60]); bold(sRc, 1)

  const pay: unknown[][] = [['Date', 'From', 'To', `Amount (${cur})`, 'Status', 'Method', 'Note', 'Entered by', 'Confirmed by']]
  ;[...data.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on)).forEach(p => pay.push([p.paid_on, nm(p.from_id), nm(p.to_id), p.amount, statusLabel(p), p.method ?? '', p.note ?? '', p.created_by ? userName(data, p.created_by) : '', p.confirmed_by ? userName(data, p.confirmed_by) : '']))
  sheet('Payments', pay, [14, 20, 20, 16, 11, 14, 34, 16, 16], [4])

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/* ============================ PDF ============================ */

export async function buildPdf(ctx: Ctx): Promise<Blob> {
  const { data, result: R, mode } = ctx
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const cur = data.group.currency, nm = nameOf(data)
  const A = (m: number) => `${fmtPlain(m, cur)} ${cur}`
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 14
  let y = 16
  const need = (h: number) => { if (y + h > 285) { doc.addPage(); y = 16 } }
  const H = (t: string) => { need(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(l1(t), mg, y); y += 5 }
  const tbl = (head: string[], body: unknown[][], extra: Record<string, unknown> = {}) => {
    autoTable(doc, { head: [head], body: body.map(r => r.map(l1)), startY: y, margin: { left: mg, right: mg }, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.6, font: 'helvetica' }, headStyles: { fillColor: [43, 68, 255], textColor: 255 }, ...extra })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7
  }

  const look = groupLook(data.group), tile = await tilePng(look)
  doc.setFillColor(...hexToRgb(look.color)); doc.rect(0, 0, W, 4, 'F')
  if (tile) doc.addImage(tile, 'PNG', mg, y - 6, 11, 11)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0); doc.text(l1(data.group.name), tile ? mg + 14 : mg, y + 2); y += 9
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  notes({ data, result: R, mode }).forEach(n => { const lines = doc.splitTextToSize(l1(n), W - 2 * mg) as string[]; doc.text(lines, mg, y); y += 4.2 * lines.length })
  doc.text(l1(`Currency: ${cur}   Generated: ${new Date().toLocaleString()}   Total counted: ${A(R.total)}`), mg, y); y += 8

  H('Balances')
  tbl(['Person', 'Paid', 'Share', 'Pmts sent', 'Pmts received', 'Balance'],
    data.travelers.map(t => [t.name, A(R.paid[t.id]), A(R.share[t.id]), A(R.sent[t.id]), A(R.received[t.id]), (R.balance[t.id] >= 0 ? '+' : '-') + A(Math.abs(R.balance[t.id]))]),
    { columnStyles: { 5: { fontStyle: 'bold' } } })
  H('Payment plan: who pays whom (itemized)')
  tbl(['From', 'To', 'Amount'], R.pairs.length ? R.pairs.map(p => [nm(p.debtor), nm(p.creditor), A(p.net)]) : [['All square', '', '']])
  H('Payment plan: fewest payments')
  tbl(['From', 'To', 'Amount'], R.transfers.length ? R.transfers.map(t => [nm(t.from), nm(t.to), A(t.amount)]) : [['All square', '', '']])
  if (R.pairs.length) {
    H('Why: the items behind each amount')
    R.pairs.forEach(p => {
      need(22); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text(l1(`${nm(p.debtor)} owes ${nm(p.creditor)}: ${A(p.net)}`), mg, y); y += 2.5
      tbl(['Date', 'Item', 'Amount'], [...p.lines.map(l => [l.line.date, lineText(l, nm), (l.sign > 0 ? '' : '-') + A(l.line.amount)]), ['', 'Net', A(p.net)]], { columnStyles: { 2: { halign: 'right' } } })
    })
  }
  H('All transactions')
  tbl(['Date', 'Vendor / details', 'Paid by', 'Original', 'In ' + cur, 'Split', 'Rcpt'], sortedExpenses(data).map(e => {
    const c = R.calc[e.id]
    const details = [e.vendor, e.description, [e.category ? catLabel(e) : '', e.location].filter(Boolean).join(' - '), e.notes].filter(Boolean).join('\n')
    const split = e.split_mode === 'equal' ? 'Equal: ' + e.splits.map(s => nm(s.traveler_id)).join(', ') : e.splits.map(s => `${nm(s.traveler_id)} ${s.value}${e.split_mode === 'percent' ? '%' : e.split_mode === 'exact' ? ' ' + e.currency : ' sh'}`).join(', ')
    const inCur = c.minor == null ? 'no rate' : A(c.minor) + (c.status === 'estimated' ? ' (est.)' : '')
    return [e.spent_on + (e.spent_at ? '\n' + e.spent_at.slice(0, 5) : ''), details, nm(e.payer_id), `${fmtPlain(toMinor(e.amount, e.currency), e.currency)} ${e.currency}`, inCur, split, e.receipts.length ? String(e.receipts.length) : '-']
  }), { styles: { fontSize: 7.5, cellPadding: 1.5, font: 'helvetica', valign: 'top' }, columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 44 }, 3: { cellWidth: 22 }, 4: { cellWidth: 26 }, 6: { cellWidth: 10, halign: 'center' } } })
  if (data.payments.length) {
    H('Payments recorded')
    tbl(['Date', 'From', 'To', 'Amount', 'Status', 'Method / note'], [...data.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on)).map(p => [p.paid_on, nm(p.from_id), nm(p.to_id), A(toMinor(p.amount, cur)), statusLabel(p), [p.method, p.note].filter(Boolean).join(' - ')]))
  }
  return doc.output('blob')
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
export const exportName = (d: GroupData, mode: ExportMode, ext: string) => `${slug(d.group.name)}-${mode}-${todayStr()}.${ext}`
