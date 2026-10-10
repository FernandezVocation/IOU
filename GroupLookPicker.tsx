import { COLORS, ICONS, groupLook, iconSvg, type Look } from '../lib/groupLook'
import GroupIcon from './GroupIcon'

interface Props {
  kind?: string
  /** What the group has picked so far; null/undefined means "the default for its type". */
  icon?: string | null
  color?: string | null
  onChange: (next: { icon: string; color: string }) => void
  disabled?: boolean
}

/** 100+ icons and 30 colours. Picking either saves both, so the group always has an explicit look afterwards. */
export default function GroupLookPicker({ kind, icon, color, onChange, disabled }: Props) {
  const look: Look = groupLook({ kind, icon, color })
  return (
    <div className="lookpick">
      <div className="prow" style={{ marginTop: 0 }}>
        <GroupIcon look={look} size={48} />
        <span className="muted small">{icon || color ? 'Your pick' : 'Default for this type. Pick an icon or colour to change it.'}</span>
      </div>
      <div className="lbl" id="icon-lbl">Icon</div>
      <div className="swgrid" role="radiogroup" aria-labelledby="icon-lbl">
        {ICONS.map(i => (
          <button type="button" key={i.id} role="radio" aria-checked={look.icon === i.id} aria-label={i.label} title={i.label} disabled={disabled}
            className="sw ic" onClick={() => onChange({ icon: i.id, color: look.color })}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: iconSvg(i.id) }} />
          </button>
        ))}
      </div>
      <div className="lbl" id="color-lbl">Colour</div>
      <div className="swgrid colors" role="radiogroup" aria-labelledby="color-lbl">
        {COLORS.map((c, i) => (
          <button type="button" key={c} role="radio" aria-checked={look.color.toLowerCase() === c.toLowerCase()} aria-label={`Colour ${i + 1}`} disabled={disabled}
            className="sw co" style={{ background: c }} onClick={() => onChange({ icon: look.icon, color: c })} />
        ))}
      </div>
    </div>
  )
}
