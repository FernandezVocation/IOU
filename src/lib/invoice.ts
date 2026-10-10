import type { Expense, GroupData } from './types'
import { computeLedger, planTransfers } from './ledger'
import { fmtPlain, toMinor } from './money'
import { l1, slug } from './format'
import { catLabel } from './categories'

export type InvoiceMode = 'pending' | 'final'

export interface InvoiceLine {
  expenseId: string
  date: string
  time: string | null
  vendor: string
  /** The expense note, shown on the shared page only; never printed on the invoice PDF. */
  notes?: string
  detail: string            // "Food & drink · Lisbon"
  payerName: string
  original: string | null   // "EUR 64.50" when paid in another currency
  estimated: boolean
  total: number             // whole expense, group currency (minor units)
  share: number             // the billed party's slice of it
  paid: number              // what the billed party paid of it
  basis: string             // "1 of 3", "50%", "2 of 4 shares", "set amount"
}
export interface PaymentLine { date: string; text: string; amount: number; kind: 'made' | 'received' }
export interface InvoiceModel {
  groupName: string
  currency: string
  reference: string
  generatedOn: string       // YYYY-MM-DD
  mode: InvoiceMode
  billTo: string[]
  billToLabel: string
  preparedBy: string
  note: string
  shareLines: InvoiceLine[]
  paidLines: InvoiceLine[]
  paymentLines: PaymentLine[]
  /** Recorded but not yet confirmed by the receiver: shown, never deducted. */
  pendingLines: PaymentLine[]
  totals: { share: number; paid: number; made: number; received: number; due: number }
  payOut: Array<{ name: string; amount: number }>   // who the billed party should pay
  payIn: Array<{ name: string; amount: number }>    // who should pay the billed party
  counts: { estimated: number; excluded: number; missing: number }
}

const PARTY = '__party__'
const round2 = (n: number) => Math.round(n * 100) / 100

export const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : names.length === 2 ? names.join(' & ') : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]

function basisFor(e: Expense, party: Set<string>): string {
  const mine = e.splits.filter(s => party.has(s.traveler_id))
  if (e.split_mode === 'equal') return `${mine.length} of ${e.splits.length}`
  if (e.split_mode === 'percent') return `${round2(mine.reduce((s, x) => s + x.value, 0))}%`
  if (e.split_mode === 'shares') return `${round2(mine.reduce((s, x) => s + x.value, 0))} of ${round2(e.splits.reduce((s, x) => s + x.value, 0))} shares`
  return 'set amount'
}

/**
 * Everything an invoice says, as plain numbers.
 *
 *   amount due = their share of every cost
 *              - what they paid themselves
 *              - payments they already made
 *              + payments they received
 *
 * "Them" can be several travelers (a couple, a family): they are billed together, and
 * anything they paid or owe each other cancels out.
 */
export type InvoiceSettle = 'itemized' | 'fewest'

