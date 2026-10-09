import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { receiptFileName, safeName, uniqueName } from './receiptNames'
import { buildReceiptsZip } from './receiptsZip'
import type { Expense, GroupData, Receipt } from './types'

const R = (id: string, path: string, mime = 'image/jpeg'): Receipt => ({ id, expense_id: 'e', group_id: 'g', path, mime, name: null, size_bytes: 1 })
const E = (id: string, o: Partial<Expense>): Expense => ({
  id, group_id: 'g', spent_on: '2026-09-12', spent_at: '19:10:00', vendor: 'Time Out: Market / dinner?', location: 'Lisbon', category: 'Food', notes: 'a,"b"',
  amount: 64.5, currency: 'EUR', settled_amount: null, payer_id: 'a', split_mode: 'equal', created_at: '', updated_at: '', splits: [], receipts: [], ...o,
})
const expenses = [
  E('e1', { receipts: [R('r1', 'g/e1/a.jpg'), R('r2', 'g/e1/b.png', 'image/png')] }),
  E('e2', { spent_on: '2026-09-11', vendor: 'Taxi', amount: 1200, currency: 'JPY', receipts: [R('r3', 'g/e2/c.pdf', 'application/pdf')] }),
  E('e3', { vendor: 'Time Out: Market / dinner?', receipts: [R('r4', 'g/e3/d.jpg')] }), // same name/day/amount as e1's first
  E('e4', { vendor: 'No receipt' }),
]
const data: GroupData = {
  group: { id: 'g', name: 'Lisbon / Sept', currency: 'CAD', invite_code: 'x', created_by: null, created_at: '' },
  members: [], travelers: [{ id: 'a', group_id: 'g', name: 'Alex', color: '#000', user_id: null, sort_order: 0 }],
  expenses, payments: [], rates: {}, me: null, isOwner: true,
}

describe('receipt names', () => {
  it('starts with the date and says what it was for', () => {
    expect(receiptFileName(expenses[0], expenses[0].receipts[0], 0, 2)).toBe('2026-09-12 - Time Out Market dinner - EUR 64.50 (1 of 2).jpg')
    expect(receiptFileName(expenses[1], expenses[1].receipts[0], 0, 1)).toBe('2026-09-11 - Taxi - JPY 1200.pdf')
  })
  it('strips characters that break file systems', () => {
    expect(safeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
    expect(safeName('   ')).toBe('Expense'); expect(safeName('x'.repeat(100)).length).toBe(60)
  })
  it('keeps names unique', () => {
    const used = new Set<string>()
    expect(uniqueName('a.jpg', used)).toBe('a.jpg'); expect(uniqueName('A.jpg', used)).toBe('A (2).jpg'); expect(uniqueName('a.jpg', used)).toBe('a (3).jpg')
  })
})

describe('receipts zip', () => {
  it('packs every receipt under a descriptive name with an index', async () => {
    const calls: number[] = []
    const z = await buildReceiptsZip(data, async p => new Blob([p]), (d) => calls.push(d))
    expect(z.count).toBe(4); expect(z.failed).toEqual([]); expect(z.filename).toBe('lisbon-sept-receipts.zip'); expect(calls.length).toBe(4)
    const zip = await JSZip.loadAsync(await z.blob.arrayBuffer())
    const names = Object.keys(zip.files).filter(n => !n.endsWith('/')).sort()
    expect(names).toEqual([
      'Lisbon Sept - receipts/2026-09-11 - Taxi - JPY 1200.pdf',
      'Lisbon Sept - receipts/2026-09-12 - Time Out Market dinner - EUR 64.50 (1 of 2).jpg',
      'Lisbon Sept - receipts/2026-09-12 - Time Out Market dinner - EUR 64.50 (2 of 2).png',
      'Lisbon Sept - receipts/2026-09-12 - Time Out Market dinner - EUR 64.50.jpg',
      'Lisbon Sept - receipts/index.csv',
    ])
    const csv = await zip.file('Lisbon Sept - receipts/index.csv')!.async('string')
    expect(csv).toContain('File,Date,Time,Vendor'); expect(csv).toContain('"a,""b"""'); expect(csv.split('\r\n').length).toBe(5)
  })
  it('reports files that could not be fetched instead of failing the whole ZIP', async () => {
    const z = await buildReceiptsZip(data, async p => { if (p.includes('b.png')) throw new Error('x'); return new Blob([p]) })
    expect(z.count).toBe(3); expect(z.failed).toHaveLength(1)
  })
})
