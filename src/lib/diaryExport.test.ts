import { describe, expect, it } from 'vitest'
import { buildDiaryDocx, buildDiaryModel, buildDiaryPdf, diaryDocumentXml, diaryFileName, fitEmu, type ExportPhoto } from './diaryExport'
import type { DiaryEntry } from './diary'

const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDKooorzD7g/9k='), c => c.charCodeAt(0))
const photo = (caption = ''): ExportPhoto => ({ data: JPEG, w: 16, h: 12, caption })
const e = (o: Partial<DiaryEntry>): DiaryEntry => ({ id: 'x', itinerary_id: null, group_id: null, title: 't', description: '', place: '', entry_on: '2026-05-01', entry_at: null, people: [], notes: '', shared: false, created_by: 'u', created_at: '2026-05-01T00:00:00Z', ...o })
const names = { trips: { T: 'Italy' }, groups: { G: 'Italy group' } }
const rows = [e({ id: 'b', title: 'Later', entry_on: '2026-05-02', notes: 'door 4321' }), e({ id: 'a', title: 'First', entry_on: '2026-05-01', entry_at: '09:00', place: 'Venice', itinerary_id: 'T', group_id: 'G', people: ['Ann', 'Ed'], description: 'Line one\nLine two' })]

describe('diary export', () => {
  it('orders oldest first and names where each entry belongs', () => {
    const m = buildDiaryModel('My diary', rows, { notes: false, photos: false }, names)
    expect(m.entries.map(x => x.title)).toEqual(['First', 'Later'])
    expect(m.entries[0].where).toBe('Venice · Italy group · Italy')
    expect(m.subtitle).toContain('2 entries')
  })
  it('leaves out notes and photos unless asked', () => {
    const off = buildDiaryModel('D', rows, { notes: false, photos: true }, names, { a: [photo()] })
    expect(JSON.stringify(off.entries.map(x => x.notes))).not.toContain('4321')
    expect(off.entries[0].photos).toHaveLength(1)
    const on = buildDiaryModel('D', rows, { notes: true, photos: false }, names, { a: [photo()] })
    expect(on.entries[1].notes).toBe('door 4321')
    expect(on.entries[0].photos).toHaveLength(0)
  })
  it('fits photos inside the page without stretching', () => {
    const r = fitEmu(4000, 3000)
    expect(r.cy).toBeLessThanOrEqual(3400000); expect(r.cx).toBeLessThanOrEqual(5400000)
    expect(Math.abs(r.cx / r.cy - 4 / 3)).toBeLessThan(0.01)
  })
  it('embeds each photo in the Word file with its own relationship', async () => {
    const m = buildDiaryModel('D', rows, { notes: false, photos: true }, names, { a: [photo('Gondola'), photo()], b: [photo()] })
    const d = diaryDocumentXml(m)
    expect(d.media).toHaveLength(3)
    expect(d.xml).toContain('r:embed="rId100"'); expect(d.xml).toContain('r:embed="rId102"')
    expect(d.xml).toContain('Gondola')
    const JSZip = (await import('jszip')).default
    const z = await JSZip.loadAsync(await (await buildDiaryDocx(m)).arrayBuffer())
    expect(Object.keys(z.files)).toEqual(expect.arrayContaining(['word/media/image1.jpg', 'word/media/image3.jpg']))
    expect(await z.file('word/_rels/document.xml.rels')!.async('string')).toContain('Id="rId102"')
    expect(await z.file('[Content_Types].xml')!.async('string')).toContain('Extension="jpg"')
  })
  it('writes a PDF with photos', async () => {
    const m = buildDiaryModel('D', rows, { notes: true, photos: true }, names, { a: [photo('Cap')] })
    const buf = new Uint8Array(await (await buildDiaryPdf(m)).arrayBuffer())
    expect(String.fromCharCode(...buf.slice(0, 5))).toBe('%PDF-')
    expect(buf.length).toBeGreaterThan(2000)
  })
  it('makes a safe file name', () => { expect(diaryFileName('Italy: diary/2026?', 'pdf')).toBe('Italy-diary2026.pdf'); expect(diaryFileName('???', 'docx')).toBe('diary.docx') })
})
