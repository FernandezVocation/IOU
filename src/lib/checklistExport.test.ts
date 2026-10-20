import { describe, expect, it } from 'vitest'
import { NO_FILTERS, iconByLabel, type ChecklistItem } from './checklist'
import { buildChecklistDocx, buildChecklistPdf, buildChecklistModel, checklistDocumentXml, checklistFileName, describeFilters } from './checklistExport'

let n = 0
const mk = (o: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id: 'i' + ++n, checklist_id: 'c1', type: 'todo', type_label: '', type_icon: '', title: 'Item ' + n, notes: '', status: 'todo', due_on: null,
  assigned_name: '', assigned_user: null, completed_by_name: '', completed_by_user: null, completed_at: null,
  est_amount: null, est_currency: null, qty: 1, packed_in: '', booking_ref: '', expense_id: null, itinerary_item_id: null, vault_item_id: null,
  created_by: 'u1', created_at: '2026-10-01T00:00:0' + (n % 10) + 'Z', ...o,
})
const ctx = { today: '2026-10-19', me: 'u1' }
const now = new Date(2026, 9, 19)

describe('checklist export', () => {
  const items = [
    mk({ title: 'Passport', type: 'packing', packed_in: 'Carry-on', qty: 2, notes: 'Check expiry', assigned_name: 'Ann', assigned_user: 'u1' }),
    mk({ title: 'Adapter', type: 'purchase', est_amount: 20, est_currency: 'CAD', due_on: '2026-10-10' }),
    mk({ title: 'Taxi', type: 'booking', status: 'completed', booking_ref: 'ABC123', completed_by_name: 'Ed' }),
  ]
  it('groups into sections with counts', () => {
    const m = buildChecklistModel('Trip', items, { notes: false, details: true }, 'status', ctx, [], { now })
    expect(m.sections.map(s => [s.heading, s.count])).toEqual([['To do', 2], ['Completed', 1]])
    expect(m.subtitle).toContain('3 items · 1 done')
  })
  it('includes details and notes only when asked', () => {
    const on = buildChecklistModel('T', items, { notes: true, details: true }, 'none', ctx, [], { now }).sections[0].rows
    const off = buildChecklistModel('T', items, { notes: false, details: false }, 'none', ctx, [], { now }).sections[0].rows
    const p = (r: typeof on) => r.find(x => x.title === 'Passport')!
    expect(p(on).lines.join(' ')).toContain('Packed in Carry-on')
    expect(p(on).lines.join(' ')).toContain('Quantity 2')
    expect(p(on).notes).toBe('Check expiry')
    expect(p(off).lines.join(' ')).not.toContain('Packed in')
    expect(p(off).notes).toBe('')
  })
  it('flags overdue items and shows who completed', () => {
    const rows = buildChecklistModel('T', items, { notes: false, details: true }, 'none', ctx, [], { now }).sections[0].rows
    expect(rows.find(r => r.title === 'Adapter')!.lines[0]).toContain('(overdue)')
    expect(rows.find(r => r.title === 'Taxi')!.lines.join(' ')).toContain('Done by Ed')
  })
  it('names the list on each item when exporting across lists', () => {
    const rows = buildChecklistModel('T', items, { notes: false, details: false }, 'none', ctx, [], { now, listNames: { c1: 'Packing' } }).sections[0].rows
    expect(rows[0].lines[0]).toContain('List: Packing')
  })
  it('describes the choices that narrowed the export', () => {
    const t = describeFilters({ ...NO_FILTERS, type: 'purchase', status: 'open', assignee: 'me', when: 'overdue' }, [], 'due', 'u1')
    expect(t).toBe('Type: Purchase · Status: Not done · Assigned to: Me · Overdue · Grouped by due date')
    expect(describeFilters(NO_FILTERS, [], 'none', 'u1')).toBe('')
  })
  it('writes a Word body with escaped text and a box per status', () => {
    const m = buildChecklistModel('Tom & Jerry <trip>', [mk({ title: 'A & B', status: 'completed' })], { notes: false, details: false }, 'none', ctx, [], { now })
    const x = checklistDocumentXml(m)
    expect(x).toContain('Tom &amp; Jerry &lt;trip&gt;')
    expect(x).toContain('A &amp; B')
    expect(x).toContain('☑')
  })
  it('says so when nothing matches', () => {
    expect(checklistDocumentXml(buildChecklistModel('T', [], { notes: false, details: false }, 'none', ctx, [], { now }))).toContain('No items match.')
  })
  it('makes a safe file name', () => { expect(checklistFileName('Italy: packing/list!', 'pdf')).toBe('Italy-packinglist.pdf') })
  it('remembers one icon per custom type name', () => {
    expect(iconByLabel([mk({ type: 'custom', type_label: 'Gift', type_icon: 'gift' }), mk({ type: 'custom', type_label: 'Gift', type_icon: '' }), mk({ type: 'todo' })])).toEqual({ Gift: 'gift' })
  })
  it('produces a real .docx and PDF', async () => {
    const m = buildChecklistModel('Trip', [mk({ title: 'Passport' }), mk({ title: 'Taxi', status: 'completed' })], { notes: true, details: true }, 'status', ctx, [], { now })
    const docx = await buildChecklistDocx(m)
    const JSZip = (await import('jszip')).default
    const z = await JSZip.loadAsync(await docx.arrayBuffer())
    expect(await z.file('word/document.xml')!.async('string')).toContain('Passport')
    const pdf = await buildChecklistPdf(m)
    expect(new TextDecoder().decode(new Uint8Array(await pdf.arrayBuffer()).slice(0, 5))).toBe('%PDF-')
  })
})
