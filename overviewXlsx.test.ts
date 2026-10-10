import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildOverviewXlsx } from './overviewXlsx'
import type { Person, PersonTrip } from './overview'

const trip = (groupName: string, net: number, text: string): PersonTrip => ({
  groupId: groupName, groupName, currency: 'CAD', createdAt: '2026-01-01', myId: 'me', theirId: groupName + '-m', net, pendingToMe: 0, pendingFromMe: 0, estimated: false,
  rows: [{ date: '2026-01-02', text, amount: net, kind: 'share' }],
})

describe('overview workbook', () => {
  it('adds one person up across groups and keeps the items behind the total', async () => {
    const massy: Person = { key: 'n:massy', name: 'Massy', contactId: null, travelerIds: ['a', 'b'], tripNames: ['Italy', 'Cottage'], hasPending: false,
      currencies: [{ currency: 'CAD', net: 70000, trips: [trip('Italy', 50000, 'Massy’s share · Hotel'), trip('Cottage', 20000, 'Massy’s share · Groceries')] }] }
    const blob = await buildOverviewXlsx({ people: [massy], preparedBy: 'Alex', tripNames: ['Italy', 'Cottage'], includeEstimates: true })
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'By group', 'Why'])
    const sum = wb.getWorksheet('Summary')!.getRows(1, 20)!.map(r => r.values as unknown[]).find(v => v[1] === 'Massy')!
    expect(sum[3]).toBe('Owes you'); expect(sum[4]).toBe(700); expect(sum[6]).toBe('Italy, Cottage')
    const byGroup = wb.getWorksheet('By group')!
    expect([byGroup.getRow(2).getCell(2).value, byGroup.getRow(2).getCell(4).value, byGroup.getRow(3).getCell(2).value, byGroup.getRow(3).getCell(4).value]).toEqual(['Italy', 500, 'Cottage', 200])
    expect(wb.getWorksheet('Why')!.rowCount).toBe(3)
  })
})
