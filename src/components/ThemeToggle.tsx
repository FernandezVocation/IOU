import { useState } from 'react'
import { getTheme, setTheme, type ThemeMode } from '../lib/theme'

const OPTIONS: Array<[ThemeMode, string]> = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]

/** Auto follows the phone or computer. Light and Dark override it. */
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getTheme)
  return (
    <div>
      <span className="lbl" id="theme-l">Appearance</span>
      <div className="seg" role="group" aria-labelledby="theme-l">
        {OPTIONS.map(([m, l]) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setTheme(m) }}>{l}</button>)}
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>Auto follows your phone or computer.</div>
    </div>
  )
}
