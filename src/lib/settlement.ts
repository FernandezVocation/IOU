import { computeLedger, type LedgerResult } from './ledger'
import { fmtMoney } from './money'
import { groupLook, hexToRgb, tilePng, type Look } from './groupLook'
import { l1, slug } from './format'
import type { GroupData } from './types'
import type { SettleMode } from './settleMode'

export interface SettlementModel {
  groupName: string
  look: Look
  currency: string
  generatedOn: string
  mode: 'pending' | 'final'
  settle: SettleMode
  /** Every payment that squares the group up, in the chosen way. */
  payments: Array<{ from: string; to: string; amount: number; status: string }>
  /** Each person's net position: positive is owed, negative owes. */
  balances: Array<{ name: string; balance: number }>
  counts: { estimated: number; excluded: number; missing: number }
}

const STATUS: Record<string, string> = { unpaid: 'Not paid', partial: 'Partly paid', pending: 'Payment awaiting confirmation', paid: 'Paid' }

export function buildSettlementModel(args: { data: GroupData; mode: 'pending' | 'final'; settle: SettleMode; now?: Date; result?: LedgerResult }): SettlementModel {
  const { data, mode, settle } = args
  const cur = data.group.currency
  const R = args.result ?? computeLedger({ currency: cur, travelers: data.travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: mode === 'pending' })
  const nm = (id: string) => data.travelers.find(t => t.id === id)?.name ?? 'Someone'
  const payments = settle === 'itemized'
    ? R.pairs.map(p => ({ from: nm(p.debtor), to: nm(p.creditor), amount: p.net, status: STATUS[p.status] ?? '' }))
    : R.transfers.map(t => ({ from: nm(t.from), to: nm(t.to), amount: t.amount, status: '' }))
  const now = args.now ?? new Date()
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return {
    groupName: data.group.name, look: groupLook(data.group), currency: cur, generatedOn: ymd, mode, settle, payments,
    balances: data.travelers.map(t => ({ name: t.name, balance: R.balance[t.id] ?? 0 })).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name)),
    counts: { estimated: R.counts.estimated, excluded: R.counts.excluded, missing: R.counts.missing },
  }
}

export const settlementFileName = (m: Pick<SettlementModel, 'groupName' | 'settle' | 'mode' | 'generatedOn'>) =>
  `${slug(m.groupName)}-settlement-${m.settle}-${m.mode}-${m.generatedOn.replace(/-/g, '')}.pdf`

const ACCENT: [number, number, number] = [43, 68, 255]
const INK: [number, number, number] = [23, 33, 30]
const MUTED: [number, number, number] = [95, 107, 102]

export async function buildSettlementPdf(m: SettlementModel): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 16
  const A = (n: number) => l1(fmtMoney(n, m.currency))
  let y = 24
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const tile = await tilePng(m.look)
  doc.setFillColor(...hexToRgb(m.look.color)); doc.rect(0, 0, W, 4, 'F')
  if (tile) doc.addImage(tile, 'PNG', W - mg - 11, 12, 11, 11)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24); doc.setTextColor(...ACCENT); doc.text('SETTLEMENT', mg, y)
  y += 8
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK)
  doc.text(l1(m.groupName), mg, y); y += 5.5
  doc.setFontSize(9); doc.setTextColor(...MUTED)
  doc.text(`${m.generatedOn} · ${m.currency} · ${m.mode === 'final' ? 'Final: confirmed amounts only' : m.counts.estimated ? `Pending: includes ${m.counts.estimated} estimated amount${m.counts.estimated === 1 ? '' : 's'}` : 'Pending: all amounts confirmed so far'}`, mg, y); y += 6
  const how = m.settle === 'fewest'
    ? 'Fewest payments: the smallest number of transfers that squares everyone up. Amounts come from each person\'s balance, so money may go to someone other than who paid an expense.'
    : 'Itemized: each pair of people settles directly, so every amount traces to specific expenses.'
  const hl = doc.splitTextToSize(l1(how), W - 2 * mg) as string[]; doc.text(hl, mg, y); y += hl.length * 4.2 + 4

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK); doc.text('Who pays whom', mg, y); y += 3
  const showStatus = m.settle === 'itemized'
  autoTable(doc, {
    startY: y, margin: { left: mg, right: mg }, theme: 'striped',
    head: [showStatus ? ['From', 'To', 'Amount', 'Status'] : ['From', 'To', 'Amount']],
    body: m.payments.length ? m.payments.map(p => showStatus ? [l1(p.from), l1(p.to), A(p.amount), l1(p.status)] : [l1(p.from), l1(p.to), A(p.amount)]) : [[{ content: 'Everyone is square. Nothing to pay.', colSpan: showStatus ? 4 : 3 }]],
    headStyles: { fillColor: ACCENT }, styles: { fontSize: 9.5, textColor: INK },
    columnStyles: { 2: { halign: 'right' } },
  })
  y = lastY() + 10
  if (y > 240) { doc.addPage(); y = 20 }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK); doc.text('Where everyone stands', mg, y); y += 3
  autoTable(doc, {
    startY: y, margin: { left: mg, right: mg }, theme: 'striped',
    head: [['Person', 'Position', 'Balance']],
    body: m.balances.map(b => [l1(b.name), b.balance > 0 ? 'Is owed' : b.balance < 0 ? 'Owes' : 'Square', b.balance === 0 ? A(0) : A(Math.abs(b.balance))]),
    headStyles: { fillColor: ACCENT }, styles: { fontSize: 9.5, textColor: INK },
    columnStyles: { 2: { halign: 'right' } },
  })
  y = lastY() + 8
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED)
  const notes: string[] = []
  if (m.counts.estimated && m.mode === 'pending') notes.push('Amounts marked estimated use an exchange rate set for the group and may change once the card statement amount is entered.')
  if (m.counts.excluded) notes.push(`${m.counts.excluded} expense${m.counts.excluded === 1 ? ' is' : 's are'} not included because the ${m.currency} amount is not settled yet.`)
  if (m.counts.missing) notes.push(`${m.counts.missing} expense${m.counts.missing === 1 ? ' has' : 's have'} no exchange rate and ${m.counts.missing === 1 ? 'is' : 'are'} not included.`)
  notes.push('Payments already recorded in the group are taken into account.')
  for (const n of notes) { const l = doc.splitTextToSize(l1(n), W - 2 * mg) as string[]; doc.text(l, mg, y); y += l.length * 4 + 1 }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(`${p} / ${pages}`, W - mg, 290, { align: 'right' }) }
  return doc.output('blob')
}
