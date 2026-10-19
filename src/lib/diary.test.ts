import { describe, expect, it } from 'vitest'
import { diaryPath, matchDiary, sortDiary, splitPeople, type DiaryEntry } from './diary'

const e = (o: Partial<DiaryEntry>): DiaryEntry => ({ id: 'x', itinerary_id: null, title: 't', description: '', place: '', entry_on: '2026-05-01', entry_at: null, people: [], notes: '', shared: false, created_by: 'u', created_at: '2026-05-01T00:00:00Z', ...o })

describe('diary helpers', () => {
  it('sorts newest day first, then latest time', () => {
    const r = sortDiary([e({ id: 'a', entry_on: '2026-05-01', entry_at: '09:00' }), e({ id: 'b', entry_on: '2026-05-02' }), e({ id: 'c', entry_on: '2026-05-01', entry_at: '18:00' })])
    expect(r.map(x => x.id)).toEqual(['b', 'c', 'a'])
  })
  it('searches title, place, notes and people', () => {
    const rows = [e({ id: 'a', title: 'Gondola' }), e({ id: 'b', place: 'Verona' }), e({ id: 'c', people: ['Ed'] })]
    expect(matchDiary(rows, 'verona').map(x => x.id)).toEqual(['b'])
    expect(matchDiary(rows, 'ed').map(x => x.id)).toEqual(['c'])
    expect(matchDiary(rows, '  ')).toHaveLength(3)
  })
  it('splits people, dropping blanks and duplicates', () => {
    expect(splitPeople('Ann, ed,, ANN , Ed')).toEqual(['Ann', 'ed'])
  })
  it('builds a storage path under the entry id with a safe name', () => {
    expect(diaryPath('E1', 'a b/../c.jpg', 'u')).toBe('E1/u-a b_.._c.jpg')
  })
})
