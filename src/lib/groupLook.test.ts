import { describe, expect, it } from 'vitest'
import { COLORS, ICONS, contrast, groupLook, hexArgb, iconSvg, tileSvg } from './groupLook'
import { GROUP_KINDS } from './categories'

describe('palette', () => {
  it('has 30 distinct colours', () => {
    expect(COLORS.length).toBe(30)
    expect(new Set(COLORS.map(c => c.toLowerCase())).size).toBe(30)
    for (const c of COLORS) expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })
  it('keeps a white icon readable on every colour (3:1 or better)', () => {
    for (const c of COLORS) expect(contrast(c, '#FFFFFF'), c).toBeGreaterThanOrEqual(3)
  })
  it('keeps every colour visible against the dark theme surface (1.5:1 or better)', () => {
    for (const c of COLORS) expect(contrast(c, '#18201D'), c).toBeGreaterThanOrEqual(1.5)
  })
})

describe('icons', () => {
  it('offers at least 50, each with a unique simple id and a drawing', () => {
    expect(ICONS.length).toBeGreaterThanOrEqual(50)
    expect(new Set(ICONS.map(i => i.id)).size).toBe(ICONS.length)
    for (const i of ICONS) { expect(i.id).toMatch(/^[a-z0-9-]{1,24}$/); expect(i.svg.length).toBeGreaterThan(10) }
  })
  it('falls back to the last icon for an unknown id', () => {
    expect(iconSvg('nope')).toBe(ICONS[ICONS.length - 1].svg)
  })
})

describe('what a group looks like', () => {
  it('uses its own pick when it has one', () => {
    expect(groupLook({ kind: 'Trip', icon: 'camera', color: '#1B3082' })).toEqual({ icon: 'camera', color: '#1B3082' })
  })
  it('defaults by group type, and every built-in type has a default', () => {
    expect(groupLook({ kind: 'Household' }).icon).toBe('home')
    for (const k of GROUP_KINDS) expect(ICONS.some(i => i.id === groupLook({ kind: k }).icon), k).toBe(true)
  })
  it('treats a missing kind as Trip, and a custom type as a neutral folder', () => {
    expect(groupLook({}).icon).toBe('plane')
    expect(groupLook({ kind: 'Book club' }).icon).toBe('folder')
  })
  it('ignores an icon name or colour it does not recognise', () => {
    expect(groupLook({ kind: 'Work', icon: 'zzz', color: 'blue' })).toEqual(groupLook({ kind: 'Work' }))
  })
  it('can draw a standalone tile and give Excel an ARGB colour', () => {
    expect(tileSvg({ icon: 'home', color: '#1E7A42' }, 96)).toContain('fill="#1E7A42"')
    expect(hexArgb('#1e7a42')).toBe('FF1E7A42')
  })
})
