export type ThemeMode = 'auto' | 'light' | 'dark'
const KEY = 'iou_theme'

export function getTheme(): ThemeMode {
  try { const v = localStorage.getItem(KEY); if (v === 'light' || v === 'dark') return v } catch { /* storage blocked */ }
  return 'auto'
}

/** Auto follows the device (no attribute). Light and dark override it. */
export function applyTheme(mode: ThemeMode): void {
  const r = document.documentElement
  if (mode === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', mode)
}

export function setTheme(mode: ThemeMode): void {
  try { if (mode === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode) } catch { /* storage blocked */ }
  applyTheme(mode)
}
