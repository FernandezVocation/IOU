import { ICONS } from '../lib/groupLook'
import { PICK_ICONS } from '../lib/itineraryIcons'

/** A grid of icons to choose from. `value` is the chosen icon id, or '' for none yet. */
export default function IconPicker({ value, onChange, color = 'currentColor', label }: { value: string; onChange: (id: string) => void; color?: string; label: string }) {
  return (
    <div className="ck-icons" role="group" aria-label={label}>
      {PICK_ICONS.map(id => {
        const d = ICONS.find(x => x.id === id)
        return d ? (
          <button type="button" key={id} className="ck-icopick" aria-pressed={value === id} aria-label={d.label} title={d.label} onClick={() => onChange(id)}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d.svg }} />
          </button>
        ) : null
      })}
    </div>
  )
}
