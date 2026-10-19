import { describe, expect, it } from 'vitest'
import { exportChoices, buildExportModel, buildItineraryDocx, buildItineraryPdf, docxDocumentXml, exportFileName } from './itineraryExport'
import type { ItineraryItem } from './itinerary'
import { spendByItem } from './itinerarySpend'

const I = (o: Partial<ItineraryItem>): ItineraryItem => ({
  id: o.title ?? 'x', itinerary_id: 'it', category: 'transport', category_label: '', subtype: 'Train', title: 'Italo', description: 'Venice to Florence', vendor: 'Italo (NTV)',
  starts_on: '2026-10-10', starts_at: '09:10:00', ends_on: null, ends_at: '11:40:00', place: '', address: '', from_place: 'Venezia Santa Lucia', to_place: 'Firenze SMN',
  website: '', notes: 'Door code 4321', people: ['Ann', 'Ed'], private: false, vault_item_id: 'secret-vault-id', created_by: 'u', ...o,
})
const items = [I({ id: 'Italo' }), I({ title: 'Surprise', private: true, notes: 'gift' }), I({ title: 'Packing', category: 'custom', category_label: 'Chores', subtype: '', starts_on: null, starts_at: null, from_place: '', to_place: '' })]
const spend = spendByItem([{ id: 'e', vendor: 'v', spent_on: '2026-10-09', amount: 120, currency: 'CAD', settled_amount: null, charged_amount: null, charged_currency: null, itinerary_item_id: 'Italo' }], 'CAD', {})

describe('export model', () => {
  it('leaves out Only me items, notes and amounts unless asked', () => {
    const m = buildExportModel('Italy', items, { notes: false, amounts: false }, spend)
    const text = JSON.stringify(m)
    expect(text).not.toContain('Surprise')
    expect(text).not.toContain('4321')
    expect(text).not.toContain('Cost:')
    expect(text).not.toContain('secret-vault-id')
    expect(m.days.map(d => d.heading).at(-1)).toBe('No date')
    expect(m.subtitle).toContain('2 items')
  })
  it('adds notes and the item cost when asked, and still never Only me items', () => {
    const text = JSON.stringify(buildExportModel('Italy', items, { notes: true, amounts: true }, spend))
    expect(text).toContain('Notes: Door code 4321')
    expect(text).toContain('Cost: CAD 120.00')
    expect(text).toContain('Venezia Santa Lucia → Firenze SMN')
    expect(text).not.toContain('Surprise')
  })
  it('makes a safe file name', () => { expect(exportFileName('Italy 2026: Rome/Venice?', 'pdf')).toBe('Italy-2026-RomeVenice.pdf'); expect(exportFileName('???', 'docx')).toBe('itinerary.docx') })
})

describe('choosing what to export', () => {
  const many = [
    I({ id: 'a', title: 'Italo', starts_on: '2026-10-10', to_place: 'Florence' }),
    I({ id: 'b', title: 'Hotel', category: 'stay', subtype: 'Hotel', starts_on: '2026-10-10', place: 'Florence', from_place: '', to_place: '' }),
    I({ id: 'c', title: 'Gelato', category: 'food', subtype: '', starts_on: '2026-10-11', place: 'Rome', from_place: '', to_place: '' }),
    I({ id: 'd', title: 'Secret', private: true, starts_on: '2026-10-11', place: 'Rome' }),
  ]
  const titles = (m: ReturnType<typeof buildExportModel>) => m.days.flatMap(d => d.entries.map(e => e.title))
  it('lists the days, places or types to pick from, never counting Only me items', () => {
    expect(exportChoices(many, 'date').map(c => [c.label, c.count])).toEqual([['Sat, Oct 10', 2], ['Sun, Oct 11', 1]])
    expect(exportChoices(many, 'place').map(c => c.label)).toEqual(['Florence', 'Rome'])
    expect(exportChoices(many, 'type').map(c => c.label)).toEqual(['Transport', 'Stays', 'Food'])
  })
  it('exports only the chosen days, places or types, or everything', () => {
    const day = exportChoices(many, 'date')[1].key
    expect(titles(buildExportModel('T', many, { notes: false, amounts: false, only: { by: 'date', keys: [day] } }, null))).toEqual(['Gelato'])
    expect(titles(buildExportModel('T', many, { notes: false, amounts: false, only: { by: 'place', keys: ['florence'] } }, null)).sort()).toEqual(['Hotel', 'Italo'])
    expect(titles(buildExportModel('T', many, { notes: false, amounts: false, only: { by: 'type', keys: ['stay'] } }, null))).toEqual(['Hotel'])
    expect(titles(buildExportModel('T', many, { notes: false, amounts: false }, null)).length).toBe(3)
  })
  it('lays the plan out by place or by type when asked', () => {
    expect(buildExportModel('T', many, { notes: false, amounts: false, by: 'place' }, null).days.map(d => d.heading)).toEqual(['Florence', 'Rome'])
    expect(buildExportModel('T', many, { notes: false, amounts: false, by: 'type' }, null).days.map(d => d.heading)).toEqual(['Transport', 'Stays', 'Food'])
  })
})

describe('files', () => {
  it('writes a Word file whose text is escaped and which opens as a zip with the parts Word needs', async () => {
    const m = buildExportModel('Rome & <Venice>', [I({ title: 'A & B <c>' })], { notes: false, amounts: false }, null)
    expect(docxDocumentXml(m)).toContain('A &amp; B &lt;c&gt;')
    const blob = await buildItineraryDocx(m)
    const JSZip = (await import('jszip')).default
    const z = await JSZip.loadAsync(await blob.arrayBuffer())
    expect(Object.keys(z.files)).toEqual(expect.arrayContaining(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']))
    expect(await z.file('word/document.xml')!.async('string')).toContain('Rome &amp; &lt;Venice&gt;')
  })
  it('puts the description and booking code in the export, the description set apart', async () => {
    const m = buildExportModel('Italy', [I({ id: 'q', title: 'Italo', description: 'Train 9405', booking_ref: 'XK92LM' })], { notes: false, amounts: false }, null)
    expect(m.days[0].entries[0].desc).toBe('Train 9405')
    expect(m.days[0].entries[0].lines).toContain('Booking code: XK92LM')
    const xml = docxDocumentXml(m)
    expect(xml).toMatch(/<w:shd [^>]*w:fill="DDF3EA"\/><\/w:rPr><w:t xml:space="preserve"> Train 9405 </)
  })
  it('lists subtypes to pick from', () => {
    const rows = [I({ id: 'a', title: 'Italo' }), I({ id: 'b', title: 'Hotel', category: 'stay', subtype: 'Hotel' }), I({ id: 'c', title: 'Gelato', category: 'food', subtype: '' })]
    expect(exportChoices(rows, 'kind').map(c => c.label)).toEqual(['Transport · Train', 'Stay · Hotel', 'Food'])
  })
  it('writes a PDF', async () => {
    const m = buildExportModel('Italy', items, { notes: true, amounts: false }, null)
    const buf = new Uint8Array(await (await buildItineraryPdf(m)).arrayBuffer())
    expect(String.fromCharCode(...buf.slice(0, 5))).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(1500)
  })
})
