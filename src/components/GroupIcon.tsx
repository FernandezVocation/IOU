import { groupLook, iconSvg, type Look } from '../lib/groupLook'

interface G { kind?: string | null; icon?: string | null; color?: string | null }

/** A group's icon on its colour, as a rounded tile. Decorative: the group's name is always shown beside it. */
export default function GroupIcon({ group, look, size = 40 }: { group?: G; look?: Look; size?: number }) {
  const l = look ?? groupLook(group ?? {})
  return (
    <span className="gicon" aria-hidden="true" style={{ width: size, height: size, background: l.color, borderRadius: Math.round(size * 0.25) }}>
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: iconSvg(l.icon) }} />
    </span>
  )
}
