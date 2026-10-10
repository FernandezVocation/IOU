import { useState } from 'react'
import { getTheme, setTheme, type ThemeMode } from '../lib/theme'

const OPTIONS: Array<[ThemeMode, string]> = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]

/** A quiet one-line control. Auto follows the phone or computer; Light and Dark override it. */
export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(getTheme)
  return (
    <div className="themebar" role="group" aria-label="Appearance">
      <span aria-hidden>Theme</span>
      {OPTIONS.map(([m, l]) => <button key={m} type="button" aria-pressed={mode === m} title={m === 'auto' ? 'Auto follows your phone or computer' : undefined} onClick={() => { setMode(m); setTheme(m) }}>{l}</button>)}
    </div>
  )
}
