import { describe, expect, it } from 'vitest'
import { ICONS } from './groupLook'
import { CATEGORIES } from './itinerary'
import { SUBTYPE_ICONS } from './subtypeIcons'
import { PICK_ICONS, buildIconMap, iconKey, resolveGlyph, subtypeHasIcon } from './itineraryIcons'

const svg = (id: string) => ICONS.find(i => i.id === id)!.svg
const custom = CATEGORIES.find(c => c.id === 'custom')!

describe('itinerary icons', () => {
  it('keys names without caring about case or spaces', () => { expect(iconKey('  Visa ')).toBe('visa') })
  it('builds a map from table rows and from shared-link rows', () => {
    const m = buildIconMap([{ kind: 'category', name_key: 'visa', icon: 'passport' }, { kind: 'subtype', name: 'zorbing', icon: 'ball' }, { kind: 'other', name: 'x', icon: 'y' }])
    expect(m).toEqual({ category: { visa: 'passport' }, subtype: { zorbing: 'ball' } })
  })
  it('a custom category shows the icon chosen for its name, else the plain category icon', () => {
    const icons = buildIconMap([{ kind: 'category', name_key: 'visa', icon: 'passport' }])
    expect(resolveGlyph({ category: 'custom', category_label: 'Visa' }, icons)).toBe(svg('passport'))
    expect(resolveGlyph({ category: 'custom', category_label: 'Laundry' }, icons)).toBe(custom.icon)
  })
  it('a custom subtype shows its chosen icon, in any category', () => {
    const icons = buildIconMap([{ kind: 'subtype', name_key: 'zorbing', icon: 'ball' }])
    expect(resolveGlyph({ category: 'activities', subtype: 'Zorbing' }, icons)).toBe(svg('ball'))
    expect(resolveGlyph({ category: 'custom', category_label: 'Fun', subtype: 'zorbing' }, icons)).toBe(svg('ball'))
  })
  it('the subtype icon wins over the custom category icon', () => {
    const icons = buildIconMap([{ kind: 'category', name_key: 'fun', icon: 'star' }, { kind: 'subtype', name_key: 'zorbing', icon: 'ball' }])
    expect(resolveGlyph({ category: 'custom', category_label: 'Fun', subtype: 'Zorbing' }, icons)).toBe(svg('ball'))
    expect(resolveGlyph({ category: 'custom', category_label: 'Fun' }, icons)).toBe(svg('star'))
  })
  it('built-in subtypes keep their own icon, and unknown ones fall back to the category icon', () => {
    expect(resolveGlyph({ category: 'transport', subtype: 'Flight' })).toBe(SUBTYPE_ICONS.flight)
    expect(resolveGlyph({ category: 'activities', subtype: 'Zorbing' })).toBe(CATEGORIES.find(c => c.id === 'activities')!.icon)
  })
  it('ignores a chosen icon id that does not exist', () => {
    expect(resolveGlyph({ category: 'custom', category_label: 'Visa' }, buildIconMap([{ kind: 'category', name_key: 'visa', icon: 'nope' }]))).toBe(custom.icon)
  })
  it('knows which subtypes already have an icon', () => {
    expect(subtypeHasIcon('Hotel')).toBe(true)
    expect(subtypeHasIcon('Zorbing')).toBe(false)
    expect(subtypeHasIcon('Zorbing', buildIconMap([{ kind: 'subtype', name_key: 'zorbing', icon: 'ball' }]))).toBe(true)
  })
  it('every icon offered in the picker exists', () => { for (const id of PICK_ICONS) expect(ICONS.some(i => i.id === id), id).toBe(true) })
})
