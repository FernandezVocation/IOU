import { describe, expect, it } from 'vitest'
import { buildPdf, buildXlsx } from './exporters'
import { computeLedger } from './ledger'
import type { Expense, GroupData, Traveler } from './types'

const T = (id: string, name: string): Traveler => ({ id, group_id: 'g', name, color: '#000', user_id: null, sort_order: 0 })
const travelers = [T('a', 'Ann'), T('b', 'Bo'), T('c', 'Zoë 日本')]
const E = (id: string, o: Partial<Expense>): Expense => ({
  id, group_id: 'g', spent_on: '2026-10-01', spent_at: '12:30:00', vendor: id, location: 'Lisbon', category: 'Food & drink', notes: '',
  amount: 10, currency: 'CAD', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', receipts: [],
  splits: [{ traveler_id: 'a', value: 1 }, { traveler_id: 'b', value: 1 }, { traveler_id: 'c', value: 1 }], ...o,
})
const data: GroupData = {
  group: { id: 'g', name: 'Lisbon — Sept ’26', currency: 'CAD', invite_code: 'x', created_by: null, created_at: '' },
  members: [], travelers, me: null, isOwner: true, rates: { EUR: 1.5 },
  expenses: [E('Dinner', { amount: 100 }), E('Hotel', { amount: 200, currency: 'EUR', settled_amount: 310, payer_id: 'b' }), E('Taxi', { amount: 20, currency: 'EUR', payer_id: 'c' })],
  payments: [{ id: 'p', group_id: 'g', from_id: 'c', to_id: 'a', amount: 10, paid_on: '2026-10-04' }],
}
const run = (inc: boolean) => computeLedger({ currency: 'CAD', travelers, expenses: data.expenses, payments: data.payments, rates: data.rates, includeEstimates: inc })

describe('exports', () => {
  it('builds a readable workbook with every sheet, and final excludes estimates', async () => {
    const ExcelJS: any = await import('exceljs') // eslint-disable-line @typescript-eslint/no-explicit-any
    const read = async (inc: boolean) => {
      const blob = await buildXlsx({ data, result: run(inc), mode: inc ? 'pending' : 'final' })
      const wb = new (ExcelJS.default ?? ExcelJS).Workbook()
      await wb.xlsx.load(await blob.arrayBuffer())
      return wb
    }
    const pending = await read(true), final = await read(false)
    expect(pending.worksheets.map((w: any) => w.name)).toEqual(['Summary', 'Payment plan', 'Why (breakdown)', 'Expenses', 'Shares by person', 'Receipt files', 'Payments']) // eslint-disable-line @typescript-eslint/no-explicit-any
    const text = (wb: any, sheet: string) => { const out: string[] = []; wb.getWorksheet(sheet).eachRow((r: any) => out.push(r.values.slice(1).join(' | '))); return out.join('\n') } // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(text(pending, 'Summary')).toContain('PENDING')
    expect(text(final, 'Summary')).toContain('FINAL')
    expect(text(final, 'Summary')).toContain('excluded')
    expect(text(pending, 'Summary')).toMatch(/Total spend counted \| 440/)
    expect(text(final, 'Summary')).toMatch(/Total spend counted \| 410/)
    expect(text(pending, 'Expenses')).toContain('Estimated')
    expect(text(pending, 'Why (breakdown)')).toMatch(/share - Dinner \(Ann paid\)/)
    expect(text(pending, 'Payment plan')).toContain('PAYMENT PLAN')
    expect(text(pending, 'Shares by person')).toContain('TOTAL SHARE')
    expect(text(pending, 'Receipt files')).toContain('No receipts attached yet.')
  })
  it('builds a valid PDF, tolerating names outside Latin-1', async () => {
    for (const inc of [true, false]) {
      const blob = await buildPdf({ data, result: run(inc), mode: inc ? 'pending' : 'final' })
      const head = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))
      expect(head).toBe('%PDF-'); expect(blob.size).toBeGreaterThan(3000)
    }
  })
})

import { writeFileSync } from 'node:fs'
describe.skipIf(!process.env.DUMP_DIR)('dump report PDF', () => {
  it('writes it', async () => {
    writeFileSync((process.env.DUMP_DIR as string) + '/report.pdf', Buffer.from(await (await buildPdf({ data, result: run(true), mode: 'pending' })).arrayBuffer()))
  })
})
