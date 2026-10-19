import { describe, expect, it } from 'vitest'
import { buildExportModel, buildItineraryDocx, buildItineraryPdf, docxDocumentXml, exportFileName } from './itineraryExport'
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
  it('writes a PDF', async () => {
    const m = buildExportModel('Italy', items, { notes: true, amounts: false }, null)
    const buf = new Uint8Array(await (await buildItineraryPdf(m)).arrayBuffer())
    expect(String.fromCharCode(...buf.slice(0, 5))).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(1500)
  })
})
