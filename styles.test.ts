// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('stylesheet themes', () => {
  it('has balanced braces (one stray brace silently drops the rules after it)', () => {
    expect((css.match(/\{/g) ?? []).length).toBe((css.match(/\}/g) ?? []).length)
  })
  it('defines the dark palette for the device setting and for the manual Dark choice', () => {
    const dev = css.match(/@media \(prefers-color-scheme:dark\)\{\s*:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/)
    const man = css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/)
    for (const m of [dev, man]) {
      expect(m).not.toBeNull()
      expect(m![1]).toContain('--bg:#0F1513'); expect(m![1]).toContain('--ink:#E8EFEB'); expect(m![1]).toContain('--cl:64%'); expect(m![1]).toContain('color-scheme:dark')
    }
  })
  it('keeps the light palette on :root so Light works whatever the device says', () => {
    expect(css).toMatch(/^:root\{\s*--bg:#F2F4F1/)
    expect(css).toContain(':root[data-theme="light"]{color-scheme:light}')
  })
})