export function buildInvoiceModel(args: { data: GroupData; billTo: string[]; mode: InvoiceMode; note?: string; preparedBy?: string; now?: Date; settle?: InvoiceSettle }): InvoiceModel {
  const { data, billTo, mode } = args
  const settle: InvoiceSettle = args.settle ?? 'itemized'
  if (!billTo.length) throw new Error('Choose at least one person to bill.')
  const cur = data.group.currency
  const party = new Set(billTo)
  const nm = (id: string) => data.travelers.find(t => t.id === id)?.name ?? 'Unknown'
  const R = computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: mode === 'pending' })

  const shareLines: InvoiceLine[] = []
  const paidLines: InvoiceLine[] = []
  const exps = [...data.expenses].sort((a, b) => a.spent_on.localeCompare(b.spent_on) || (a.spent_at ?? '').localeCompare(b.spent_at ?? ''))
  for (const e of exps) {
    const c = R.calc[e.id]
    if (!c || c.minor == null) continue
    let share = 0, paid = 0
    for (const id of party) {
      const row = R.rows[id]?.find(r => r.expenseId === e.id)
      if (row) { share += row.share; paid += row.paid }
    }
    if (!share && !paid) continue
    const line: InvoiceLine = {
      expenseId: e.id, date: e.spent_on, time: e.spent_at, vendor: e.vendor || 'Expense', notes: e.notes || undefined,
      detail: [e.category ? catLabel(e) : '', e.location].filter(Boolean).join(' · '),
      payerName: nm(e.payer_id),
      original: e.currency !== cur ? `${fmtPlain(toMinor(e.amount, e.currency), e.currency)} ${e.currency}` : null,
      estimated: c.status === 'estimated', total: c.minor, share, paid, basis: basisFor(e, party),
    }
    if (share > 0) shareLines.push(line)
    if (paid > 0) paidLines.push(line)
  }

  const paymentLines: PaymentLine[] = []
  const pendingLines: PaymentLine[] = []
  let made = 0, received = 0
  for (const p of [...data.payments].sort((a, b) => a.paid_on.localeCompare(b.paid_on))) {
    const fromIn = party.has(p.from_id), toIn = party.has(p.to_id)
    if (fromIn === toIn) continue // unrelated, or both inside the billed group (cancels out)
    const m = toMinor(p.amount, cur)
    if (p.status === 'pending') {
      pendingLines.push({ date: p.paid_on, text: fromIn ? `Payment to ${nm(p.to_id)}` : `Payment from ${nm(p.from_id)}`, amount: m, kind: fromIn ? 'made' : 'received' })
      continue
    }
    if (fromIn) { made += m; paymentLines.push({ date: p.paid_on, text: `Payment made to ${nm(p.to_id)}`, amount: m, kind: 'made' }) }
    else { received += m; paymentLines.push({ date: p.paid_on, text: `Payment received from ${nm(p.from_id)}`, amount: m, kind: 'received' }) }
  }

  const share = shareLines.reduce((s, l) => s + l.share, 0)
  const paid = paidLines.reduce((s, l) => s + l.paid, 0)
  const due = share - paid - made + received

  // Who the billed party settles with.
  // itemized: person by person, so each amount matches the expenses shared with them (the same as the Balances tab).
  // fewest: the smallest number of payments, which can route money through someone else.
  let payOut: Array<{ name: string; amount: number }> = []
  let payIn: Array<{ name: string; amount: number }> = []
  if (settle === 'itemized') {
    const out = new Map<string, number>(), inn = new Map<string, number>()
    const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) ?? 0) + n)
    for (const p of R.pairs) {
      const dIn = party.has(p.debtor), cIn = party.has(p.creditor)
      if (dIn === cIn) continue
      if (dIn) add(out, p.creditor, p.net); else add(inn, p.debtor, p.net)
    }
    const list = (m: Map<string, number>) => [...m].filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]).map(([id, amount]) => ({ name: nm(id), amount }))
    payOut = list(out); payIn = list(inn)
  } else {
    const merged: Record<string, number> = {}
    const order: string[] = []
    for (const t of data.travelers) {
      if (party.has(t.id)) {
        if (!(PARTY in merged)) { merged[PARTY] = 0; order.push(PARTY) }
        merged[PARTY] += R.balance[t.id]
      } else { merged[t.id] = R.balance[t.id]; order.push(t.id) }
    }
    const plan = planTransfers(merged, order)
    payOut = plan.filter(t => t.from === PARTY).map(t => ({ name: nm(t.to), amount: t.amount }))
    payIn = plan.filter(t => t.to === PARTY).map(t => ({ name: nm(t.from), amount: t.amount }))
  }

  const now = args.now ?? new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const names = data.travelers.filter(t => party.has(t.id)).map(t => t.name)
  return {
    groupName: data.group.name, currency: cur,
    reference: `${slug(data.group.name).toUpperCase().slice(0, 14)}-${ymd}`,
    generatedOn: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6)}`,
    mode, billTo: [...party], billToLabel: joinNames(names), preparedBy: args.preparedBy ?? '', note: (args.note ?? '').trim(),
    shareLines, paidLines, paymentLines, pendingLines, totals: { share, paid, made, received, due }, payOut, payIn,
    counts: { estimated: R.counts.estimated, excluded: R.counts.excluded, missing: R.counts.missing },
  }
}

/* ============================ PDF ============================ */
export interface InvoiceImage { expenseId: string; label: string; dataUrl: string; width: number; height: number }

const ACCENT: [number, number, number] = [43, 68, 255]
const INK: [number, number, number] = [23, 33, 30]
const MUTED: [number, number, number] = [95, 107, 102]

export async function buildInvoicePdf(m: InvoiceModel, images: InvoiceImage[] = [], skippedReceipts = 0): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const cur = m.currency
  const A = (minor: number) => `${fmtPlain(Math.abs(minor), cur)} ${cur}`
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 14, right = W - mg
  let y = 0
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const need = (h: number) => { if (y + h > 280) { doc.addPage(); y = 18 } }
  const heading = (t: string) => { need(16); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK); doc.text(l1(t), mg, y); y += 3 }
  const table = (opts: Record<string, unknown>) => {
    autoTable(doc, { startY: y, margin: { left: mg, right: mg }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8, font: 'helvetica', textColor: INK, lineColor: [220, 225, 220] }, headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [232, 236, 232], textColor: INK, fontStyle: 'bold' }, ...opts })
    y = lastY() + 8
  }
  const desc = (l: InvoiceLine) => l1([l.vendor + (l.estimated ? '  (estimated)' : ''), l.detail, l.original ? `Paid ${l.original}` : ''].filter(Boolean).join('\n'))
  const when = (l: InvoiceLine) => l.date + (l.time ? '\n' + l.time.slice(0, 5) : '')

  // ---- header
  doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...ACCENT); doc.text('INVOICE', mg, 24)
  doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal')
  doc.text('Reference', right, 15, { align: 'right' }); doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(l1(m.reference), right, 20, { align: 'right' })
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.text('Date', right, 27, { align: 'right' }); doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.text(m.generatedOn, right, 32, { align: 'right' })

  y = 38
  const kv = (k: string, v: string) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(k, mg, y)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(l1(v), 140) as string[], mg + 28, y); y += 5.5
  }
  kv('Group', m.groupName)
  kv('Billed to', m.billToLabel)
  if (m.preparedBy) kv('Prepared by', m.preparedBy)
  kv('Currency', cur)
  kv('Status', m.mode === 'final' ? 'FINAL: confirmed amounts only' : m.counts.estimated ? `PENDING: includes ${m.counts.estimated} estimated amount${m.counts.estimated === 1 ? '' : 's'}` : 'PENDING: all amounts confirmed so far')

  // ---- amount due box
  y += 2
  const owes = m.totals.due > 0, square = m.totals.due === 0
  doc.setFillColor(owes ? 238 : 232, owes ? 241 : 245, 255); if (!owes) doc.setFillColor(226, 243, 237)
  doc.roundedRect(mg, y, W - 2 * mg, 22, 3, 3, 'F')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(owes ? 'AMOUNT DUE' : square ? 'BALANCE' : 'CREDIT: AMOUNT OWED TO YOU', mg + 6, y + 8)
  doc.setFontSize(22); doc.setTextColor(...(owes ? ACCENT : ([14, 124, 97] as [number, number, number])))
  doc.text(square ? 'Nothing to pay' : A(m.totals.due), mg + 6, y + 17)
  y += 32

  // ---- 1) shares
  heading('Your share of group expenses')
  table({
    head: [['Date', 'Description', 'Paid by', 'Expense total', 'Your portion', 'Your share']],
    body: m.shareLines.length ? m.shareLines.map(l => [when(l), desc(l), l1(l.payerName), A(l.total), l1(l.basis), A(l.share)]) : [['', 'No expenses are shared with you yet.', '', '', '', '']],
    foot: [['', '', '', '', 'Total share', A(m.totals.share)]],
    columnStyles: { 0: { cellWidth: 19 }, 2: { cellWidth: 20 }, 3: { halign: 'right', cellWidth: 27 }, 4: { cellWidth: 22 }, 5: { halign: 'right', cellWidth: 27, fontStyle: 'bold' } },
    showFoot: 'lastPage',
  })

  // ---- 2) paid by them
  if (m.paidLines.length) {
    heading('Less: expenses you paid yourself')
    table({
      head: [['Date', 'Description', 'Amount you paid']],
      body: m.paidLines.map(l => [when(l), desc(l), A(l.paid)]),
      foot: [['', 'Total you paid', A(m.totals.paid)]],
      columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right', cellWidth: 38, fontStyle: 'bold' } },
    })
  }

  // ---- 3) payments already made / received
  if (m.paymentLines.length) {
    heading('Payments already settled')
    table({
      head: [['Date', 'Description', 'Amount']],
      body: m.paymentLines.map(p => [p.date, l1(p.text), (p.kind === 'made' ? '-' : '+') + A(p.amount)]),
      columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right', cellWidth: 38 } },
    })
  }

  // ---- 3b) payments awaiting confirmation (informational, not deducted)
  if (m.pendingLines.length) {
    heading('Payments awaiting confirmation')
    table({
      head: [['Date', 'Description', 'Amount']],
      body: m.pendingLines.map(p => [p.date, l1(p.text + ' (not counted until confirmed)'), A(p.amount)]),
      columnStyles: { 0: { cellWidth: 20 }, 2: { halign: 'right', cellWidth: 38 } },
    })
  }

  // ---- summary
  need(60)
  heading('Summary')
  const rows: string[][] = [['Total share of group costs', A(m.totals.share)], ['Less: expenses you paid yourself', '-' + A(m.totals.paid)]]
  if (m.totals.made) rows.push(['Less: payments you already made', '-' + A(m.totals.made)])
  if (m.totals.received) rows.push(['Plus: payments you received', '+' + A(m.totals.received)])
  rows.push([owes ? 'AMOUNT DUE' : square ? 'BALANCE' : 'CREDIT OWED TO YOU', square ? A(0) : A(m.totals.due)])
  autoTable(doc, {
    startY: y, margin: { left: 82, right: mg }, theme: 'plain', body: rows,
    styles: { fontSize: 9.5, cellPadding: 1.8, textColor: INK, font: 'helvetica' },
    columnStyles: { 0: { cellWidth: 68 }, 1: { halign: 'right', cellWidth: 46 } },
    didParseCell: (d) => { if (d.row.index === rows.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 11; d.cell.styles.fillColor = [232, 236, 232] } },
  })
  y = lastY() + 10

  // ---- how to pay
  heading(owes ? 'How to pay' : 'Settling up')
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK); y += 3
  const say = (t: string) => { const lines = doc.splitTextToSize(l1(t), W - 2 * mg) as string[]; need(lines.length * 5 + 2); doc.text(lines, mg, y); y += lines.length * 5 + 1 }
  if (m.payOut.length) { doc.setFont('helvetica', 'bold'); say('You pay'); doc.setFont('helvetica', 'normal'); m.payOut.forEach(p => say(`Pay ${p.name}: ${A(p.amount)}`)) }
  if (m.payIn.length) { doc.setFont('helvetica', 'bold'); say(m.payOut.length ? 'You are also owed' : 'You are owed'); doc.setFont('helvetica', 'normal'); m.payIn.forEach(p => say(`${p.name} owes you ${A(p.amount)}`)) }
  if (m.payOut.length && m.payIn.length) say(owes ? `After those are settled, you still pay a net ${A(m.totals.due)}.` : square ? 'Those cancel out exactly.' : `After those are settled, you are owed a net ${A(-m.totals.due)}.`)
  if (!m.payOut.length && !m.payIn.length) say(square ? 'You are all square. Nothing to pay.' : owes ? 'Nothing to settle yet.' : 'Nothing to pay.')
  if (m.note) { y += 2; doc.setFont('helvetica', 'bold'); say('Notes'); doc.setFont('helvetica', 'normal'); say(m.note) }
  if (m.counts.estimated && m.mode === 'pending') { y += 2; doc.setTextColor(...MUTED); doc.setFontSize(8.5); say('Amounts marked "estimated" use an exchange rate set for the group and may change once the card statement amount is entered.') }
  if (m.counts.excluded) { doc.setTextColor(...MUTED); doc.setFontSize(8.5); say(`${m.counts.excluded} expense${m.counts.excluded === 1 ? ' is' : 's are'} not included because the ${cur} amount is not settled yet.`) }
  if (m.counts.missing) { doc.setTextColor(...MUTED); doc.setFontSize(8.5); say(`${m.counts.missing} expense${m.counts.missing === 1 ? ' has' : 's have'} no exchange rate and ${m.counts.missing === 1 ? 'is' : 'are'} not included.`) }

  // ---- receipts appendix
  if (images.length || skippedReceipts) {
    doc.addPage(); y = 18
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...INK); doc.text('Receipts', mg, y); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
    doc.text(l1(`${images.length} receipt photo${images.length === 1 ? '' : 's'} for the expenses above.${skippedReceipts ? ` ${skippedReceipts} PDF or oversized receipt${skippedReceipts === 1 ? ' was' : 's were'} not embedded.` : ''}`), mg, y)
    let first = true
    for (const img of images) {
      if (!first) { doc.addPage(); y = 18 } else y += 8
      first = false
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(l1(img.label), mg, y); y += 4
      const maxW = W - 2 * mg, maxH = 297 - y - 16
      const sc = Math.min(maxW / img.width, maxH / img.height)
      doc.addImage(img.dataUrl, 'JPEG', mg, y, img.width * sc, img.height * sc)
    }
  }

  // ---- footer on every page
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED)
    doc.text(l1(`${m.reference}  |  ${m.groupName}  |  Generated with IOU`), mg, 290)
    doc.text(`Page ${i} of ${pages}`, right, 290, { align: 'right' })
  }
  return doc.output('blob')
}

/** Browser only: download receipt photos for an invoice and shrink them to embeddable JPEGs. */
export async function loadInvoiceImages(
  data: GroupData, model: InvoiceModel, fetchBlob: (path: string) => Promise<Blob>,
  onProgress?: (done: number, total: number) => void, cap = 60,
): Promise<{ images: InvoiceImage[]; skipped: number }> {
  const ids = new Set([...model.shareLines, ...model.paidLines].map(l => l.expenseId))
  const exps = data.expenses.filter(e => ids.has(e.id)).sort((a, b) => a.spent_on.localeCompare(b.spent_on) || (a.spent_at ?? '').localeCompare(b.spent_at ?? ''))
  const jobs = exps.flatMap(e => e.receipts.map((r, i) => ({ e, r, i })))
  const images: InvoiceImage[] = []
  let skipped = 0, done = 0
  for (const j of jobs) {
    onProgress?.(done++, jobs.length)
    if (j.r.mime === 'application/pdf' || images.length >= cap) { skipped++; continue }
    try {
      const bmp = await createImageBitmap(await fetchBlob(j.r.path), { imageOrientation: 'from-image' })
      const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc)
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
      images.push({ expenseId: j.e.id, label: `${j.e.spent_on}  ${j.e.vendor || 'Expense'}  (${j.e.currency} ${j.e.amount.toFixed(2)})${j.e.receipts.length > 1 ? `  ${j.i + 1}/${j.e.receipts.length}` : ''}`, dataUrl: c.toDataURL('image/jpeg', 0.8), width: c.width, height: c.height })
    } catch { skipped++ }
  }
  onProgress?.(jobs.length, jobs.length)
  return { images, skipped }
}
