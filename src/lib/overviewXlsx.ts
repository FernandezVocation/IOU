import type { Person } from './overview'
import { totalsByCurrency } from './overview'
import { currencyDigits } from './money'

export interface OverviewXlsxInput { people: Person[]; preparedBy: string; tripNames: string[]; includeEstimates: boolean }

/** The Overview as a workbook: one row per person and currency, one per group, and the items behind every amount. */
export async function buildOverviewXlsx(inp: OverviewXlsxInput): Promise<Blob> {
  const mod: any = await import('exceljs') // eslint-disable-line @typescript-eslint/no-explicit-any
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  const M = (minor: number, cur: string) => minor / 10 ** currencyDigits(cur)
  const fmt = (cur: string) => '#,##0.' + '0'.repeat(currencyDigits(cur))
  const dir = (n: number) => (n > 0 ? 'Owes you' : n < 0 ? 'You owe' : 'Settled')

  const s = wb.addWorksheet('Summary')
  const head = ['Person', 'Currency', 'Direction', 'Amount (+ owed to you / - you owe)', 'Pending (not counted)', 'Groups']
  s.addRow(['Balances across groups']); s.addRow([`Prepared for: ${inp.preparedBy || '-'}`]); s.addRow([`Groups: ${inp.tripNames.join(', ') || 'None'}`])
  s.addRow([inp.includeEstimates ? 'Includes estimated amounts' : 'Confirmed amounts only']); s.addRow(['Amounts in different currencies are never converted or combined.']); s.addRow([])
  const hr = s.addRow(head); hr.font = { bold: true }; s.getRow(1).font = { bold: true, size: 14 }
  for (const p of inp.people) for (const c of p.currencies) {
    const pend = c.trips.reduce((a, t) => a + t.pendingToMe + t.pendingFromMe, 0)
    const r = s.addRow([p.name, c.currency, dir(c.net), M(c.net, c.currency), M(pend, c.currency), c.trips.map(t => t.groupName).join(', ')])
    r.getCell(4).numFmt = fmt(c.currency); r.getCell(5).numFmt = fmt(c.currency)
  }
  s.addRow([])
  s.addRow(['Totals by currency']).font = { bold: true }
  for (const t of totalsByCurrency(inp.people)) {
    const r = s.addRow([t.currency, '', `Owed to you ${M(t.owedToMe, t.currency)} / You owe ${M(t.iOwe, t.currency)}`, M(t.net, t.currency)]); r.getCell(4).numFmt = fmt(t.currency)
  }
  ;[24, 10, 30, 34, 22, 40].forEach((w, i) => { s.getColumn(i + 1).width = w })

  const g = wb.addWorksheet('By group')
  g.addRow(['Person', 'Group', 'Currency', 'Amount (+ owed to you / - you owe)', 'Includes estimates']).font = { bold: true }
  for (const p of inp.people) for (const c of p.currencies) for (const t of c.trips) {
    const r = g.addRow([p.name, t.groupName, c.currency, M(t.net, c.currency), t.estimated ? 'Yes' : '']); r.getCell(4).numFmt = fmt(c.currency)
  }
  ;[24, 28, 10, 34, 18].forEach((w, i) => { g.getColumn(i + 1).width = w })

  const d = wb.addWorksheet('Why')
  d.addRow(['Person', 'Group', 'Date', 'Item', 'Currency', 'Amount (+ owed to you / - you owe)']).font = { bold: true }
  for (const p of inp.people) for (const c of p.currencies) for (const t of c.trips) for (const r0 of [...t.rows].sort((a, b) => a.date.localeCompare(b.date))) {
    const r = d.addRow([p.name, t.groupName, r0.date, r0.text, c.currency, M(r0.amount, c.currency)]); r.getCell(6).numFmt = fmt(c.currency)
  }
  ;[24, 28, 12, 60, 10, 34].forEach((w, i) => { d.getColumn(i + 1).width = w })

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
