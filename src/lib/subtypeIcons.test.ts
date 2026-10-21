import { describe, expect, it } from 'vitest'
import { CATEGORIES } from './itinerary'
import { SUBTYPE_ICONS, subtypeIcon } from './subtypeIcons'

describe('subtype icons', () => {
  const quick = CATEGORIES.flatMap(c => c.subs)
  it('every built-in subtype has an icon', () => { for (const s of quick) expect(subtypeIcon(s), s).toBeTruthy() })
  it('every built-in subtype has its own icon, none shared', () => {
    const icons = quick.map(s => subtypeIcon(s))
    expect(new Set(icons).size).toBe(quick.length)
  })
  it('no built-in subtype reuses its category icon', () => {
    for (const c of CATEGORIES) for (const s of c.subs) expect(subtypeIcon(s), s).not.toBe(c.icon)
  })
  it('ignores case and spaces, and understands other names people type', () => {
    expect(subtypeIcon('  FLIGHT ')).toBe(SUBTYPE_ICONS.flight)
    expect(subtypeIcon('Subway')).toBe(SUBTYPE_ICONS.train)
    expect(subtypeIcon('Uber')).toBe(SUBTYPE_ICONS.taxi)
    expect(subtypeIcon('Dinner')).toBe(SUBTYPE_ICONS.restaurant)
    expect(subtypeIcon('Cooking class')).toBe(SUBTYPE_ICONS.class)
  })
  it('falls back (null) for a name it does not know, or none', () => {
    expect(subtypeIcon('Zorbing')).toBeNull()
    expect(subtypeIcon('')).toBeNull()
  })
  it('does not match part of a word', () => { expect(subtypeIcon('Barbecue')).toBeNull() })
})
